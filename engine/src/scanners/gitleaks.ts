import type { Severity } from "@openvscan/core";
import {
  HISTORY_RANGE,
  type NormalizedFinding,
  OUT_DIR,
  posInt,
  REPO_DIR,
  relPath,
  type ScannerSpec,
  str,
} from "./types";

/**
 * Gitleaks, twice: over the diff of every commit in the pull request (a key
 * added in one commit and deleted in the next is still in the branch's
 * history on GitHub), and over the files at the head commit.
 */

type GitleaksLeak = {
  RuleID?: string;
  Description?: string;
  File?: string;
  StartLine?: number;
  EndLine?: number;
  Commit?: string;
};

/** The wrapper's output; a bare array is a tree scan only. */
type GitleaksReport = GitleaksLeak[] | { history?: GitleaksLeak[] | null; tree?: GitleaksLeak[] | null } | null;

const DESCRIPTION =
  "A credential-like value is committed to the repository. Anyone with read access to the repository (or its history) can use it.";
const REMEDIATION =
  "Revoke and rotate the credential, remove it from the code, and load it from a secret manager or environment variable instead.";

function toFinding(l: GitleaksLeak, commit: string | null, removed: boolean): NormalizedFinding {
  const rule = str(l.RuleID, 100) ?? "secret";
  const file = relPath(l.File);
  const sha = commit?.slice(0, 12) ?? null;
  return {
    source: "gitleaks",
    ruleId: rule,
    title: `Hard-coded secret: ${str(l.Description, 160) ?? rule}`,
    description: removed
      ? `${DESCRIPTION} It was added in commit ${sha} of this pull request and removed by a later one, but it is still in the branch's history.`
      : DESCRIPTION,
    severity: "high" as Severity,
    filePath: file,
    // A removed secret's line belongs to an old version of the file.
    startLine: removed ? null : posInt(l.StartLine),
    endLine: removed ? null : posInt(l.EndLine),
    cwe: "CWE-798",
    remediation: REMEDIATION,
    suggestion: null,
    // The secret itself is redacted by `--redact`; never store it.
    fingerprintKey: `gitleaks|${rule}|${file ?? ""}`,
    // Only the commit: author names, emails and messages aren't needed.
    metadata: sha ? { kind: "secret", commit: sha } : { kind: "secret" },
  };
}

export function parseGitleaks(raw: string): NormalizedFinding[] {
  const data = JSON.parse(raw) as GitleaksReport;
  const tree = (Array.isArray(data) ? data : (data?.tree ?? [])) ?? [];
  const history = (Array.isArray(data) ? [] : (data?.history ?? [])) ?? [];
  const key = (l: GitleaksLeak) => `${l.RuleID}|${relPath(l.File)}`;

  // The commit that first added each secret (git log lists newest first).
  const addedIn = new Map<string, string>();
  for (const l of history) if (l.Commit) addedIn.set(key(l), l.Commit);

  const out: NormalizedFinding[] = [];
  const inTree = new Set<string>();
  for (const l of tree) {
    inTree.add(key(l));
    out.push(toFinding(l, addedIn.get(key(l)) ?? null, false));
  }
  // In the PR's history but not in the head commit's files: removed later.
  const reported = new Set<string>();
  for (const l of [...history].reverse()) {
    const k = key(l);
    if (inTree.has(k) || reported.has(k) || !l.Commit) continue;
    reported.add(k);
    out.push(toFinding(l, l.Commit, true));
  }
  return out;
}

/** Shared flags. The release's default rules, so the PR's .gitleaks.toml doesn't count. */
const FLAGS = [
  "--config",
  "/opt/gitleaks.toml",
  "--gitleaks-ignore-path",
  "/opt/openvscan",
  // A `gitleaks:allow` comment in the PR can't hide a secret.
  "--ignore-gitleaks-allow",
  "--report-format",
  "json",
  "--redact",
  "--no-banner",
  "--exit-code",
  "0",
  "--log-level",
  "warn",
];

export const gitleaks: ScannerSpec = {
  argv: [
    "sh",
    "-c",
    // Gitleaks always reads a .gitleaksignore at the root of the directory it
    // scans, whatever --gitleaks-ignore-path says, and fingerprints use the
    // predictable sandbox path: a pull request could list its own leak there.
    `set -e
repo="$1" out="$2" range="$3"; shift 3
rm -f "$repo/.gitleaksignore"
echo '[]' >"$out.history"
if [ -s "$range" ]; then
  gitleaks git "$repo" --log-opts="$(cat "$range")" --report-path "$out.history" "$@"
fi
gitleaks dir "$repo" --report-path "$out.tree" "$@"
jq -n --slurpfile h "$out.history" --slurpfile t "$out.tree" '{history: $h[0], tree: $t[0]}' >"$out"`,
    "gitleaks",
    REPO_DIR,
    `${OUT_DIR}/gitleaks.json`,
    HISTORY_RANGE,
    ...FLAGS,
  ],
  outputPath: `${OUT_DIR}/gitleaks.json`,
  timeoutSec: 600,
  egress: "locked",
  parse: parseGitleaks,
};
