import type { Severity } from "@openvscan/core";
import { type NormalizedFinding, OUT_DIR, REPO_DIR, relPath, type ScannerSpec, str } from "./types";

/**
 * zizmor: GitHub Actions workflows and composite actions. Offline audits
 * only, with the "regular" persona (the low-noise one).
 */

type ZizmorLocation = {
  symbolic?: {
    key?: { Local?: { given_path?: string; verbatim_path?: string } };
    annotation?: string;
    kind?: string;
  };
  concrete?: { location?: { start_point?: { row?: number }; end_point?: { row?: number } } };
};
type ZizmorFinding = {
  ident?: string;
  desc?: string;
  url?: string;
  determinations?: { confidence?: string; severity?: string };
  locations?: ZizmorLocation[];
  ignored?: boolean;
};

const SEVERITY: Record<string, Severity> = {
  high: "high",
  medium: "medium",
  low: "low",
  informational: "info",
};

/** 0-based row → 1-based line. */
const line = (row: unknown) => (typeof row === "number" && Number.isInteger(row) && row >= 0 ? row + 1 : null);

export function parseZizmor(raw: string): NormalizedFinding[] {
  const data = JSON.parse(raw) as ZizmorFinding[] | null;
  const out: NormalizedFinding[] = [];
  for (const z of data ?? []) {
    const ident = str(z.ident, 100) ?? "zizmor";
    const loc = z.locations?.find((l) => l.symbolic?.kind === "Primary") ?? z.locations?.[0];
    const local = loc?.symbolic?.key?.Local;
    const file = relPath(local?.verbatim_path ?? local?.given_path);
    const annotation = str(loc?.symbolic?.annotation, 300);
    let severity = SEVERITY[String(z.determinations?.severity).toLowerCase()] ?? "info";
    // Low confidence: shown, but never enough to fail a run at the default threshold.
    if (String(z.determinations?.confidence).toLowerCase() === "low" && (severity === "high" || severity === "medium")) {
      severity = "low";
    }
    const desc = str(z.desc, 200) ?? ident;
    out.push({
      source: "zizmor",
      ruleId: ident,
      title: `${desc.charAt(0).toUpperCase()}${desc.slice(1)}`,
      description: annotation ? `${desc}: ${annotation}.` : desc,
      severity,
      filePath: file,
      startLine: line(loc?.concrete?.location?.start_point?.row),
      endLine: line(loc?.concrete?.location?.end_point?.row),
      cwe: null,
      remediation: null,
      suggestion: null,
      fingerprintKey: `zizmor|${ident}|${file ?? ""}|${annotation ?? ""}`,
      metadata: {
        kind: "ci",
        confidence: z.determinations?.confidence ?? null,
        url: str(z.url, 500),
      },
    });
  }
  return out;
}

export const zizmor: ScannerSpec = {
  // zizmor exits 3 when there's nothing to audit, so check first.
  // --collect=all: the default skips files in .gitignore, which the PR controls.
  argv: [
    "sh",
    "-c",
    `cd "$1" || exit 1
if [ -z "$(find . -path ./node_modules -prune -o \\( -path './.github/*' -o -name action.yml -o -name action.yaml \\) -print | head -n 1)" ]; then
  echo '[]' >"$2"; exit 0
fi
exec zizmor --offline --no-config --no-ignores --collect=all --persona regular --format json-v1 --no-exit-codes . >"$2"`,
    "zizmor",
    REPO_DIR,
    `${OUT_DIR}/zizmor.json`,
  ],
  outputPath: `${OUT_DIR}/zizmor.json`,
  timeoutSec: 300,
  egress: "locked",
  parse: parseZizmor,
};
