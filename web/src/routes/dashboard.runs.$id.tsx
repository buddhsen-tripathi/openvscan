import {
  AGENT_INFO,
  isActiveRun,
  isBlocking,
  isDismissed,
  isOverruled,
  SCANNER_INFO,
  type Scanner,
  SEVERITIES,
} from "@openvscan/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import Link from "@/components/AppLink";
import { AgentLogo } from "@/components/brand/AgentLogo";
import { formatDuration, timeAgo } from "@/components/dashboard/RunList";
import {
  EmptyState,
  Loading,
  Notice,
  PageHeader,
  Panel,
  TabBar,
  useBreadcrumb,
} from "@/components/dashboard/ui";
import {
  Bot,
  Check,
  ChevronDown,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Refresh,
  ShieldCheck,
  Spinner,
  X,
  XCircle,
} from "@/components/icons";
import {
  Pill,
  RunGlyph,
  RunOutcomeBadge,
  SEVERITY_CLASS,
  SeverityBadge,
  SeverityDot,
  SourceBadge,
  severityKey,
  VerdictBadge,
} from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCancelRunMutation, useRerunMutation, useRunQuery } from "@/lib/api";
import { cn } from "@/lib/utils";

const SEV_SHORT: Record<string, string> = {
  critical: "crit",
  medium: "med",
};

export const Route = createFileRoute("/dashboard/runs/$id")({
  component: RunDetailPage,
});

type RunDetail = NonNullable<ReturnType<typeof useRunQuery>["data"]>;
type Finding = RunDetail["findings"][number];

/** Same gate the engine applies (see @openvscan/core isBlocking). */
function blocks(f: Finding, run: RunDetail) {
  return isBlocking(f, { isPr: Boolean(run.pullRequest), failOn: run.failOn });
}

function RunDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: run, isLoading, error } = useRunQuery(id);
  const cancel = useCancelRunMutation(id);
  const rerun = useRerunMutation();
  const pr = run?.pullRequest;
  useBreadcrumb(run ? (pr ? `#${pr.number}` : run.headRef) : null);

  if (isLoading && !run) return <Loading />;
  if (error || !run) {
    return (
      <Panel>
        <EmptyState
          icon={XCircle}
          title="Review not found"
          action={
            <Button variant="outline" asChild>
              <Link href="/dashboard/runs">Back to reviews</Link>
            </Button>
          }
        >
          {error instanceof Error ? error.message : "It may have been deleted."}
        </EmptyState>
      </Panel>
    );
  }

  const isActive = isActiveRun(run.status);
  const duration = formatDuration(run.startedAt, run.completedAt);
  const actionError = cancel.error ?? rerun.error;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={`/dashboard/repositories/${run.repository.id}`}
            className="normal-case tracking-normal hover:text-foreground"
          >
            <span className="font-mono text-[12px]">
              {run.repository.fullName}
            </span>
          </Link>
        }
        title={
          pr ? (
            <>
              {pr.title}{" "}
              <span className="text-muted-foreground">#{pr.number}</span>
            </>
          ) : (
            <>Branch {run.headRef}</>
          )
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              {pr ? <GitPullRequest size={14} /> : <GitBranch size={14} />}
              <span className="font-mono text-[12.5px]">
                {pr ? `${pr.headRef} → ${pr.baseRef}` : run.headRef}
              </span>
            </span>
            <a
              href={`https://github.com/${run.repository.fullName}/commit/${run.headSha}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[12.5px] hover:text-foreground"
            >
              {run.headSha.slice(0, 7)}
            </a>
            <span>Started {timeAgo(run.startedAt ?? run.createdAt)}</span>
            {duration && <span>took {duration}</span>}
          </span>
        }
        actions={
          <>
            {pr && (
              <Button variant="outline" asChild>
                <a href={pr.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  Pull request
                </a>
              </Button>
            )}
            {isActive ? (
              <Button
                variant="destructive"
                onClick={() => cancel.mutate(undefined)}
                disabled={cancel.isPending || run.cancelRequested}
              >
                <XCircle />
                {run.cancelRequested ? "Cancelling…" : "Cancel"}
              </Button>
            ) : (
              <Button
                disabled={rerun.isPending}
                onClick={() =>
                  rerun.mutate(run.id, {
                    onSuccess: (res) =>
                      navigate({
                        to: "/dashboard/runs/$id",
                        params: { id: res.runId },
                      }),
                  })
                }
              >
                {rerun.isPending ? (
                  <Spinner className="animate-spin" />
                ) : (
                  <Refresh />
                )}
                Re-run
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-6">
        {actionError && <Notice tone="danger">{actionError.message}</Notice>}
        <Verdict run={run} />

        {run.error && (
          <Notice tone="danger">
            <span className="whitespace-pre-line">{run.error}</span>
          </Notice>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
            <AiSummary run={run} />
            <Findings run={run} />
          </div>
          <aside className="space-y-6 lg:sticky lg:top-20">
            <RunFacts run={run} />
            <ScannerStats run={run} />
          </aside>
        </div>

        <Logs run={run} />
      </div>
    </>
  );
}

/* --------------------------------- Verdict -------------------------------- */

const STEPS = [
  { phase: "checkout", label: "Checkout" },
  { phase: "scanning", label: "Scanners" },
  { phase: "ai_review", label: "AI review" },
  { phase: "publishing", label: "Publish" },
] as const;
const PHASE_ORDER = [
  "queued",
  "checkout",
  "scanning",
  "ai_review",
  "publishing",
  "done",
];

function Verdict({ run }: { run: RunDetail }) {
  const blocking = run.findings.filter((f) => blocks(f, run));
  const active = run.findings.filter((f) => !isDismissed(f));
  const overruled =
    run.failOn === "never"
      ? []
      : run.findings.filter((f) =>
          isOverruled(f, {
            isPr: Boolean(run.pullRequest),
            failOn: run.failOn,
          }),
        );

  let headline: string;
  let sub: string;
  if (run.status === "completed") {
    if (run.conclusion === "fail") {
      headline = `${blocking.length} finding${blocking.length === 1 ? "" : "s"} block${blocking.length === 1 ? "s" : ""} this change`;
      sub = `At or above ${run.failOn}, on lines this change touched.`;
    } else if (run.conclusion === "pass") {
      headline = active.length
        ? "Nothing here blocks the merge"
        : "No security issues found";
      sub = active.length
        ? `${active.length} finding${active.length === 1 ? "" : "s"} reported for context, none at or above ${run.failOn} in the diff.`
        : "The scanners and the agent found nothing to report.";
    } else if (overruled.length > 0) {
      headline = `Check ${overruled.length} finding${overruled.length === 1 ? "" : "s"} the AI dismissed`;
      sub = `${overruled.length === 1 ? "It is" : "They are"} at or above ${run.failOn} in the diff and would block the merge. The agent reads code from the pull request, so its dismissal alone doesn't pass the check.`;
    } else {
      headline = "Advisory review";
      sub =
        "This repository never fails the check; findings are informational.";
    }
  } else if (isActiveRun(run.status)) {
    headline = "Reviewing…";
    sub = "Results update here as each step finishes.";
  } else if (run.status === "cancelled") {
    headline = "Review cancelled";
    sub = run.checkRunId
      ? "The check on GitHub was marked cancelled; no review comments were posted."
      : "Stopped before anything was posted to GitHub.";
  } else {
    headline = "The review didn't finish";
    sub = "The check on GitHub is neutral. See the log below for details.";
  }

  return (
    <Panel>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="flex items-start gap-4 border-b border-border p-5 lg:border-r lg:border-b-0">
          <RunGlyph
            status={run.status}
            conclusion={run.conclusion}
            className="size-9 [&_svg]:size-[17px]"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-[22px] leading-tight tracking-[-0.01em] text-foreground">
                {headline}
              </h2>
            </div>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
              {sub}
            </p>
            <div className="mt-3">
              <RunOutcomeBadge
                status={run.status}
                conclusion={run.conclusion}
              />
            </div>
          </div>
        </div>
        <div className="p-5">
          <PhaseStepper run={run} />
          {run.counts && (
            <div className="mt-5 grid grid-cols-5 overflow-hidden rounded-[8px] border border-border">
              {SEVERITIES.map((s) => (
                <div
                  key={s}
                  className="min-w-0 border-r border-border px-2 py-2.5 last:border-r-0 sm:px-3"
                >
                  <SeverityBadge
                    severity={s}
                    className="hidden text-[10px] sm:inline-flex"
                  />
                  {/* Full labels don't fit five-across on phones. */}
                  <span className="eyebrow inline-flex items-center gap-1.5 text-[10px] text-muted-foreground sm:hidden">
                    <SeverityDot severity={s} />
                    {SEV_SHORT[s] ?? s}
                  </span>
                  <div
                    className={cn(
                      "tabular mt-1 font-display text-[22px] leading-none",
                      (run.counts?.[s] ?? 0) > 0
                        ? "text-foreground"
                        : "text-muted-foreground/45",
                    )}
                  >
                    {run.counts?.[s] ?? 0}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function PhaseStepper({ run }: { run: RunDetail }) {
  const current = PHASE_ORDER.indexOf(run.phase);
  const finished = run.status === "completed";
  const stopped = run.status === "failed" || run.status === "cancelled";

  return (
    <ol className="grid grid-cols-4">
      {STEPS.map((step, i) => {
        const idx = PHASE_ORDER.indexOf(step.phase);
        const skipped = step.phase === "ai_review" && !run.agent;
        let state: "done" | "active" | "pending" | "error" | "skipped" =
          "pending";
        if (skipped) state = "skipped";
        else if (finished || idx < current) state = "done";
        else if (idx === current) state = stopped ? "error" : "active";
        return (
          <li key={step.phase} className="relative">
            {i > 0 && (
              <span
                className={cn(
                  "absolute top-[11px] right-[calc(50%+16px)] left-[calc(-50%+16px)] h-px",
                  state === "done" || state === "active" || state === "error"
                    ? "bg-accent-brand/50"
                    : "bg-border",
                )}
              />
            )}
            <div className="flex flex-col items-center gap-2 text-center">
              <span
                className={cn(
                  "relative grid size-[23px] place-items-center rounded-full",
                  state === "done" &&
                    "bg-accent-brand text-accent-brand-foreground",
                  state === "active" &&
                    "border border-status-running/40 bg-card text-status-running",
                  state === "error" &&
                    "bg-status-failed text-white dark:text-background",
                  (state === "pending" || state === "skipped") &&
                    "border border-border bg-card text-muted-foreground",
                )}
              >
                {state === "done" && <Check size={12} strokeWidth={3} />}
                {state === "active" && (
                  <Spinner size={12} className="animate-spin" />
                )}
                {state === "error" && <X size={12} strokeWidth={3} />}
                {(state === "pending" || state === "skipped") && (
                  <span className="size-1.5 rounded-full bg-current opacity-50" />
                )}
              </span>
              <span
                className={cn(
                  "text-[12.5px]",
                  state === "pending" || state === "skipped"
                    ? "text-muted-foreground"
                    : "font-medium text-foreground",
                )}
              >
                {step.label}
                {state === "skipped" && (
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    off
                  </span>
                )}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------- AI review ------------------------------- */

const riskTone = (risk: string) =>
  risk === "none"
    ? "text-status-completed"
    : SEVERITY_CLASS[severityKey(risk)].text;

function AiSummary({ run }: { run: RunDetail }) {
  if (run.aiSkipped) {
    return (
      <Panel>
        <div className="px-5 py-4 text-[13.5px] leading-relaxed text-muted-foreground">
          {run.aiSkipped}
        </div>
      </Panel>
    );
  }
  if (!run.agent) return null;
  const name = AGENT_INFO[run.agent].label;
  if (!run.aiSummary && !run.aiError) {
    if (!isActiveRun(run.status)) return null;
    return (
      <Panel>
        <div className="flex items-center gap-3 px-5 py-4 text-[13.5px] text-muted-foreground">
          <AgentLogo agent={run.agent} />
          {name} reviews the change after the scanners finish.
        </div>
      </Panel>
    );
  }
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <span className="grid size-5 place-items-center rounded-[5px] bg-primary text-primary-foreground">
            <Bot size={12} />
          </span>
          AI review
          <span className="font-normal text-muted-foreground">
            {name}
            {run.agentModel ? ` · ${run.agentModel}` : ""}
          </span>
        </span>
      }
      actions={
        run.aiRisk && (
          <span className="eyebrow text-[10.5px] text-muted-foreground">
            Risk{" "}
            <span className={cn("ml-1 font-semibold", riskTone(run.aiRisk))}>
              {run.aiRisk}
            </span>
          </span>
        )
      }
    >
      <div className="space-y-3 px-5 py-4">
        {run.aiSummary && (
          <p className="whitespace-pre-wrap text-[14.5px] leading-[1.7] text-foreground/90">
            {run.aiSummary}
          </p>
        )}
        {run.aiError && <Notice tone="warning">{run.aiError}</Notice>}
      </div>
    </Panel>
  );
}

/* -------------------------------- Findings -------------------------------- */

function Findings({ run }: { run: RunDetail }) {
  const blocking = run.findings.filter((f) => blocks(f, run));
  const active = run.findings.filter((f) => !isDismissed(f));
  const dismissed = run.findings.filter(isDismissed);
  const tabs = [
    { key: "active", label: "Open", items: active },
    { key: "blocking", label: "Blocking", items: blocking },
    { key: "dismissed", label: "Dismissed by AI", items: dismissed },
  ];
  const [tab, setTab] = useState("active");
  const current = tabs.find((t) => t.key === tab) ?? tabs[0];
  const sorted = [...current.items].sort(
    (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity),
  );
  const isActive = isActiveRun(run.status);

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 pt-3">
        <TabBar
          label="Findings"
          value={tab}
          onChange={setTab}
          tabs={tabs.map((t) => ({
            key: t.key,
            label: (
              <>
                {t.label}
                <Pill
                  tone={
                    t.key === "blocking" && t.items.length > 0
                      ? "danger"
                      : "muted"
                  }
                  className="tabular rounded-full py-0"
                >
                  {t.items.length}
                </Pill>
              </>
            ),
          }))}
        />
        <span className="pb-3 font-mono text-[11.5px] text-muted-foreground">
          fail on: {run.failOn}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-12 text-center text-[13.5px] text-muted-foreground">
          {isActive ? (
            <>
              <Spinner className="size-5 animate-spin" />
              Waiting for results…
            </>
          ) : tab === "active" && run.status === "completed" ? (
            <>
              <ShieldCheck className="size-7 text-status-completed" />
              No security issues found.
            </>
          ) : tab === "blocking" ? (
            "Nothing blocks this change."
          ) : tab === "dismissed" ? (
            "The agent didn't dismiss any findings."
          ) : (
            "No findings recorded."
          )}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {sorted.map((f) => (
            <FindingRow
              key={f.id}
              finding={f}
              run={run}
              blocking={blocks(f, run)}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

function FindingRow({
  finding,
  run,
  blocking,
}: {
  finding: Finding;
  run: RunDetail;
  blocking: boolean;
}) {
  const [open, setOpen] = useState(blocking);
  const location = finding.filePath
    ? `${finding.filePath}${finding.startLine ? `:${finding.startLine}` : ""}`
    : null;
  const blobUrl = finding.filePath
    ? `https://github.com/${run.repository.fullName}/blob/${run.headSha}/${finding.filePath}${
        finding.startLine
          ? `#L${finding.startLine}${finding.endLine && finding.endLine !== finding.startLine ? `-L${finding.endLine}` : ""}`
          : ""
      }`
    : null;

  return (
    <div
      className={cn(
        "relative before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
        SEVERITY_CLASS[severityKey(finding.severity)].stripe,
        !blocking && "before:opacity-40",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-start gap-4 px-5 py-3.5 text-left transition-colors hover:bg-accent/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <SeverityBadge severity={finding.severity} />
            {blocking && (
              <Pill className="bg-status-failed font-mono text-[10.5px] text-white dark:text-background">
                blocking
              </Pill>
            )}
            <span
              className={cn(
                "text-[14.5px] font-medium",
                isDismissed(finding)
                  ? "text-muted-foreground line-through decoration-1"
                  : "text-foreground",
              )}
            >
              {finding.title}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <SourceBadge source={finding.source} />
            <VerdictBadge verdict={finding.aiVerdict} />
            {location && (
              <span className="truncate font-mono text-[11.5px] text-foreground/80">
                {location}
              </span>
            )}
            {finding.inDiff && (
              <span className="text-accent-brand">in this diff</span>
            )}
            {finding.ruleId && (
              <span className="truncate font-mono text-[11px]">
                {finding.ruleId}
              </span>
            )}
            {finding.cwe && (
              <span className="font-mono text-[11px]">{finding.cwe}</span>
            )}
          </div>
        </div>
        <ChevronDown
          size={16}
          className={cn(
            "mt-1 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="space-y-3 px-5 pb-5">
          <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-muted-foreground">
            {finding.description}
          </p>
          {finding.aiReasoning && (
            <div className="rounded-[8px] border border-accent-brand/20 bg-accent-brand-muted/60 p-3.5">
              <span className="eyebrow mb-1.5 flex items-center gap-1.5 text-[10.5px] text-accent-brand">
                <Bot size={12} /> Agent's reasoning
              </span>
              <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-foreground">
                {finding.aiReasoning}
              </p>
            </div>
          )}
          {finding.remediation && (
            <div className="rounded-[8px] border border-border bg-muted/50 p-3.5">
              <span className="eyebrow mb-1.5 block text-[10.5px] text-muted-foreground">
                Remediation
              </span>
              <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-foreground">
                {finding.remediation}
              </p>
            </div>
          )}
          {finding.suggestion && (
            <div>
              <span className="eyebrow mb-1.5 block text-[10.5px] text-muted-foreground">
                Suggested change
              </span>
              <pre className="overflow-x-auto rounded-[8px] border border-border bg-background p-3.5 font-mono text-[12px] leading-relaxed text-foreground">
                {finding.suggestion}
              </pre>
            </div>
          )}
          {blobUrl && (
            <a
              href={blobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-foreground hover:underline"
            >
              View on GitHub <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Sidebar -------------------------------- */

const TRIGGER_LABELS: Record<RunDetail["trigger"], string> = {
  pull_request: "Pull request",
  command: "Comment command",
  manual: "Manual",
};

function RunFacts({ run }: { run: RunDetail }) {
  const rows: [string, React.ReactNode][] = [
    ["Trigger", TRIGGER_LABELS[run.trigger]],
    [
      "Agent",
      run.agent ? (
        <span key="a" className="inline-flex items-center gap-1.5">
          <AgentLogo agent={run.agent} className="size-3.5" />
          {AGENT_INFO[run.agent].label}
        </span>
      ) : (
        "Scanners only"
      ),
    ],
    [
      "Fail on",
      <span key="f" className="capitalize">
        {run.failOn}
      </span>,
    ],
    ["Files changed", run.filesChanged ?? "—"],
    ["Duration", formatDuration(run.startedAt, run.completedAt) ?? "—"],
    [
      "Commit",
      <a
        key="c"
        href={`https://github.com/${run.repository.fullName}/commit/${run.headSha}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-[12.5px] hover:underline"
      >
        {run.headSha.slice(0, 7)}
      </a>,
    ],
  ];
  return (
    <Panel title="Details">
      <dl className="divide-y divide-border">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex items-center justify-between gap-4 px-5 py-2.5 text-[13px]"
          >
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function ScannerStats({ run }: { run: RunDetail }) {
  const stats = run.scannerStats ?? {};
  const scanners = run.scanners as string[];
  if (scanners.length === 0) return null;
  return (
    <Panel title="Scanners">
      <div className="divide-y divide-border">
        {scanners.map((s) => {
          const stat = stats[s];
          const label = SCANNER_INFO[s as Scanner]?.label ?? s;
          return (
            <div key={s} className="flex items-start gap-3 px-5 py-3">
              <span
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                  !stat && "border border-border text-muted-foreground",
                  stat?.status === "ok" &&
                    "bg-status-completed-muted text-status-completed",
                  stat?.status === "failed" &&
                    "bg-status-failed-muted text-status-failed",
                  stat?.status === "skipped" &&
                    "bg-muted text-muted-foreground",
                )}
              >
                {stat?.status === "ok" ? (
                  <Check size={11} strokeWidth={3} />
                ) : stat?.status === "failed" ? (
                  <X size={11} strokeWidth={3} />
                ) : (
                  <span className="size-1 rounded-full bg-current" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13.5px] font-medium text-foreground">
                    {label}
                  </span>
                  <span className="font-mono text-[11.5px] text-muted-foreground">
                    {stat?.durationMs
                      ? `${(stat.durationMs / 1000).toFixed(1)}s`
                      : stat
                        ? stat.status
                        : "pending"}
                  </span>
                </div>
                <div className="text-[12.5px] text-muted-foreground">
                  {stat
                    ? `${stat.findings} finding${stat.findings === 1 ? "" : "s"}`
                    : "Waiting"}
                </div>
                {stat?.error && (
                  <div
                    className="mt-1 truncate text-[12px] text-status-failed"
                    title={stat.error}
                  >
                    {stat.error}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Logs({ run }: { run: RunDetail }) {
  if (run.logs.length === 0) return null;
  return (
    <details className="group overflow-hidden rounded-[10px] border border-transparent bg-card shadow-edge">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className="text-[14px] font-semibold text-foreground">
          Run log
          <span className="ml-2 font-normal text-muted-foreground">
            {run.logs.length} lines
          </span>
        </span>
        <ChevronDown
          size={16}
          className="text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="max-h-80 space-y-0.5 overflow-y-auto border-t border-border bg-background/60 px-5 py-4 font-mono text-[12px]">
        {run.logs.map((log) => (
          <div key={log.id} className="flex gap-4">
            <span className="shrink-0 text-muted-foreground/60">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <span
              className={
                log.level === "error"
                  ? "text-status-failed"
                  : log.level === "warn"
                    ? "text-status-pending"
                    : "text-foreground/85"
              }
            >
              {log.message}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}
