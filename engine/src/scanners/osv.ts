import { normalizeSeverity, type Severity } from "@openvscan/core";
import { type NormalizedFinding, normalizeCwe, OUT_DIR, REPO_DIR, relPath, type ScannerSpec, str } from "./types";

/**
 * OSV-Scanner: known-vulnerable and known-malicious packages in lockfiles,
 * checked against OSV.dev. Only package names, versions and ecosystems are
 * sent (POST /v1/querybatch); the full advisories are then fetched by id.
 */

type OsvEvent = { introduced?: string; fixed?: string; last_affected?: string };
type OsvVuln = {
  id?: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  affected?: { package?: { name?: string; ecosystem?: string }; ranges?: { events?: OsvEvent[] }[] }[];
  database_specific?: { severity?: string; cwe_ids?: string[] };
};
type OsvGroup = { ids?: string[]; aliases?: string[]; max_severity?: string };
type OsvPackage = {
  package?: { name?: string; version?: string; ecosystem?: string };
  vulnerabilities?: OsvVuln[];
  groups?: OsvGroup[];
};
type OsvResult = { source?: { path?: string }; packages?: OsvPackage[] };

/** CVSS base score → severity, per the CVSS v3/v4 qualitative scale. */
function cvssSeverity(score: string | undefined): Severity | null {
  const n = Number.parseFloat(score ?? "");
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 9) return "critical";
  if (n >= 7) return "high";
  if (n >= 4) return "medium";
  return "low";
}

/** Rough version order (numeric segments first); good enough to pick the nearest fix. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(/[^0-9a-z]+/i);
  const pb = b.split(/[^0-9a-z]+/i);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "0";
    const y = pb[i] ?? "0";
    const nx = /^\d+$/.test(x) ? Number(x) : Number.NaN;
    const ny = /^\d+$/.test(y) ? Number(y) : Number.NaN;
    const c = Number.isNaN(nx) || Number.isNaN(ny) ? x.localeCompare(y) : nx - ny;
    if (c !== 0) return c;
  }
  return 0;
}

/** The lowest fixed version above the installed one, across a group's advisories. */
function nearestFix(vulns: OsvVuln[], pkg: string, installed: string): string | null {
  const fixes = new Set<string>();
  for (const v of vulns) {
    for (const a of v.affected ?? []) {
      if (a.package?.name && a.package.name !== pkg) continue;
      for (const r of a.ranges ?? []) {
        for (const e of r.events ?? []) if (e.fixed) fixes.add(e.fixed);
      }
    }
  }
  const above = [...fixes].filter((f) => compareVersions(f, installed) > 0).sort(compareVersions);
  return above[0] ?? null;
}

export function parseOsv(raw: string): NormalizedFinding[] {
  const data = JSON.parse(raw) as { results?: OsvResult[] };
  const out: NormalizedFinding[] = [];
  for (const r of data.results ?? []) {
    const file = relPath(r.source?.path);
    for (const p of r.packages ?? []) {
      const pkg = str(p.package?.name, 200) ?? "package";
      const version = str(p.package?.version, 100) ?? "?";
      const ecosystem = str(p.package?.ecosystem, 50);
      const vulns = p.vulnerabilities ?? [];
      const byId = new Map(vulns.filter((v) => v.id).map((v) => [v.id as string, v]));
      // One finding per group: OSV groups the aliases of one issue (a GHSA,
      // its CVE and the ecosystem's own id).
      const groups: OsvGroup[] = p.groups?.length ? p.groups : vulns.map((v) => ({ ids: v.id ? [v.id] : [] }));
      for (const g of groups) {
        const ids = (g.ids ?? []).filter(Boolean);
        const members = ids.map((id) => byId.get(id)).filter((v): v is OsvVuln => Boolean(v));
        if (!ids.length) continue;
        const malicious = ids.find((id) => id.startsWith("MAL-"));
        // Prefer the id people search for: MAL-, then GHSA, then the first.
        const id = malicious ?? ids.find((i) => i.startsWith("GHSA-")) ?? (ids[0] as string);
        const lead = byId.get(id) ?? members[0];
        const summary = str(members.find((v) => v.summary)?.summary, 160);
        const ghsaSeverity = members.find((v) => v.database_specific?.severity)?.database_specific?.severity;
        const severity: Severity = malicious
          ? "critical"
          : (cvssSeverity(g.max_severity) ??
            (ghsaSeverity ? normalizeSeverity(String(ghsaSeverity).replace(/^moderate$/i, "medium")) : "medium"));
        const fixed = malicious ? null : nearestFix(members, pkg, version);
        const aliases = [...new Set([...ids, ...(g.aliases ?? [])])].filter((a) => a !== id).slice(0, 10);
        out.push({
          source: "osv",
          ruleId: id,
          title: malicious
            ? `Malicious package: ${pkg}@${version}`
            : `${pkg}@${version}: ${summary ?? aliases.find((a) => a.startsWith("CVE-")) ?? id}`,
          description:
            str(lead?.details) ??
            summary ??
            (malicious ? "This package version is known to be malicious." : `${pkg}@${version} is affected by ${id}.`),
          severity,
          filePath: file,
          startLine: null,
          endLine: null,
          cwe: normalizeCwe(members.flatMap((v) => v.database_specific?.cwe_ids ?? [])),
          remediation: malicious
            ? `Remove ${pkg} now, treat any machine that installed it as compromised, and rotate the credentials it could reach.`
            : fixed
              ? `Upgrade ${pkg} to ${fixed} or later.`
              : `No fixed version of ${pkg} is published yet; assess exposure or replace the dependency.`,
          suggestion: null,
          fingerprintKey: `osv|${id}|${pkg}|${file ?? ""}`,
          metadata: {
            kind: "dependency",
            package: pkg,
            installedVersion: version,
            fixedVersion: fixed,
            ecosystem,
            aliases,
            malicious: Boolean(malicious),
            url: `https://osv.dev/vulnerability/${encodeURIComponent(id)}`,
          },
        });
      }
    }
  }
  return out;
}

export const osv: ScannerSpec = {
  argv: [
    "osv-scanner",
    "scan",
    "source",
    "--recursive",
    // Lockfiles only: resolving manifests would call deps.dev, and call
    // analysis would run the repository's build scripts.
    "--no-resolve",
    "--no-call-analysis=all",
    "--allow-no-lockfiles",
    // An empty config: an osv-scanner.toml in the PR can't ignore advisories.
    "--config",
    "/opt/openvscan/osv-scanner.toml",
    "--format",
    "json",
    "--output-file",
    `${OUT_DIR}/osv.json`,
    "--verbosity",
    "error",
    REPO_DIR,
  ],
  outputPath: `${OUT_DIR}/osv.json`,
  timeoutSec: 600,
  // 1 = vulnerabilities found.
  okExitCodes: [0, 1],
  egress: "scan",
  parse: parseOsv,
};
