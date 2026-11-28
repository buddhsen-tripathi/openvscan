import { matchesPath, SCANNER_INFO, type Scanner, severityRank } from "@openvscan/core";
import { gitleaks } from "./gitleaks";
import { opengrep } from "./opengrep";
import { osv } from "./osv";
import { trivy } from "./trivy";
import type { NormalizedFinding, ScannerSpec } from "./types";
import { zizmor } from "./zizmor";

export { parseGitleaks } from "./gitleaks";
export { parseOpengrep } from "./opengrep";
export { parseOsv } from "./osv";
export { parseTrivy } from "./trivy";
export * from "./types";
export { parseZizmor } from "./zizmor";

/**
 * Every scanner the engine can run. To add one: a parser and spec in its own
 * file here, its id in `SCANNERS` and an entry in `SCANNER_INFO` (both in
 * @openvscan/core), the binary in container/Dockerfile, and an egress rule
 * if it needs the network.
 */
export const SCANNER_SPECS: Record<Scanner, ScannerSpec> = { opengrep, osv, gitleaks, trivy, zizmor };

/** Hard cap per scanner so a pathological repo can't flood D1 or the PR. */
export const MAX_FINDINGS_PER_SCANNER = 500;

/** Keep the most severe findings when a scanner exceeds the cap. */
export function capFindings(findings: NormalizedFinding[]): NormalizedFinding[] {
  if (findings.length <= MAX_FINDINGS_PER_SCANNER) return findings;
  return [...findings]
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, MAX_FINDINGS_PER_SCANNER);
}

/**
 * Why a scanner can skip this pull request, or null to run it: nothing the
 * PR changed is a file it reads. `changed` is null when the file list is
 * unknown (branch runs), which runs everything.
 */
export function skipReason(name: Scanner, changed: readonly string[] | null): string | null {
  const triggers = SCANNER_INFO[name].triggers;
  // GitHub lists at most 3000 files of a pull request.
  if (!triggers || !changed || changed.length >= 3000) return null;
  if (changed.some((f) => matchesPath(f, triggers))) return null;
  return "No relevant files changed";
}
