import { normalizeSeverity, type Scanner, type Severity, severityRank } from "@openvscan/core";
import {
  type NormalizedFinding,
  normalizeCwe,
  OUT_DIR,
  posInt,
  REPO_DIR,
  relPath,
  type ScannerSpec,
  str,
} from "./types";

export * from "./types";

/** Hard cap per scanner so a pathological repo can't flood D1 or the PR. */
export const MAX_FINDINGS_PER_SCANNER = 500;

/* --------------------------------- Trivy --------------------------------- */

type TrivyVuln = {
  VulnerabilityID?: string;
  PkgName?: string;
  InstalledVersion?: string;
  FixedVersion?: string;
  Severity?: string;
  Title?: string;
  Description?: string;
  PrimaryURL?: string;
  CweIDs?: string[];
};
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
type TrivyResult = {
  Target?: string;
  Type?: string;
  Vulnerabilities?: TrivyVuln[];
  Misconfigurations?: TrivyMisconfig[];
};

export function parseTrivy(raw: string): NormalizedFinding[] {
  const data = JSON.parse(raw) as { Results?: TrivyResult[] };
  const out: NormalizedFinding[] = [];
  for (const r of data.Results ?? []) {
    const file = relPath(r.Target);
    for (const v of r.Vulnerabilities ?? []) {
      const id = str(v.VulnerabilityID, 100) ?? "unknown";
      const pkg = str(v.PkgName, 200) ?? "package";
      const fixed = str(v.FixedVersion, 200);
      out.push({
        source: "trivy",
        ruleId: id,
        title: `${pkg}@${v.InstalledVersion ?? "?"}: ${str(v.Title, 160) ?? id}`,
        description: str(v.Description) ?? id,
        severity: normalizeSeverity(v.Severity),
        filePath: file,
        startLine: null,
        endLine: null,
        cwe: normalizeCwe(v.CweIDs),
        remediation: fixed
          ? `Upgrade ${pkg} to ${fixed} or later.`
          : `No fixed version of ${pkg} is published yet; assess exposure or replace the dependency.`,
        suggestion: null,
        fingerprintKey: `trivy|${id}|${pkg}|${file ?? ""}`,
        metadata: {
          kind: "dependency",
          package: pkg,
          installedVersion: v.InstalledVersion ?? null,
          fixedVersion: fixed,
          ecosystem: r.Type ?? null,
          url: str(v.PrimaryURL, 500),
        },
      });
    }
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

/* -------------------------------- Gitleaks ------------------------------- */

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

/* -------------------------------- Opengrep ------------------------------- */

type OpengrepResult = {
  check_id?: string;
  path?: string;
  start?: { line?: number };
  end?: { line?: number };
  extra?: {
    message?: string;
    severity?: string;
    fix?: string;
    metadata?: {
      category?: string;
      cwe?: string | string[];
      confidence?: string;
      impact?: string;
      likelihood?: string;
      references?: string[];
      owasp?: string | string[];
    };
  };
};

const OPENGREP_SEVERITY: Record<string, Severity> = {
  ERROR: "high",
  WARNING: "medium",
  INFO: "low",
};

export function parseOpengrep(raw: string): NormalizedFinding[] {
  const data = JSON.parse(raw) as { results?: OpengrepResult[] };
  // Several rules often fire on the same line (e.g. 4 SQL-injection variants).
  // Group by file+line+CWE and keep the most severe, listing the others.
  const groups = new Map<string, NormalizedFinding>();
  for (const r of data.results ?? []) {
    const meta = r.extra?.metadata ?? {};
    // Security rules only; best-practice/correctness noise is not our job.
    if (meta.category !== "security") continue;
    const ruleId = String(r.check_id ?? "").replace(/^.*?opengrep-rules\./, "");
    // The rules pack ships gitleaks ports; Gitleaks itself covers secrets.
    if (ruleId.startsWith("generic.secrets.gitleaks.")) continue;

    const file = relPath(r.path);
    const line = posInt(r.start?.line);
    const cwe = normalizeCwe(meta.cwe);
    let severity = OPENGREP_SEVERITY[String(r.extra?.severity).toUpperCase()] ?? "low";
    if (
      severity === "high" &&
      String(meta.impact).toUpperCase() === "HIGH" &&
      String(meta.likelihood).toUpperCase() === "HIGH"
    ) {
      severity = "critical";
    }
    const message = str(r.extra?.message) ?? ruleId;
    const shortRule = ruleId.split(".").pop() ?? ruleId;
    const f: NormalizedFinding = {
      source: "opengrep",
      ruleId,
      title: `${humanize(shortRule)}${cwe ? ` (${cwe})` : ""}`.slice(0, 200),
      description: message,
      severity,
      filePath: file,
      startLine: line,
      endLine: posInt(r.end?.line),
      cwe,
      remediation: null,
      suggestion: null,
      fingerprintKey: `opengrep|${cwe ?? ruleId}|${file ?? ""}`,
      metadata: {
        kind: "sast",
        confidence: meta.confidence ?? null,
        references: (meta.references ?? []).slice(0, 5),
        rules: [ruleId],
      },
    };
    const key = `${file}|${line}|${vulnClass(ruleId, cwe)}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, f);
    } else {
      const rules = existing.metadata.rules as string[];
      if (!rules.includes(ruleId)) rules.push(ruleId);
      if (severityRank(f.severity) < severityRank(existing.severity)) {
        f.metadata.rules = rules;
        groups.set(key, f);
      }
    }
  }
  return [...groups.values()];
}

/**
 * Coarse vulnerability class used to merge overlapping rules. Rule names are
 * more reliable than CWE tags here (some packs tag SQLi as CWE-704/915).
 */
function vulnClass(ruleId: string, cwe: string | null): string {
  const r = ruleId.toLowerCase();
  if (/sql/.test(r)) return "sqli";
  if (/xss|html|response-write|template/.test(r)) return "xss";
  if (/subprocess|command|shell|os-system|child-process/.test(r)) return "cmdi";
  if (/eval|code-string|exec-detected/.test(r)) return "code-injection";
  if (/ssrf/.test(r)) return "ssrf";
  if (/path-traversal|path-join/.test(r)) return "path-traversal";
  return cwe ?? ruleId;
}

function humanize(slug: string): string {
  const s = slug.replace(/[-_]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ------------------------------- Registry -------------------------------- */

export const SCANNER_SPECS: Record<Scanner, ScannerSpec> = {
  trivy: {
    // Dependencies + IaC. `--skip-check-update` uses the checks bundled in
    // the binary; the vuln DB refreshes through egress if stale (see the
    // workflow's offline fallback).
    argv: [
      "trivy",
      "fs",
      "--format",
      "json",
      "--output",
      `${OUT_DIR}/trivy.json`,
      "--scanners",
      "vuln,misconfig",
      "--skip-check-update",
      "--skip-java-db-update",
      "--no-progress",
      "--quiet",
      "--exit-code",
      "0",
      REPO_DIR,
    ],
    outputPath: `${OUT_DIR}/trivy.json`,
    env: { TRIVY_CACHE_DIR: "/opt/trivy-cache" },
    timeoutSec: 600,
    parse: parseTrivy,
  },
  opengrep: {
    argv: [
      "opengrep",
      "scan",
      "--config",
      "/opt/opengrep-rules",
      "--json",
      "--output",
      `${OUT_DIR}/opengrep.json`,
      "--disable-version-check",
      "--quiet",
      "--timeout",
      "30",
      "--max-target-bytes",
      "1000000",
      REPO_DIR,
    ],
    outputPath: `${OUT_DIR}/opengrep.json`,
    timeoutSec: 900,
    parse: parseOpengrep,
  },
  gitleaks: {
    argv: [
      "gitleaks",
      "dir",
      REPO_DIR,
      "--config",
      "/opt/gitleaks.toml",
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
    parse: parseGitleaks,
  },
};

/** Keep the most severe findings when a scanner exceeds the cap. */
export function capFindings(findings: NormalizedFinding[]): NormalizedFinding[] {
  if (findings.length <= MAX_FINDINGS_PER_SCANNER) return findings;
  return [...findings]
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, MAX_FINDINGS_PER_SCANNER);
}
