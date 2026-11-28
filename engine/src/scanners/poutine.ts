import type { Severity } from "@openvscan/core";
import { type NormalizedFinding, OUT_DIR, posInt, REPO_DIR, relPath, type ScannerSpec, str } from "./types";

/**
 * poutine (BoostSecurity): build pipeline security for GitLab CI, Azure
 * Pipelines, Tekton and GitHub Actions. zizmor already audits GitHub
 * workflows, so there poutine only adds the rules zizmor lacks.
 */

type PoutineFinding = {
  rule_id?: string;
  meta?: { path?: string; line?: number; job?: string; step?: string; details?: string };
};
type PoutineRule = { title?: string; level?: string; description?: string; refs?: { ref?: string }[] };
type PoutineReport = { findings?: PoutineFinding[] | null; rules?: Record<string, PoutineRule> | null };

const LEVEL: Record<string, Severity> = { error: "high", warning: "medium", note: "low" };

/** On .github/ files, the rules zizmor has no equivalent for. */
const GITHUB_RULES = new Set([
  "confused_deputy_auto_merge",
  "if_always_true",
  "pr_runs_on_self_hosted",
  "untrusted_checkout_exec",
  "known_vulnerability_in_build_component",
  "known_vulnerability_in_build_platform",
]);

/** Lists every third-party action: inventory, not a vulnerability. */
const DROPPED = new Set(["github_action_from_unverified_creator_used"]);

const isGithub = (file: string | null) => !!file && (file.startsWith(".github/") || /(^|\/)action\.ya?ml$/.test(file));

export function parsePoutine(raw: string): NormalizedFinding[] {
  const data = JSON.parse(raw) as PoutineReport | null;
  const rules = data?.rules ?? {};
  const out: NormalizedFinding[] = [];
  const seen = new Set<string>();
  for (const f of data?.findings ?? []) {
    const id = str(f.rule_id, 100) ?? "poutine";
    const file = relPath(f.meta?.path);
    if (DROPPED.has(id) || (isGithub(file) && !GITHUB_RULES.has(id))) continue;
    const rule = rules[id] ?? {};
    const job = str(f.meta?.job, 200);
    const key = `poutine|${id}|${file ?? ""}|${job ?? ""}|${f.meta?.step ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const details = str(f.meta?.details, 500);
    const title = str(rule.title, 200) ?? id;
    const description = str(rule.description, 1500)?.replace(/\s+/g, " ") ?? title;
    const where = job ? ` (job ${job})` : "";
    out.push({
      source: "poutine",
      ruleId: id,
      title: `${title}${where}`.slice(0, 200),
      description: details ? `${description}\n\n${details}` : description,
      severity: LEVEL[String(rule.level).toLowerCase()] ?? "low",
      filePath: file,
      startLine: posInt(f.meta?.line),
      endLine: null,
      cwe: null,
      remediation: null,
      suggestion: null,
      fingerprintKey: key,
      metadata: {
        kind: "ci",
        job,
        url: `https://boostsecurityio.github.io/poutine/rules/${encodeURIComponent(id)}`,
      },
    });
  }
  return out;
}

export const poutine: ScannerSpec = {
  argv: [
    "sh",
    "-c",
    // Run outside the checkout: poutine reads .poutine.yml from the working
    // directory and .github/poutine.yml from the repository, either of which
    // could skip rules. The empty --config replaces both.
    `cd /tmp && exec poutine analyze_local "$1" --format json --quiet --config /opt/openvscan/poutine.yml >"$2"`,
    "poutine",
    REPO_DIR,
    `${OUT_DIR}/poutine.json`,
  ],
  outputPath: `${OUT_DIR}/poutine.json`,
  timeoutSec: 300,
  egress: "locked",
  parse: parsePoutine,
};
