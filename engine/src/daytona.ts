import { CREDENTIAL_INFO, type CredentialKind } from "@openvscan/core";
import {
  type Box,
  type ExecOptions,
  type ExecResult,
  OUTPUT_CAP,
  shellQuote,
  type TaskState,
  TRIVY_DB_HOSTS,
} from "./box";
import type { EgressPolicy } from "./outbound";

/**
 * Review sandboxes on Daytona (https://daytona.io), driven over its REST
 * API. One sandbox per run, named after the run, created from a snapshot of
 * engine/container/Dockerfile.
 *
 * Two modes:
 * - `hybrid` (any Daytona tier): checkout and scanners run here, and the AI
 *   step runs on Cloudflare behind `Outbound`. Nothing secret enters the
 *   sandbox: the checkout is a short-lived codeload tarball URL and scanners
 *   only read files. Tier 1 and 2 sandboxes have a fixed network allowlist,
 *   which is acceptable because nothing here runs the repository's code.
 * - `full` (Tier 3+, which can change a sandbox's network at any time):
 *   everything runs here. The network is locked per phase like `Outbound`
 *   does, and the agent's credential is a Daytona secret: the sandbox holds a
 *   placeholder that Daytona's egress swaps for the real value, only on
 *   requests to the model API's hosts.
 */

export interface DaytonaSettings {
  apiUrl: string;
  apiKey: string;
  snapshot: string;
  target?: string;
  full: boolean;
}

export function daytonaSettings(env: {
  DAYTONA_API_URL?: string;
  DAYTONA_API_KEY?: string;
  DAYTONA_SNAPSHOT?: string;
  DAYTONA_TARGET?: string;
  DAYTONA_MODE?: string;
}): DaytonaSettings {
  if (!env.DAYTONA_API_KEY) throw new Error("DAYTONA_API_KEY is not set on the engine");
  return {
    apiUrl: (env.DAYTONA_API_URL || "https://app.daytona.io/api").replace(/\/+$/, ""),
    apiKey: env.DAYTONA_API_KEY,
    snapshot: env.DAYTONA_SNAPSHOT || "openvscan-sandbox",
    target: env.DAYTONA_TARGET || undefined,
    full: (env.DAYTONA_MODE ?? "").trim().toLowerCase() === "full",
  };
}

/** Hosts each kind of credential is sent to, and the only ones reachable while the agent runs. */
export const AGENT_HOSTS: Record<CredentialKind, string[]> = {
  claude_oauth_token: ["api.anthropic.com"],
  anthropic_api_key: ["api.anthropic.com"],
  openai_api_key: ["api.openai.com"],
  codex_chatgpt_login: ["chatgpt.com"],
  codex_access_token: ["chatgpt.com", "auth.openai.com"],
  cursor_api_key: ["*.cursor.sh"],
};

/**
 * Split a credential into a part the sandbox may see and the part Daytona
 * keeps. Daytona swaps its placeholder literally, so the CLI must send
 * `visible + placeholder` to get `visible + hidden`. For a JWT the visible
 * part is the header and claims (the CLIs decode them); without the
 * signature it is useless. For an API key it is the well-known prefix.
 */
export function splitCredential(kind: CredentialKind, secret: string): { visible: string; hidden: string } {
  const jwt = /^([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.)([A-Za-z0-9_-]+)$/.exec(secret);
  if (jwt) return { visible: jwt[1], hidden: jwt[2] };
  const prefix = CREDENTIAL_INFO[kind].prefix;
  if (prefix && secret.startsWith(prefix) && secret.length > prefix.length) {
    return { visible: prefix, hidden: secret.slice(prefix.length) };
  }
  return { visible: "", hidden: secret };
}

export interface NetworkSettings {
  networkBlockAll: boolean;
  domainAllowList?: string;
}

/** Full mode: the sandbox network for each egress phase. */
export function networkFor(policy: EgressPolicy): NetworkSettings {
  switch (policy.phase) {
    case "checkout":
      return { networkBlockAll: false, domainAllowList: "codeload.github.com" };
    case "scan":
      return { networkBlockAll: false, domainAllowList: TRIVY_DB_HOSTS.join(",") };
    case "agent":
      return { networkBlockAll: false, domainAllowList: AGENT_HOSTS[policy.kind].join(",") };
    default:
      return { networkBlockAll: true };
  }
}

/**
 * The toolbox runs a command string. Ship argv as base64 so no quoting
 * survives into it, whether or not the toolbox wraps it in a shell.
 */
export function wrapCommand(argv: string[]): string {
  const bytes = new TextEncoder().encode(argv.map(shellQuote).join(" "));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `sh -c 'eval "$(echo ${btoa(bin)} | base64 -d)" </dev/null'`;
}

const PATH_ENV = {
  HOME: "/root",
  PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
};
/** Commands longer than this run detached and are polled (no long-held HTTP request). */
const DIRECT_EXEC_MAX_SEC = 60;
const PENDING = new Set(["creating", "starting", "restoring", "pulling_snapshot", "resuming", "pending_build", "building_snapshot"]);
const FAILED = new Set(["error", "build_failed"]);
const GONE = new Set(["destroyed", "destroying"]);
/** Mounted at creation so secrets can be attached later without a restart. */
const INERT_ENV = "OPENVSCAN_INERT";
const CREDENTIAL_ENV = "OPENVSCAN_CREDENTIAL";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SandboxInfo {
  id: string;
  state: string;
  errorReason?: string;
}

class DaytonaError extends Error {
  constructor(
    readonly status: number,
    what: string,
    body: string,
  ) {
    let detail = body.slice(0, 300);
    try {
      const j = JSON.parse(body) as { message?: unknown };
      if (j.message) detail = String(j.message).slice(0, 300);
    } catch {}
    super(`Daytona ${what} failed (HTTP ${status})${detail ? `: ${detail}` : ""}`);
  }
}

export class DaytonaBox implements Box {
  readonly backend = "daytona" as const;
  private readonly name: string;
  private info: { id: string; toolbox: string } | null = null;

  constructor(
    private readonly cfg: DaytonaSettings,
    private readonly runId: string,
  ) {
    this.name = `openvscan-${runId}`;
  }

  private get secretPrefix() {
    return `ovs-${this.runId}-`;
  }

  /* --------------------------------- HTTP --------------------------------- */

  private async api(method: string, path: string, what: string, body?: unknown): Promise<Response> {
    const res = await fetch(`${this.cfg.apiUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.cfg.apiKey}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok && res.status !== 404) throw new DaytonaError(res.status, what, await res.text());
    return res;
  }

  private async toolbox(path: string, what: string, init: RequestInit = {}): Promise<Response> {
    const { id, toolbox } = await this.ready();
    const res = await fetch(`${toolbox}/${id}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.cfg.apiKey}`, ...(init.headers as Record<string, string>) },
    });
    if (!res.ok) throw new DaytonaError(res.status, what, await res.text());
    return res;
  }

  private async lookup(): Promise<SandboxInfo | null> {
    const res = await this.api("GET", `/sandbox/${this.name}`, "sandbox lookup");
    if (res.status === 404) return null;
    const s = (await res.json()) as SandboxInfo;
    return GONE.has(s.state) ? null : s;
  }

  private async ready(): Promise<{ id: string; toolbox: string }> {
    if (this.info) return this.info;
    const s = await this.lookup();
    if (!s || s.state !== "started") throw new Error("the Daytona sandbox is not running");
    return this.attach(s.id);
  }

  private async attach(id: string) {
    const res = await this.api("GET", `/sandbox/${id}/toolbox-proxy-url`, "toolbox lookup");
    const { url } = (await res.json()) as { url: string };
    this.info = { id, toolbox: url.replace(/\/+$/, "") };
    return this.info;
  }

  /* ------------------------------- Lifecycle ------------------------------ */

  async start(): Promise<{ fresh: boolean }> {
    let s = await this.lookup();
    if (s && (FAILED.has(s.state) || !(s.state === "started" || PENDING.has(s.state)))) {
      // Errored, stopped (auto-deleted on stop) or archived: start over.
      await this.deleteSandbox();
      s = null;
    }
    let fresh = false;
    if (!s) {
      s = await this.create();
      fresh = true;
    }
    for (let i = 0; s.state !== "started"; i++) {
      if (FAILED.has(s.state)) throw new Error(`Daytona sandbox failed to start: ${s.errorReason ?? s.state}`);
      if (i > 120) throw new Error(`Daytona sandbox did not start (state ${s.state})`);
      await sleep(1500);
      const next = await this.lookup();
      if (!next) throw new Error("Daytona sandbox disappeared while starting");
      s = next;
    }
    await this.attach(s.id);
    return { fresh };
  }

  private async create(): Promise<SandboxInfo> {
    let secrets: Record<string, string>[] | undefined;
    if (this.cfg.full) {
      // Daytona only swaps secrets for sandboxes created with at least one.
      const inert = `${this.secretPrefix}inert`;
      await this.api("POST", "/secret", "secret create", {
        name: inert,
        value: crypto.randomUUID(),
        hosts: ["inert.invalid"],
        description: "OpenVScan: placeholder so the run's credential can be attached later",
      }).catch((err) => {
        // Left over from an earlier attempt at this step.
        if (!(err instanceof DaytonaError && err.status === 409)) throw err;
      });
      secrets = [{ [INERT_ENV]: inert }];
    }
    const body = {
      name: this.name,
      snapshot: this.cfg.snapshot,
      user: "root",
      labels: { app: "openvscan", run: this.runId },
      ...(this.cfg.target ? { target: this.cfg.target } : {}),
      // Clean up after ourselves even if the workflow never does: stop after
      // 30 idle minutes, delete on stop, and never outlive 3 hours.
      autoStopInterval: 30,
      autoDeleteInterval: 0,
      ttlMinutes: 180,
      ...(this.cfg.full ? { networkBlockAll: true, secrets } : {}),
    };
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await this.api("POST", "/sandbox", "sandbox create", body);
        return (await res.json()) as SandboxInfo;
      } catch (err) {
        // The previous sandbox of this name may still be shutting down.
        if (!(err instanceof DaytonaError) || err.status !== 409 || attempt >= 10) throw err;
        await sleep(3000);
      }
    }
  }

  private async deleteSandbox(): Promise<void> {
    this.info = null;
    await this.api("DELETE", `/sandbox/${this.name}`, "sandbox delete");
    for (let i = 0; i < 40 && (await this.lookup()); i++) await sleep(1500);
  }

  async destroy(): Promise<void> {
    await this.deleteSandbox();
    if (this.cfg.full) await this.deleteSecrets(() => true);
  }

  /* -------------------------------- Egress -------------------------------- */

  async setEgress(policy: EgressPolicy): Promise<void> {
    if (!this.cfg.full) {
      if (policy.phase === "agent") throw new Error("hybrid mode runs the AI review on Cloudflare, not Daytona");
      // Hybrid: the tier's network allowlist applies; nothing here runs the repo's code.
      return;
    }
    await this.api("POST", `/sandbox/${this.name}/network-settings`, "network update", networkFor(policy));
  }

  async lockEgress(): Promise<void> {
    if (!this.cfg.full) return;
    await this.setEgress({ phase: "locked" });
    // Detach and delete the run's credential, if one was attached.
    const removed = await this.deleteSecrets((name) => !name.endsWith("-inert"));
    if (removed) {
      await this.api("PUT", `/sandbox/${this.name}/secrets`, "secret detach", {
        secrets: [{ [INERT_ENV]: `${this.secretPrefix}inert` }],
      });
    }
  }

  async credentialStandIn(kind: CredentialKind, secret: string): Promise<string> {
    if (!this.cfg.full) throw new Error("hybrid mode runs the AI review on Cloudflare, not Daytona");
    const { visible, hidden } = splitCredential(kind, secret);
    const name = `${this.secretPrefix}${crypto.randomUUID().slice(0, 8)}`;
    const res = await this.api("POST", "/secret", "secret create", {
      name,
      value: hidden,
      hosts: AGENT_HOSTS[kind],
      description: "OpenVScan: model credential for one review run (deleted when the agent stops)",
    });
    const { placeholder } = (await res.json()) as { placeholder: string };
    await this.api("PUT", `/sandbox/${this.name}/secrets`, "secret attach", {
      secrets: [{ [INERT_ENV]: `${this.secretPrefix}inert` }, { [CREDENTIAL_ENV]: name }],
    });
    // Attachments reach Daytona's egress proxy within seconds.
    await sleep(5000);
    return visible + placeholder;
  }

  /** Delete this run's secrets whose name matches; returns how many. */
  private async deleteSecrets(match: (name: string) => boolean): Promise<number> {
    let removed = 0;
    let cursor: string | null = null;
    for (let page = 0; page < 20; page++) {
      const q = new URLSearchParams({ limit: "100", name: this.secretPrefix });
      if (cursor) q.set("cursor", cursor);
      const res = await this.api("GET", `/secret/paginated?${q}`, "secret list");
      if (res.status === 404) break;
      const body = (await res.json()) as { items: { id: string; name: string }[]; nextCursor: string | null };
      for (const s of body.items) {
        if (!s.name.startsWith(this.secretPrefix) || !match(s.name)) continue;
        await this.api("DELETE", `/secret/${s.id}`, "secret delete");
        removed++;
      }
      cursor = body.nextCursor;
      if (!cursor) break;
    }
    return removed;
  }

  /* -------------------------------- Process ------------------------------- */

  async exec(argv: string[], opts: ExecOptions = {}): Promise<ExecResult> {
    if (opts.timeoutSec && opts.timeoutSec > DIRECT_EXEC_MAX_SEC) return this.execDetached(argv, opts);
    const cmd = opts.timeoutSec ? ["timeout", "-k", "15", String(opts.timeoutSec), ...argv] : argv;
    const res = await this.toolbox("/process/execute", "command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        command: wrapCommand(cmd),
        cwd: opts.cwd,
        envs: { ...PATH_ENV, ...opts.env },
        timeout: (opts.timeoutSec ?? DIRECT_EXEC_MAX_SEC) + 30,
      }),
    });
    const out = (await res.json()) as { exitCode: number; result?: string };
    // The toolbox merges stdout and stderr.
    const text = (out.result ?? "").slice(-OUTPUT_CAP);
    return { exitCode: out.exitCode, stdout: text, stderr: text };
  }

  /** Long commands (scanners, checkout): run detached, poll, then read the logs. */
  private async execDetached(argv: string[], opts: ExecOptions): Promise<ExecResult> {
    const timeout = opts.timeoutSec as number;
    const dir = `/tmp/openvscan-exec-${crypto.randomUUID()}`;
    await this.startTask(dir, ["timeout", "-k", "15", String(timeout), ...argv], opts);
    const deadline = Date.now() + (timeout + 60) * 1000;
    let state: TaskState = { state: "running" };
    while (state.state === "running" && Date.now() < deadline) {
      await sleep(3000);
      state = await this.taskState(dir);
    }
    if (state.state !== "exited") {
      await this.killTask(dir).catch(() => {});
      throw new Error(state.state === "running" ? `timed out after ${timeout}s` : "the Daytona sandbox stopped");
    }
    const [stdout, stderr] = await Promise.all([
      this.tail(`${dir}/stdout.log`),
      this.tail(`${dir}/stderr.log`),
    ]);
    await this.exec(["rm", "-rf", dir]).catch(() => {});
    return { exitCode: state.exitCode, stdout, stderr };
  }

  private async tail(path: string): Promise<string> {
    const r = await this.exec(["tail", "-c", String(OUTPUT_CAP), path]);
    return r.exitCode === 0 ? r.stdout : "";
  }

  async startTask(
    dir: string,
    argv: string[],
    opts: { cwd?: string; env?: Record<string, string> } = {},
  ): Promise<void> {
    if (opts.cwd && !(await this.exists(opts.cwd))) {
      throw new Error(`cannot start task: ${opts.cwd} does not exist`);
    }
    await this.exec(["sh", "-c", 'rm -rf "$1" && mkdir -p "$1"', "prep", dir]);
    const launch = await this.exec(["/opt/openvscan/task.sh", dir, ...argv], {
      cwd: opts.cwd,
      env: opts.env,
      timeoutSec: 30,
    });
    if (launch.exitCode !== 0) {
      throw new Error(`cannot start task (exit ${launch.exitCode}): ${launch.stderr.trim().slice(-500) || "no output"}`);
    }
  }

  async taskState(dir: string): Promise<TaskState> {
    const s = await this.lookup();
    if (!s || s.state !== "started") return { state: "lost" };
    const r = await this.exec([
      "sh",
      "-c",
      'code() { [ -f "$1/exit-code" ] && echo "exited $(cat "$1/exit-code")"; }; code "$1" || { [ -f "$1/pid" ] && /opt/openvscan/task-running.sh "$1" && echo running; } || code "$1" || echo lost',
      "state",
      dir,
    ]);
    const m = /(exited (\d+)|running|lost)\s*$/.exec(r.stdout);
    if (m?.[2] !== undefined) return { state: "exited", exitCode: Number.parseInt(m[2], 10) };
    return m?.[1] === "running" ? { state: "running" } : { state: "lost" };
  }

  async killTask(dir: string): Promise<void> {
    await this.exec([
      "sh",
      "-c",
      'read -r pid boot <"$1/pid" 2>/dev/null && kill -TERM -- "-$pid" 2>/dev/null; true',
      "kill",
      dir,
    ]);
  }

  /* --------------------------------- Files -------------------------------- */

  async exists(path: string): Promise<boolean> {
    return (await this.exec(["test", "-e", path])).exitCode === 0;
  }

  async readText(path: string, maxBytes = 16 * 1024 * 1024): Promise<string | null> {
    const st = await this.exec(["stat", "-c", "%s", path]);
    if (st.exitCode !== 0) return null;
    const size = Number.parseInt(st.stdout.trim(), 10);
    if (size > maxBytes) throw new Error(`${path} is ${size} bytes (limit ${maxBytes})`);
    const res = await this.toolbox(`/files/download?${new URLSearchParams({ path })}`, "file download");
    return res.text();
  }

  async writeText(path: string, content: string): Promise<void> {
    const dir = path.slice(0, path.lastIndexOf("/"));
    if (dir) await this.exec(["mkdir", "-p", dir]);
    const form = new FormData();
    form.append("file", new Blob([content]), path.slice(path.lastIndexOf("/") + 1) || "file");
    await this.toolbox(`/files/upload-v2?${new URLSearchParams({ path })}`, "file upload", {
      method: "POST",
      body: form,
    });
  }
}
