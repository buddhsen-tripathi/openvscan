/**
 * What OpenVScan posts on the pull request, drawn the way GitHub shows it
 * (Primer colours, light and dark). The text follows engine/src/report.ts
 * (buildInlineComments, buildSummaryComment) for the demo review in
 * product.tsx.
 */
import { SCANNER_INFO, type Scanner } from "@openvscan/core";
import type { ReactNode } from "react";
import { Mark } from "@/components/brand/Mark";
import { cn } from "@/lib/utils";
import { DEMO_FINDINGS, DEMO_RUN } from "./product";

/** GitHub's palette as custom properties, swapped for its dark theme. */
const GH = cn(
  "text-[14px] leading-normal",
  "[--gh-bg:#ffffff] [--gh-subtle:#f6f8fa] [--gh-border:#d1d9e0] [--gh-fg:#1f2328] [--gh-muted:#59636e] [--gh-link:#0969da]",
  "[--gh-add:#dafbe1] [--gh-add-num:#aceebb] [--gh-del:#ffebe9] [--gh-del-num:#ffcecb] [--gh-code:#818b981f] [--gh-btn:#f6f8fa]",
  "dark:[--gh-bg:#0d1117] dark:[--gh-subtle:#151b23] dark:[--gh-border:#3d444d] dark:[--gh-fg:#f0f6fc] dark:[--gh-muted:#9198a1] dark:[--gh-link:#4493f8]",
  "dark:[--gh-add:#2ea04326] dark:[--gh-add-num:#3fb9504d] dark:[--gh-del:#f851491a] dark:[--gh-del-num:#f851494d] dark:[--gh-code:#656c7633] dark:[--gh-btn:#212830]",
  "text-[var(--gh-fg)]",
);
const MONO = "font-mono";
const FONT = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
};

function Code({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <code
      className={cn(
        MONO,
        "whitespace-nowrap rounded-[6px] bg-[var(--gh-code)] px-[0.4em] py-[0.2em] text-[85%]",
        className,
      )}
    >
      {children}
    </code>
  );
}

function Avatar() {
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded-[4px] bg-brand">
      <Mark className="h-2 w-2.5 text-paper" />
    </span>
  );
}

/** "openvscan [bot] commented 2 minutes ago" */
function Byline({ verb }: { verb: string }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[var(--gh-muted)]">
      <span className="font-semibold text-[var(--gh-fg)]">openvscan</span>
      <span className="rounded-full border border-[var(--gh-border)] px-1.5 text-[12px] leading-[18px]">
        bot
      </span>
      <span>
        {verb} <span className="underline-offset-2">2 minutes ago</span>
      </span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline review comment                                                       */
/* -------------------------------------------------------------------------- */

// Kept out of JSX so the template braces read literally.
const Q = "$" + "{q}";
const HUNK: [number, string][] = [
  [12, "export async function searchOrders(req: Request, res: Response) {"],
  [13, '  const q = String(req.query.q ?? "");'],
  [
    14,
    `  const rows = await db.query(\`SELECT * FROM orders WHERE note LIKE '%${Q}%'\`);`,
  ],
];

/** A review thread in the Conversation tab: the commented lines, then the comment. */
export function GitHubReviewComment({ compact }: { compact?: boolean }) {
  const f = DEMO_FINDINGS.sqli;
  const suggestion = (f.suggestion ?? "").split("\n");
  return (
    <div
      style={FONT}
      className={cn(
        GH,
        "overflow-hidden rounded-[6px] border border-[var(--gh-border)] bg-[var(--gh-bg)]",
      )}
    >
      <div
        className={cn(
          MONO,
          "flex items-center gap-2 border-b border-[var(--gh-border)] bg-[var(--gh-subtle)] px-3 py-2 text-[12px]",
        )}
      >
        <span className="truncate text-[var(--gh-fg)]">{f.filePath}</span>
      </div>
      {!compact && (
        <table
          className={cn(
            MONO,
            "w-full border-collapse text-[12px] leading-[20px]",
          )}
        >
          <tbody>
            {HUNK.map(([n, line]) => (
              <tr key={n} className="bg-[var(--gh-add)]">
                <td className="w-10 select-none bg-[var(--gh-add-num)] pr-2 text-right align-top text-[var(--gh-muted)]">
                  {n}
                </td>
                <td className="w-4 select-none pl-2 align-top text-[var(--gh-muted)]">
                  +
                </td>
                <td className="max-w-0 truncate whitespace-pre pr-3">{line}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div
        className={cn(
          "border-[var(--gh-border)] px-3 py-3",
          !compact && "border-t",
        )}
      >
        <div className="flex items-start gap-2">
          <Avatar />
          <div className="min-w-0 flex-1 text-[13px]">
            <Byline verb="left a comment" />
            <div className="mt-2 space-y-2.5 leading-[1.5]">
              <p>
                <strong>🟠 High · OpenGrep</strong> — {f.title}
              </p>
              <p>{f.description}</p>
              {!compact && (
                <>
                  <p>
                    <em>
                      AI triage: <strong>confirmed</strong> — {f.aiReasoning}
                    </em>
                  </p>
                  <p>
                    <strong>Fix:</strong> {f.remediation}
                  </p>
                  <div className="overflow-hidden rounded-[6px] border border-[var(--gh-border)]">
                    <div className="border-b border-[var(--gh-border)] bg-[var(--gh-subtle)] px-3 py-1.5 text-[12px] text-[var(--gh-muted)]">
                      Suggested change
                    </div>
                    <div className={cn(MONO, "text-[12px] leading-[20px]")}>
                      <div className="truncate whitespace-pre bg-[var(--gh-del)] px-3">
                        <span className="select-none text-[var(--gh-muted)]">
                          -{" "}
                        </span>
                        {HUNK[2][1]}
                      </div>
                      {suggestion.map((l) => (
                        <div
                          key={l}
                          className="truncate whitespace-pre bg-[var(--gh-add)] px-3"
                        >
                          <span className="select-none text-[var(--gh-muted)]">
                            +{" "}
                          </span>
                          {l}
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end border-t border-[var(--gh-border)] bg-[var(--gh-subtle)] px-3 py-1.5">
                      <span className="rounded-[6px] border border-[var(--gh-border)] bg-[var(--gh-btn)] px-2.5 py-[3px] text-[12px] font-medium">
                        Commit suggestion
                      </span>
                    </div>
                  </div>
                </>
              )}
              <p className="flex min-w-0 items-center gap-1.5 text-[12px]">
                <Code className="min-w-0 truncate">{f.ruleId}</Code>·
                <Code className="shrink-0">{f.cwe}</Code>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Summary comment                                                             */
/* -------------------------------------------------------------------------- */

const SOURCE_LABEL = (s: string) =>
  s === "ai" ? "AI review" : SCANNER_INFO[s as Scanner].label;
const EMOJI = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  info: "⚪",
} as const;

/** The sticky summary comment, rewritten in place on each push. */
export function GitHubSummaryComment() {
  const rows = [DEMO_FINDINGS.sqli, DEMO_FINDINGS.idor, DEMO_FINDINGS.spec];
  const stats = DEMO_RUN.scannerStats as Record<string, { status: string }>;
  const ran = Object.entries(stats)
    .filter(([, s]) => s.status === "ok")
    .map(([n]) => SCANNER_INFO[n as Scanner].label);
  const skipped = Object.values(stats).filter(
    (s) => s.status === "skipped",
  ).length;
  return (
    <div
      style={FONT}
      className={cn(
        GH,
        "overflow-hidden rounded-[6px] border border-[var(--gh-border)] bg-[var(--gh-bg)]",
      )}
    >
      <div className="flex items-center gap-2 border-b border-[var(--gh-border)] bg-[var(--gh-subtle)] px-4 py-2 text-[13px]">
        <Avatar />
        <Byline verb="commented" />
        <span className="ml-auto hidden text-[12px] text-[var(--gh-muted)] sm:inline">
          edited
        </span>
      </div>
      <div className="space-y-3.5 px-4 py-4 text-[13.5px] leading-[1.5]">
        <h2 className="border-b border-[var(--gh-border)] pb-1.5 text-[19px] font-semibold leading-tight">
          🛡️ OpenVScan · ❌ 2 blocking issues (severity ≥ high)
        </h2>
        <p>
          Reviewed <Code>{(DEMO_RUN.headSha ?? "").slice(0, 7)}</Code> · 🟠 2
          high · 🟡 1 medium
        </p>
        <h4 className="text-[14px] font-semibold">
          🤖 AI review · risk: <strong>{DEMO_RUN.aiRisk}</strong>
        </h4>
        <p>{DEMO_RUN.aiSummary}</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                {["Severity", "Finding", "Source", "Location"].map((h) => (
                  <th
                    key={h}
                    className="border border-[var(--gh-border)] px-2.5 py-1.5 text-left font-semibold"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((f, i) => (
                <tr
                  key={f.id}
                  className={i % 2 ? "bg-[var(--gh-subtle)]" : undefined}
                >
                  <td className="whitespace-nowrap border border-[var(--gh-border)] px-2.5 py-1.5">
                    {EMOJI[f.severity]} {f.severity}
                  </td>
                  <td className="border border-[var(--gh-border)] px-2.5 py-1.5">
                    {f.title}
                  </td>
                  <td className="whitespace-nowrap border border-[var(--gh-border)] px-2.5 py-1.5">
                    {SOURCE_LABEL(f.source)}
                    {f.aiVerdict === "confirmed" ? " ✓" : ""}
                  </td>
                  <td className="whitespace-nowrap border border-[var(--gh-border)] px-2.5 py-1.5">
                    <Code>
                      {f.startLine
                        ? `${f.filePath}:${f.startLine}`
                        : f.filePath}
                    </Code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="list-disc space-y-0.5 pl-6">
          <li>🧹 1 scanner finding dismissed by the AI as false positives</li>
          <li>📦 1 pre-existing finding outside this diff</li>
        </ul>
        <p>
          <span className="text-[var(--gh-link)]">View full report →</span>
        </p>
        <p className="text-[11.5px] text-[var(--gh-muted)]">
          Scanners: {ran.join(" · ")} ({skipped} skipped: no relevant files
          changed) · AI: Claude Code. Re-run from the Checks tab or the
          dashboard.
        </p>
      </div>
    </div>
  );
}
