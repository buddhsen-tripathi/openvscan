import type { Severity } from "@openvscan/core";
import { type NormalizedFinding, OUT_DIR, REPO_DIR, relPath, type ScannerSpec, str } from "./types";

/**
 * Spectral with the OWASP API Security Top 10 (2023) ruleset, on OpenAPI and
 * Swagger specs. The ruleset also has many API-design rules (rate-limit
 * headers, string lengths, error schemas); only the security ones are kept.
 */

type SpectralResult = {
  code?: string;
  message?: string;
  path?: (string | number)[];
  range?: { start?: { line?: number }; end?: { line?: number } };
  source?: string;
};

/** Kept rules (the part after "owasp:"), with our severity: Spectral's own is a style level. */
const RULES: Record<string, { severity: Severity; cwe: string; title: string }> = {
  "api1:2023-no-numeric-ids": { severity: "low", cwe: "CWE-639", title: "Guessable numeric ID" },
  "api2:2023-no-http-basic": { severity: "medium", cwe: "CWE-522", title: "HTTP Basic authentication" },
  "api2:2023-no-api-keys-in-url": { severity: "medium", cwe: "CWE-598", title: "API key in the URL" },
  "api2:2023-no-credentials-in-url": { severity: "high", cwe: "CWE-598", title: "Credentials in the URL" },
  "api2:2023-auth-insecure-schemes": { severity: "medium", cwe: "CWE-287", title: "Insecure authorization scheme" },
  "api2:2023-jwt-best-practices": { severity: "low", cwe: "CWE-287", title: "JWT without RFC 8725 guidance" },
  "api2:2023-short-lived-access-tokens": { severity: "low", cwe: "CWE-613", title: "Long-lived OAuth tokens" },
  "api2:2023-write-restricted": { severity: "medium", cwe: "CWE-306", title: "Unauthenticated write operation" },
  "api2:2023-read-restricted": { severity: "low", cwe: "CWE-306", title: "Unauthenticated read operation" },
  "api3:2023-no-additionalProperties": {
    severity: "low",
    cwe: "CWE-915",
    title: "Schema accepts additional properties",
  },
  "api3:2023-constrained-additionalProperties": {
    severity: "low",
    cwe: "CWE-915",
    title: "Unbounded additional properties",
  },
  "api5:2023-admin-security-unique": {
    severity: "medium",
    cwe: "CWE-285",
    title: "Admin endpoint shares its security scheme",
  },
  "api7:2023-concerning-url-parameter": { severity: "low", cwe: "CWE-918", title: "URL parameter (possible SSRF)" },
  "api8:2023-no-scheme-http": { severity: "medium", cwe: "CWE-319", title: "Plain HTTP scheme" },
  "api8:2023-no-server-http": { severity: "low", cwe: "CWE-319", title: "Plain HTTP server URL" },
};

export function parseSpectral(raw: string): NormalizedFinding[] {
  const data = JSON.parse(raw) as SpectralResult[] | null;
  const out: NormalizedFinding[] = [];
  const seen = new Set<string>();
  for (const r of data ?? []) {
    const code = String(r.code ?? "").replace(/^owasp:/, "");
    const rule = RULES[code];
    if (!rule) continue;
    const file = relPath(r.source);
    const start = r.range?.start?.line;
    // 0-based.
    const line = typeof start === "number" && Number.isInteger(start) && start >= 0 ? start + 1 : null;
    const key = `${code}|${file ?? ""}|${line ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const at = (r.path ?? []).map(String).join(".").slice(0, 300);
    out.push({
      source: "spectral",
      ruleId: `owasp:${code}`,
      title: rule.title,
      description: `${str(r.message, 1000) ?? rule.title}${at ? ` (at ${at})` : ""}`,
      severity: rule.severity,
      filePath: file,
      startLine: line,
      endLine: null,
      cwe: rule.cwe,
      remediation: null,
      suggestion: null,
      // The JSON path, not the line: it survives edits elsewhere in the spec.
      fingerprintKey: `spectral|${code}|${file ?? ""}|${at}`,
      metadata: {
        kind: "api",
        owasp: code.split(":")[0]?.toUpperCase() ?? null,
        url: "https://owasp.org/API-Security/editions/2023/en/0x11-t10/",
      },
    });
  }
  return out;
}

export const spectral: ScannerSpec = {
  argv: [
    "sh",
    "-c",
    // Only files with an `openapi` or `swagger` key, up to 200 of them;
    // --ignore-unknown-format skips any that aren't specs after all.
    // External $refs can't resolve: the sandbox has no network.
    `repo="$1" out="$2"
echo '[]' >"$out"
find "$repo" \\( -name .git -o -name node_modules -o -name vendor -o -name third_party \\) -prune -o \\
  -type f \\( -name '*.yaml' -o -name '*.yml' -o -name '*.json' \\) -size -5M -print 2>/dev/null |
  while IFS= read -r f; do
    grep -qsE '^[[:space:]]*"?(openapi|swagger)"?[[:space:]]*:|^[{][[:space:]]*"(openapi|swagger)"[[:space:]]*:' "$f" && printf '%s\\n' "$f"
  done | head -n 200 >"$out.files"
[ -s "$out.files" ] || exit 0
set --
while IFS= read -r f; do set -- "$@" "$f"; done <"$out.files"
spectral lint "$@" --ruleset /opt/spectral/ruleset.mjs --ignore-unknown-format --format json --output "$out" --quiet
code=$?
# 1 = findings.
[ "$code" -le 1 ]`,
    "spectral",
    REPO_DIR,
    `${OUT_DIR}/spectral.json`,
  ],
  outputPath: `${OUT_DIR}/spectral.json`,
  timeoutSec: 300,
  egress: "locked",
  parse: parseSpectral,
};
