import { SEVERITIES, type Severity } from "@openvscan/core";
import Link from "@/components/AppLink";
import { GitBranch } from "@/components/icons";
import { RunGlyph, runOutcomeLabel, SeverityDot } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ListHead } from "./ui";

export function timeAgo(
  input: Date | string | number | null | undefined,
): string {
  if (!input) return "—";
  const ms = Date.now() - new Date(input).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(input).toLocaleDateString();
}

export function formatDuration(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): string | null {
  if (!start) return null;
  const ms = new Date(end ?? Date.now()).getTime() - new Date(start).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** Compact "■ 2 ■ 5 ■ 1" severity summary; hides zero buckets. */
export function SeverityCountsInline({
  counts,
  className,
}: {
  counts: Partial<Record<Severity, number>> | null | undefined;
  className?: string;
}) {
  if (!counts)
    return <span className="text-xs text-muted-foreground/60">—</span>;
  const shown = SEVERITIES.filter((s) => s !== "info" && (counts[s] ?? 0) > 0);
  if (shown.length === 0) {
    return (
      <span className={cn("text-[12.5px] text-muted-foreground", className)}>
        No findings
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      {shown.map((s) => (
        <span
          key={s}
          title={`${counts[s]} ${s}`}
          className="tabular inline-flex items-center gap-1.5 text-[12.5px] text-foreground"
        >
          <SeverityDot severity={s} />
          {counts[s]}
        </span>
      ))}
    </span>
  );
}

interface RunRowData {
  id: string;
  status: string;
  conclusion: string | null;
  trigger: string;
  headRef: string;
  headSha: string;
  counts: Partial<Record<Severity, number>> | null;
  createdAt: Date | string;
  repository?: { id: string; fullName: string } | null;
  pullRequest?: { number: number; title: string } | null;
}

/** Grid used by RunRow and the list header so columns line up. */
const RUN_GRID =
  "md:grid md:grid-cols-[minmax(0,1fr)_150px_96px_84px] md:items-center md:gap-4";

export function RunRow({
  run,
  showRepo = true,
}: {
  run: RunRowData;
  showRepo?: boolean;
}) {
  const outcome = runOutcomeLabel(run.status, run.conclusion);
  return (
    <Link
      href={`/dashboard/runs/${run.id}`}
      className={cn(
        "group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/60",
        RUN_GRID,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <RunGlyph status={run.status} conclusion={run.conclusion} />
        <div className="min-w-0">
          <div className="truncate text-[14px] text-foreground">
            {run.pullRequest ? (
              <>
                <span className="font-mono text-[12.5px] text-muted-foreground">
                  #{run.pullRequest.number}
                </span>{" "}
                <span className="font-medium">{run.pullRequest.title}</span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-medium">
                <GitBranch size={13} className="text-muted-foreground" />
                {run.headRef}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
            {showRepo && run.repository && (
              <>
                <span className="truncate">{run.repository.fullName}</span>
                <span className="text-muted-foreground/50">·</span>
              </>
            )}
            <span className="font-mono text-[11.5px]">
              {run.headSha.slice(0, 7)}
            </span>
            <span className="text-muted-foreground/50 md:hidden">·</span>
            <span className="md:hidden">{timeAgo(run.createdAt)}</span>
          </div>
        </div>
      </div>
      <div className="hidden md:block">
        {run.status === "completed" ? (
          <SeverityCountsInline counts={run.counts} />
        ) : (
          <span className="text-[12.5px] text-muted-foreground">—</span>
        )}
      </div>
      <div
        className={cn(
          "hidden text-[13px] md:block",
          run.status === "completed" && run.conclusion === "fail"
            ? "font-medium text-status-failed"
            : "text-foreground",
        )}
      >
        {outcome}
      </div>
      <div className="hidden text-right text-[12.5px] text-muted-foreground md:block">
        {timeAgo(run.createdAt)}
      </div>
    </Link>
  );
}

export function RunListHead() {
  return (
    <ListHead className={RUN_GRID}>
      <span className="pl-[34px]">Review</span>
      <span>Findings</span>
      <span>Result</span>
      <span className="text-right">When</span>
    </ListHead>
  );
}
