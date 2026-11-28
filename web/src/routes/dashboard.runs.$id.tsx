import { isActiveRun } from "@openvscan/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import Link from "@/components/AppLink";
import { formatDuration, timeAgo } from "@/components/dashboard/RunList";
import {
  AiSummary,
  Findings,
  Logs,
  RunFacts,
  ScannerStats,
  Verdict,
} from "@/components/dashboard/run";
import {
  EmptyState,
  Loading,
  Notice,
  PageHeader,
  Panel,
  useBreadcrumb,
} from "@/components/dashboard/ui";
import {
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Refresh,
  Spinner,
  XCircle,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useCancelRunMutation, useRerunMutation, useRunQuery } from "@/lib/api";

export const Route = createFileRoute("/dashboard/runs/$id")({
  component: RunDetailPage,
});

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
