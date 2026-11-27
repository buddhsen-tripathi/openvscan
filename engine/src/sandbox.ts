import { Files, SandboxFileError } from "@cloudflare/sandbox";
import { DurableObject } from "cloudflare:workers";
import { type Box, type ExecOptions, type ExecResult, OUTPUT_CAP, sandboxConfig, type TaskState } from "./box";
import { DaytonaBox, daytonaSettings } from "./daytona";
import type { EgressPolicy } from "./outbound";

/**
 * One isolated Linux sandbox per review run (`SANDBOX.getByName(runId)`).
 *
 * The Durable Object owns the container's lifecycle and its egress policy;
 * the workflow drives it through these RPC methods. The container starts
 * with no internet access and every HTTP(S) request is routed through the
 * `Outbound` entrypoint with the current phase's policy as props.
 */

const CA_PATH = "/etc/cloudflare/certs/cloudflare-containers-ca.crt";
/** Trust the egress proxy's CA (every HTTPS request is intercepted). */
const TRUST_ENV: Record<string, string> = {
  NODE_EXTRA_CA_CERTS: CA_PATH,
  GIT_SSL_CAINFO: CA_PATH,
  CURL_CA_BUNDLE: CA_PATH,
  SSL_CERT_FILE: CA_PATH,
  HOME: "/root",
  PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
};

const INACTIVITY_MS = 20 * 60 * 1000;
const KEEPALIVE_MS = 60 * 1000;
const TASK_KEY = "task-dir";

/** The Cloudflare sandbox of one run (or dev session), addressed by name. */
export function sandboxFor(env: Env, name: string): DurableObjectStub<ScanSandbox> {
  return (env.SANDBOX as DurableObjectNamespace<ScanSandbox>).getByName(name);
}

/** A Cloudflare container sandbox behind the backend-neutral `Box` interface. */
export function cloudflareBox(env: Env, name: string): Box {
  const stub = () => sandboxFor(env, name);
  return {
    backend: "cloudflare",
    start: () => stub().start(),
    setEgress: (p) => stub().setEgress(p),
    lockEgress: () => stub().lockEgress(),
    exec: (argv, opts) => stub().exec(argv, opts),
    readText: (path, max) => stub().readText(path, max),
    writeText: (path, content) => stub().writeText(path, content),
    exists: (path) => stub().exists(path),
    startTask: (dir, argv, opts) => stub().startTask(dir, argv, opts),
    taskState: (dir) => stub().taskState(dir),
    killTask: (dir) => stub().killTask(dir),
    // `Outbound` swaps fixed placeholders; nothing to set up per run.
    credentialStandIn: async () => null,
    destroy: () => stub().destroy(),
  };
}

/**
 * The sandboxes of one run: `scan` for checkout and scanners, `agent` for
 * the AI review. They are the same sandbox except in Daytona's hybrid mode,
 * where scanners run on Daytona and the agent on Cloudflare.
 */
export function runBoxes(env: Env, runId: string): { scan: Box; agent: Box; all: Box[] } {
  const cfg = sandboxConfig(env);
  if (cfg.provider === "cloudflare") {
    const box = cloudflareBox(env, runId);
    return { scan: box, agent: box, all: [box] };
  }
  const daytona = new DaytonaBox(daytonaSettings(env), runId);
  if (cfg.mode === "full") return { scan: daytona, agent: daytona, all: [daytona] };
  const cf = cloudflareBox(env, runId);
  return { scan: daytona, agent: cf, all: [daytona, cf] };
}

export class ScanSandbox extends DurableObject<Env> {
  private readonly files: Files;
  private setup: Promise<void> | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const container = ctx.container;
    if (!container) throw new Error("ScanSandbox: no container configured");
    this.files = new Files(container);
    if (container.running) {
      // A deploy restarts the DO but not the container. Interception rules
      // belong to the container and survive; only the timeout is per-DO.
      void ctx.blockConcurrencyWhile(() => container.setInactivityTimeout(INACTIVITY_MS));
    }
  }

  private get container(): Container {
    return this.ctx.container as Container;
  }

  private async applyEgress(policy: EgressPolicy): Promise<void> {
    const outbound = this.ctx.exports.Outbound({ props: policy });
    await this.container.interceptAllOutboundHttp(outbound);
    await this.container.interceptOutboundHttps("*", outbound);
  }

  /** Boot the container (idempotent) with egress locked down. */
  async start(): Promise<{ fresh: boolean }> {
    const instance = this.env.SANDBOX_INSTANCE || "standard-2";
    let fresh = false;
    if (!this.setup || !this.container.running) {
      fresh = !this.container.running;
      this.setup = this.boot(instance).catch((err) => {
        this.setup = undefined;
        throw err;
      });
    }
    await this.setup;
    return { fresh };
  }

  private async boot(instance: string): Promise<void> {
    const fresh = !this.container.running;
    if (fresh) {
      this.ctx.storage.kv.delete(TASK_KEY);
      this.container.start({
        image: this.container.images.scanner,
        instance: instance as "standard-2",
        enableInternet: false,
      });
    }
    try {
      // Register on every boot (rules end with the container). A running
      // container keeps its current rules, so don't downgrade them here.
      if (fresh) await this.applyEgress({ phase: "locked" });
      await this.container.setInactivityTimeout(INACTIVITY_MS);
    } catch (err) {
      await this.container.destroy();
      throw err;
    }
  }

  /**
   * Switch the egress policy. A policy may carry a secret (clone token,
   * model credential): it lives only in the runtime's interception props —
   * never in DO storage or the container — and is replaced by `locked` as
   * soon as the phase ends.
   */
  async setEgress(policy: EgressPolicy): Promise<void> {
    await this.applyEgress(policy);
  }

  async lockEgress(): Promise<void> {
    await this.setEgress({ phase: "locked" });
  }

  /** Run a command to completion. Output is truncated; use files for data. */
  async exec(argv: string[], opts: ExecOptions = {}): Promise<ExecResult> {
    const cmd = opts.timeoutSec
      ? ["timeout", "-k", "15", String(opts.timeoutSec), ...argv]
      : argv;
    const proc = await this.container.exec(cmd, {
      cwd: opts.cwd,
      env: { ...TRUST_ENV, ...opts.env },
    });
    const out = await proc.output();
    const dec = new TextDecoder();
    const clip = (b: ArrayBuffer) => {
      const s = dec.decode(b.byteLength > OUTPUT_CAP ? b.slice(b.byteLength - OUTPUT_CAP) : b);
      return s;
    };
    return { exitCode: out.exitCode, stdout: clip(out.stdout), stderr: clip(out.stderr) };
  }

  /** Read a text file, or null when missing. Rejects files over `maxBytes`. */
  async readText(path: string, maxBytes = 16 * 1024 * 1024): Promise<string | null> {
    try {
      const st = await this.files.stat(path);
      if (st.size > BigInt(maxBytes)) {
        throw new Error(`${path} is ${st.size} bytes (limit ${maxBytes})`);
      }
      return await (await this.files.readFile(path)).text();
    } catch (err) {
      if (SandboxFileError.is(err) && err.code === "ENOENT") return null;
      throw err;
    }
  }

  async writeText(path: string, content: string): Promise<void> {
    const dir = path.slice(0, path.lastIndexOf("/"));
    if (dir) await this.files.mkdir(dir, { recursive: true });
    await this.files.writeFile(path, content);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.files.stat(path);
      return true;
    } catch (err) {
      if (SandboxFileError.is(err) && err.code === "ENOENT") return false;
      throw err;
    }
  }

  /**
   * Start a long-running command detached from this request (the coding
   * agent). Output goes to files in `dir`; poll with `taskState`. An alarm
   * keeps the container alive while it runs.
   */
  async startTask(
    dir: string,
    argv: string[],
    opts: { cwd?: string; env?: Record<string, string> } = {},
  ): Promise<void> {
    if (opts.cwd && !(await this.exists(opts.cwd))) {
      throw new Error(`cannot start task: ${opts.cwd} does not exist`);
    }
    await this.files.remove(dir, { recursive: true, force: true });
    await this.files.mkdir(dir, { recursive: true });
    // task.sh returns once the detached runner has written its pid, so a
    // launch failure surfaces here rather than as a task that never ends.
    const launch = await this.exec(["/opt/openvscan/task.sh", dir, ...argv], {
      cwd: opts.cwd,
      env: opts.env,
      timeoutSec: 30,
    });
    if (launch.exitCode !== 0) {
      throw new Error(
        `cannot start task (exit ${launch.exitCode}): ${launch.stderr.trim().slice(-500) || "no output"}`,
      );
    }
    this.ctx.storage.kv.put(TASK_KEY, dir);
    await this.ctx.storage.setAlarm(Date.now() + KEEPALIVE_MS);
  }

  async taskState(dir: string): Promise<TaskState> {
    if (!this.container.running) {
      return this.ctx.storage.kv.get(TASK_KEY) === dir ? { state: "lost" } : { state: "none" };
    }
    const code = await this.readText(`${dir}/exit-code`, 64);
    if (code != null) return { state: "exited", exitCode: Number.parseInt(code, 10) };
    if (!(await this.exists(`${dir}/pid`))) {
      // startTask waits for the pid file, so a started task without one was
      // lost (e.g. the container was replaced and the dir recreated).
      return this.ctx.storage.kv.get(TASK_KEY) === dir ? { state: "lost" } : { state: "none" };
    }
    const probe = await this.exec(["/opt/openvscan/task-running.sh", dir]);
    if (probe.exitCode === 0) return { state: "running" };
    const late = await this.readText(`${dir}/exit-code`, 64);
    if (late != null) return { state: "exited", exitCode: Number.parseInt(late, 10) };
    return { state: "lost" };
  }

  /** Kill whatever the task started (its whole process group). */
  async killTask(dir: string): Promise<void> {
    if (!this.container.running) return;
    await this.exec([
      "sh",
      "-c",
      'read -r pid boot <"$1/pid" 2>/dev/null && kill -TERM -- "-$pid" 2>/dev/null; true',
      "kill",
      dir,
    ]);
  }

  async alarm(): Promise<void> {
    const dir = this.ctx.storage.kv.get(TASK_KEY) as string | undefined;
    if (!dir || !this.container.running) return;
    const s = await this.taskState(dir);
    if (s.state === "running") {
      await this.ctx.storage.setAlarm(Date.now() + KEEPALIVE_MS);
    } else {
      this.ctx.storage.kv.delete(TASK_KEY);
    }
  }

  /** Tear down the container and forget all state (incl. any secret policy). */
  async destroy(): Promise<void> {
    this.setup = undefined;
    await this.ctx.storage.deleteAlarm();
    this.ctx.storage.kv.delete(TASK_KEY);
    if (this.container.running) await this.container.destroy();
  }
}
