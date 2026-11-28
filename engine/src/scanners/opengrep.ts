import { type Severity, severityRank } from "@openvscan/core";
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

/**
 * OpenGrep (the open-source Semgrep fork) with about 980 rules curated at
 * image build time from five open-source packs: see container/rules. The
 * rules are split by language, and only the languages in the checkout load.
 */

/** Rule directories under /opt/opengrep-rules (rules/curate.py, LANGUAGE_DIR). */
const LANGUAGE_DIRS =
  "apex|bash|c|clojure|csharp|elixir|go|html|js|jvm|ocaml|other|php|python|ruby|rust|solidity|swift";
const RULES_PREFIX = new RegExp(`^.*?opengrep-rules\\.(?:(?:${LANGUAGE_DIRS})\\.)?`);

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
      subcategory?: string | string[];
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
    // The image's rules are curated already (rules/curate.py); this repeats
    // the filter in case a rules directory is swapped in. Security rules
    // only, and not audit-only or low-confidence ones.
    if (meta.category && meta.category !== "security") continue;
    const subs = [meta.subcategory ?? []].flat().map((s) => String(s).toLowerCase());
    if (subs.includes("audit") && !subs.includes("vuln")) continue;
    if (String(meta.confidence).toUpperCase() === "LOW") continue;
    // "<pack>.<path>.<id>", relative to the language's rules directory.
    const ruleId = String(r.check_id ?? "").replace(RULES_PREFIX, "");
    // Some packs ship gitleaks ports; Gitleaks itself covers secrets.
    if (/(^|\.)secrets\.gitleaks\./.test(ruleId)) continue;

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

/** Generated, vendored and test code: findings there are almost never exploitable. */
const EXCLUDE = [
  "node_modules",
  "vendor",
  "third_party",
  "dist",
  "test",
  "tests",
  "__tests__",
  "spec",
  "testdata",
  "fixtures",
  "*.test.*",
  "*.spec.*",
  "*_test.go",
  "test_*.py",
  "*_test.py",
];

export const opengrep: ScannerSpec = {
  argv: [
    "sh",
    "-c",
    // One --config per language present (plus "other", rules for any file).
    `set -e
repo="$1" out="$2"; shift 2
cfg=""
for d in $(/opt/openvscan/languages.sh "$repo") other; do
  if [ -d "/opt/opengrep-rules/$d" ]; then cfg="$cfg --config /opt/opengrep-rules/$d"; fi
done
if [ -z "$cfg" ]; then echo '{"results":[],"errors":[]}' >"$out"; exit 0; fi
exec opengrep scan $cfg "$@" --output "$out" "$repo"`,
    "opengrep",
    REPO_DIR,
    `${OUT_DIR}/opengrep.json`,
    // Follow untrusted data from a source to a sink within each file.
    "--taint-intrafile",
    // A pull request must not be able to silence a rule: no `nosemgrep`
    // comments, no .semgrepignore.
    "--disable-nosem",
    "--x-ignore-semgrepignore-files",
    ...EXCLUDE.flatMap((p) => ["--exclude", p]),
    "--json",
    "--disable-version-check",
    "--quiet",
    "--timeout",
    "30",
    "--max-target-bytes",
    "1000000",
  ],
  outputPath: `${OUT_DIR}/opengrep.json`,
  timeoutSec: 900,
  egress: "locked",
  parse: parseOpengrep,
};
