import { execFileSync } from "node:child_process";
import { CREDENTIAL_KINDS } from "@openvscan/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sandboxConfig } from "../src/box";
import { AGENT_HOSTS, DaytonaBox, networkFor, splitCredential, wrapCommand } from "../src/daytona";

describe("sandboxConfig", () => {
  it("defaults to Daytona hybrid when a key is set, else Cloudflare", () => {
    expect(sandboxConfig({ DAYTONA_API_KEY: "k" })).toEqual({ provider: "daytona", mode: "hybrid" });
    expect(sandboxConfig({})).toEqual({ provider: "cloudflare", mode: "hybrid" });
    expect(sandboxConfig({ SANDBOX_PROVIDER: "", DAYTONA_API_KEY: "" }).provider).toBe("cloudflare");
  });

  it("lets the operator pick, and rejects nonsense", () => {
    expect(sandboxConfig({ SANDBOX_PROVIDER: "cloudflare", DAYTONA_API_KEY: "k" }).provider).toBe("cloudflare");
    expect(sandboxConfig({ DAYTONA_API_KEY: "k", DAYTONA_MODE: "full" }).mode).toBe("full");
    expect(() => sandboxConfig({ SANDBOX_PROVIDER: "daytona" })).toThrow(/DAYTONA_API_KEY/);
    expect(() => sandboxConfig({ SANDBOX_PROVIDER: "e2b" })).toThrow(/SANDBOX_PROVIDER/);
    expect(() => sandboxConfig({ DAYTONA_API_KEY: "k", DAYTONA_MODE: "partial" })).toThrow(/DAYTONA_MODE/);
  });
});

describe("wrapCommand", () => {
  it("round-trips any argv through a shell, whether or not the toolbox adds one", () => {
    const argv = ["printf", "%s|", "it's", 'a "quoted" $HOME', "back\\slash", "ünïcode", "`id`", ""];
    const cmd = wrapCommand(argv);
    expect(cmd).not.toContain("it's");
    const viaShell = execFileSync("sh", ["-c", cmd], { encoding: "utf8" });
    expect(viaShell).toBe("it's|a \"quoted\" $HOME|back\\slash|ünïcode|`id`||");
  });

  it("does not let a command read the rest of the script from stdin", () => {
    const out = execFileSync("sh", ["-c", wrapCommand(["sh", "-c", "cat; echo done"])], { encoding: "utf8" });
    expect(out).toBe("done\n");
  });
});

describe("splitCredential", () => {
  it("keeps only the signature of a JWT out of the sandbox", () => {
    const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjF9.c2lnbmF0dXJl";
    expect(splitCredential("cursor_api_key", jwt)).toEqual({
      visible: "eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjF9.",
      hidden: "c2lnbmF0dXJl",
    });
  });

  it("keeps a known key prefix visible and nothing else", () => {
    expect(splitCredential("anthropic_api_key", "sk-ant-api03-SECRET")).toEqual({
      visible: "sk-ant-api",
      hidden: "03-SECRET",
    });
    expect(splitCredential("codex_access_token", "at-SECRET")).toEqual({ visible: "at-", hidden: "SECRET" });
    expect(splitCredential("anthropic_api_key", "weird-key")).toEqual({ visible: "", hidden: "weird-key" });
  });

  it("always hides the secret part", () => {
    for (const kind of CREDENTIAL_KINDS) {
      const { visible, hidden } = splitCredential(kind, "sk-ant-oat01-abcdefSECRET");
      expect(visible + hidden).toBe("sk-ant-oat01-abcdefSECRET");
      expect(hidden).toContain("SECRET");
    }
  });
});

describe("networkFor", () => {
  it("blocks everything outside the phase's hosts", () => {
    expect(networkFor({ phase: "locked" })).toEqual({ networkBlockAll: true });
    expect(networkFor({ phase: "checkout", repo: "a/b", githubToken: "" }).domainAllowList).toBe("codeload.github.com");
    expect(networkFor({ phase: "scan" }).domainAllowList).toContain("mirror.gcr.io");
    for (const kind of CREDENTIAL_KINDS) {
      const n = networkFor({ phase: "agent", kind, secret: "s" });
      expect(n).toEqual({ networkBlockAll: false, domainAllowList: AGENT_HOSTS[kind].join(",") });
      expect(n.domainAllowList).not.toMatch(/github/);
    }
  });
});

describe("DaytonaBox", () => {
  afterEach(() => vi.unstubAllGlobals());

  const cfg = { apiUrl: "https://daytona.test/api", apiKey: "dtn_key", snapshot: "snap", full: false };

  it("creates a self-cleaning sandbox from the snapshot and runs commands through the toolbox", async () => {
    const calls: { method: string; url: string; body?: unknown }[] = [];
    let created = false;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ method, url, body });
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer dtn_key");
      if (url.endsWith("/sandbox/openvscan-run1") && method === "GET") {
        return created ? Response.json({ id: "sb-1", state: "started" }) : new Response("", { status: 404 });
      }
      if (url.endsWith("/sandbox") && method === "POST") {
        created = true;
        return Response.json({ id: "sb-1", state: "creating" });
      }
      if (url.endsWith("/sandbox/sb-1/toolbox-proxy-url")) return Response.json({ url: "https://proxy.test/toolbox" });
      if (url === "https://proxy.test/toolbox/sb-1/process/execute") {
        return Response.json({ exitCode: 0, result: "hello\n" });
      }
      return new Response("unexpected", { status: 500 });
    });

    const box = new DaytonaBox(cfg, "run1");
    expect(await box.start()).toEqual({ fresh: true });
    const create = calls.find((c) => c.method === "POST" && c.url.endsWith("/sandbox"))?.body as Record<string, unknown>;
    expect(create).toMatchObject({ name: "openvscan-run1", snapshot: "snap", autoDeleteInterval: 0, user: "root" });
    // Hybrid leaves the tier's network alone and mounts no secrets.
    expect(create).not.toHaveProperty("networkBlockAll");
    expect(create).not.toHaveProperty("secrets");

    const r = await box.exec(["echo", "hello"], { cwd: "/workspace", env: { A: "1" } });
    expect(r).toEqual({ exitCode: 0, stdout: "hello\n", stderr: "hello\n" });
    const exec = calls.at(-1)?.body as Record<string, unknown>;
    expect(exec.cwd).toBe("/workspace");
    expect(exec.envs).toMatchObject({ A: "1" });
    expect(exec.command).toBe(wrapCommand(["echo", "hello"]));

    await expect(box.setEgress({ phase: "agent", kind: "anthropic_api_key", secret: "x" })).rejects.toThrow(/hybrid/);
    await expect(box.credentialStandIn("anthropic_api_key", "x")).rejects.toThrow(/hybrid/);
  });
});
