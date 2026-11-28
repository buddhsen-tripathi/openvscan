import { normalizeSeverity } from "@openvscan/core";
import { type NormalizedFinding, OUT_DIR, posInt, REPO_DIR, relPath, type ScannerSpec, str } from "./types";

/**
 * Trivy, for infrastructure-as-code only: Dockerfiles, Kubernetes, Helm,
 * Terraform, CloudFormation, Azure ARM. Dependencies are OSV-Scanner's job,
 * so Trivy needs no vulnerability DB and no network: the checks are the ones
 * bundled in the pinned binary.
 */

type TrivyMisconfig = {
  ID?: string;
  AVDID?: string;
  Title?: string;
  Description?: string;
  Message?: string;
  Resolution?: string;
  Severity?: string;
  PrimaryURL?: string;
  Status?: string;
  CauseMetadata?: { StartLine?: number; EndLine?: number };
};
type TrivyResult = { Target?: string; Misconfigurations?: TrivyMisconfig[] };

export function parseTrivy(raw: string): NormalizedFinding[] {
  const data = JSON.parse(raw) as { Results?: TrivyResult[] };
  const out: NormalizedFinding[] = [];
  for (const r of data.Results ?? []) {
    const file = relPath(r.Target);
    for (const m of r.Misconfigurations ?? []) {
      if (m.Status && m.Status !== "FAIL") continue;
      const id = str(m.AVDID ?? m.ID, 100) ?? "misconfig";
      out.push({
        source: "trivy",
        ruleId: id,
        title: str(m.Title, 200) ?? id,
        description: [str(m.Message), str(m.Description)].filter(Boolean).join("\n\n") || id,
        severity: normalizeSeverity(m.Severity),
        filePath: file,
        startLine: posInt(m.CauseMetadata?.StartLine),
        endLine: posInt(m.CauseMetadata?.EndLine),
        cwe: null,
        remediation: str(m.Resolution),
        suggestion: null,
        fingerprintKey: `trivy|${id}|${file ?? ""}`,
        metadata: { kind: "misconfiguration", url: str(m.PrimaryURL, 500) },
      });
    }
  }
  return out;
}

export const trivy: ScannerSpec = {
  argv: [
    "trivy",
    "fs",
    "--scanners",
    "misconfig",
    "--format",
    "json",
    "--output",
    `${OUT_DIR}/trivy.json`,
    // Bundled checks only, and no trivy.yaml / .trivyignore from the PR.
    "--skip-check-update",
    "--config",
    "",
    "--ignorefile",
    "",
    "--no-progress",
    "--quiet",
    "--exit-code",
    "0",
    REPO_DIR,
  ],
  outputPath: `${OUT_DIR}/trivy.json`,
  env: { TRIVY_CACHE_DIR: "/tmp/trivy-cache" },
  timeoutSec: 600,
  egress: "locked",
  parse: parseTrivy,
};
