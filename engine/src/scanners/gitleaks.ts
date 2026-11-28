import type { Severity } from "@openvscan/core";
import { type NormalizedFinding, OUT_DIR, posInt, REPO_DIR, relPath, type ScannerSpec, str } from "./types";

type GitleaksLeak = {
  RuleID?: string;
  Description?: string;
  File?: string;
  StartLine?: number;
  EndLine?: number;
  Fingerprint?: string;
};

export function parseGitleaks(raw: string): NormalizedFinding[] {
  const data = JSON.parse(raw) as GitleaksLeak[] | null;
  return (data ?? []).map((l) => {
    const rule = str(l.RuleID, 100) ?? "secret";
    const file = relPath(l.File);
    return {
      source: "gitleaks" as const,
      ruleId: rule,
      title: `Hard-coded secret: ${str(l.Description, 160) ?? rule}`,
      description:
        "A credential-like value is committed to the repository. Anyone with read access to the repository (or its history) can use it.",
      severity: "high" as Severity,
      filePath: file,
      startLine: posInt(l.StartLine),
      endLine: posInt(l.EndLine),
      cwe: "CWE-798",
      remediation:
        "Revoke and rotate the credential, remove it from the code, and load it from a secret manager or environment variable instead.",
      suggestion: null,
      // The secret itself is redacted by `--redact`; never store it.
      fingerprintKey: `gitleaks|${rule}|${file ?? ""}`,
      metadata: { kind: "secret" },
    };
  });
}

export const gitleaks: ScannerSpec = {
  argv: [
    "gitleaks",
    "dir",
    REPO_DIR,
    // The release's own default rules: a .gitleaks.toml, .gitleaksignore or
    // `gitleaks:allow` comment in the pull request can't hide a secret.
    "--config",
    "/opt/gitleaks.toml",
    "--gitleaks-ignore-path",
    "/opt/openvscan",
    "--ignore-gitleaks-allow",
    "--report-format",
    "json",
    "--report-path",
    `${OUT_DIR}/gitleaks.json`,
    "--redact",
    "--no-banner",
    "--exit-code",
    "0",
    "--log-level",
    "warn",
  ],
  outputPath: `${OUT_DIR}/gitleaks.json`,
  timeoutSec: 300,
  egress: "locked",
  parse: parseGitleaks,
};
