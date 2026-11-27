import type { CredentialKind } from "@openvscan/core";
import type { EgressPolicy } from "./outbound";

/**
 * A review sandbox, whichever backend runs it: a Cloudflare container
 * (`ScanSandbox`) or a Daytona sandbox (`DaytonaBox`). The workflow only
 * talks to this interface.
 */
export interface Box {
  readonly backend: "cloudflare" | "daytona";
  /** Boot (idempotent). `fresh` when this call created it. */
  start(): Promise<{ fresh: boolean }>;
  setEgress(policy: EgressPolicy): Promise<void>;
  lockEgress(): Promise<void>;
  exec(argv: string[], opts?: ExecOptions): Promise<ExecResult>;
  readText(path: string, maxBytes?: number): Promise<string | null>;
  writeText(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  startTask(dir: string, argv: string[], opts?: { cwd?: string; env?: Record<string, string> }): Promise<void>;
  taskState(dir: string): Promise<TaskState>;
  killTask(dir: string): Promise<void>;
  /**
   * Hand the sandbox a stand-in for `secret` that the backend's egress swaps
   * back. Null when the backend uses the fixed placeholders of `Outbound`.
   */
  credentialStandIn(kind: CredentialKind, secret: string): Promise<string | null>;
  destroy(): Promise<void>;
}

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutSec?: number;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type TaskState =
  | { state: "none" }
  | { state: "running" }
  | { state: "exited"; exitCode: number }
  | { state: "lost" };

/** Written by checkout; its absence means the sandbox lost the repository. */
export const CHECKOUT_MARKER = "/workspace/.checkout";

/** Hosts Trivy fetches its vulnerability DB from (OCI artifacts, GET only). */
export const TRIVY_DB_HOSTS = ["mirror.gcr.io", "ghcr.io", "pkg-containers.githubusercontent.com"];

/** Keep the tail of long command output; use files for data. */
export const OUTPUT_CAP = 64 * 1024;

export type SandboxProvider = "cloudflare" | "daytona";
export type DaytonaMode = "hybrid" | "full";

export interface SandboxConfig {
  provider: SandboxProvider;
  /** Daytona only: `hybrid` runs the AI step on Cloudflare. */
  mode: DaytonaMode;
}

/**
 * Which backend runs review sandboxes. `SANDBOX_PROVIDER` picks one; left
 * empty, a deployment with a `DAYTONA_API_KEY` uses Daytona and any other
 * uses Cloudflare Containers.
 */
export function sandboxConfig(env: {
  SANDBOX_PROVIDER?: string;
  DAYTONA_MODE?: string;
  DAYTONA_API_KEY?: string;
}): SandboxConfig {
  const asked = (env.SANDBOX_PROVIDER ?? "").trim().toLowerCase();
  if (asked && asked !== "cloudflare" && asked !== "daytona") {
    throw new Error(`SANDBOX_PROVIDER must be "cloudflare" or "daytona", not "${asked}"`);
  }
  const provider: SandboxProvider = asked ? (asked as SandboxProvider) : env.DAYTONA_API_KEY ? "daytona" : "cloudflare";
  if (provider === "daytona" && !env.DAYTONA_API_KEY) {
    throw new Error("SANDBOX_PROVIDER is daytona but DAYTONA_API_KEY is not set");
  }
  const mode = (env.DAYTONA_MODE ?? "").trim().toLowerCase();
  if (mode && mode !== "hybrid" && mode !== "full") {
    throw new Error(`DAYTONA_MODE must be "hybrid" or "full", not "${mode}"`);
  }
  return { provider, mode: mode === "full" ? "full" : "hybrid" };
}

/** Quote one argument for a POSIX shell. */
export function shellQuote(arg: string): string {
  return /^[A-Za-z0-9_./=:@%+,-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}
