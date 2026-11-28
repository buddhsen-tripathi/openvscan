import type { FindingSource, Severity } from "@openvscan/core";

/** Scanner-agnostic finding, before it's tied to a run and the PR diff. */
export interface NormalizedFinding {
  source: FindingSource;
  ruleId: string | null;
  title: string;
  description: string;
  severity: Severity;
  /** Repo-relative path, or null for repo-wide findings. */
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
  cwe: string | null;
  remediation: string | null;
  suggestion: string | null;
  /** Stable identity used to dedupe across runs (no line numbers). */
  fingerprintKey: string;
  metadata: Record<string, unknown>;
}

/**
 * How the engine runs one scanner. The scanner reads attacker-controlled
 * files, so every spec turns off the ways a pull request could configure it:
 * repo config files, ignore files and inline suppression comments.
 */
export interface ScannerSpec {
  /** argv run inside the sandbox; must write JSON to `outputPath`. */
  argv: string[];
  outputPath: string;
  /** Extra env for the command (CA trust etc. is added by the caller). */
  env?: Record<string, string>;
  timeoutSec: number;
  /** Exit codes that mean the scan completed (default: 0 only). */
  okExitCodes?: number[];
  /**
   * Network while it runs: "locked" (none) or "scan" (the OSV API only, see
   * `scanAllowed` in egress-rules.ts).
   */
  egress: "locked" | "scan";
  /** Trusted parser for the (untrusted) JSON the scanner wrote. */
  parse(raw: string): NormalizedFinding[];
}

export const REPO_DIR = "/workspace/repo";
export const OUT_DIR = "/workspace/out";
/**
 * Written by checkout for a pull request: `<head> --not <base parents>`, the
 * git log range of the PR's own commits. Absent for branch runs, Daytona
 * tarball checkouts, or when only the head commit could be fetched.
 */
export const HISTORY_RANGE = "/workspace/.pr-history";

/** Strip the checkout prefix so paths are repo-relative. */
export function relPath(p: unknown): string | null {
  if (typeof p !== "string" || !p) return null;
  let s = p;
  if (s.startsWith(`${REPO_DIR}/`)) s = s.slice(REPO_DIR.length + 1);
  else if (s.startsWith("./")) s = s.slice(2);
  return s.slice(0, 500);
}

export function str(v: unknown, max = 4000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function posInt(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

/** "CWE-79: Improper…" | "CWE-79" | 79 → "CWE-79" */
export function normalizeCwe(v: unknown): string | null {
  const first = Array.isArray(v) ? v[0] : v;
  const m = /CWE-(\d{1,5})/i.exec(String(first ?? ""));
  return m ? `CWE-${m[1]}` : null;
}
