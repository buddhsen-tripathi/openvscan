import { isActiveRun } from "@openvscan/core";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RunListHead, RunRow } from "@/components/dashboard/RunList";
import {
  EmptyState,
  Loading,
  Notice,
  PageHeader,
  Panel,
} from "@/components/dashboard/ui";
import { GitPullRequest } from "@/components/icons";
import { SearchInput } from "@/components/ui/Input";
import { useRunsQuery } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/runs/")({
  component: RunsPage,
});

type Run = NonNullable<ReturnType<typeof useRunsQuery>["data"]>[number];

const FILTERS: { key: string; label: string; test: (r: Run) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  {
    key: "failed",
    label: "Failed",
    test: (r) => r.status === "completed" && r.conclusion === "fail",
  },
  {
    key: "passed",
    label: "Passed",
    test: (r) => r.status === "completed" && r.conclusion !== "fail",
  },
  {
    key: "active",
    label: "In progress",
    test: (r) => isActiveRun(r.status),
  },
  {
    key: "errored",
    label: "Errored",
    test: (r) => r.status === "failed" || r.status === "cancelled",
  },
];

function RunsPage() {
  const { data: runs, isLoading, error } = useRunsQuery();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [f.key, runs?.filter(f.test).length ?? 0]),
      ),
    [runs],
  );
  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
    const q = query.trim().toLowerCase();
    return (runs ?? []).filter(
      (r) =>
        f.test(r) &&
        (!q ||
          r.repository?.fullName.toLowerCase().includes(q) ||
          r.pullRequest?.title.toLowerCase().includes(q) ||
          String(r.pullRequest?.number ?? "").includes(q) ||
          r.headRef.toLowerCase().includes(q)),
    );
  }, [runs, filter, query]);

  return (
    <>
      <PageHeader
        title="Reviews"
        description="Every security review across your connected repositories."
      />

      {isLoading ? (
        <Loading />
      ) : error ? (
        <Notice tone="danger">
          {error instanceof Error ? error.message : "Failed to load reviews"}
        </Notice>
      ) : !runs || runs.length === 0 ? (
        <Panel>
          <EmptyState icon={GitPullRequest} title="No reviews yet">
            Reviews appear here when a pull request is opened on a connected
            repository, or when you start one from a repository page.
          </EmptyState>
        </Panel>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <fieldset
              aria-label="Filter reviews"
              className="flex min-w-0 flex-wrap gap-1 rounded-[8px] border border-border bg-card p-1 shadow-card"
            >
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-[13px] transition-colors",
                    filter === f.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      "tabular text-[11.5px]",
                      filter === f.key
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground/70",
                    )}
                  >
                    {counts[f.key]}
                  </span>
                </button>
              ))}
            </fieldset>
            <SearchInput
              aria-label="Filter reviews"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by repository, PR or branch"
              className="w-full sm:w-[300px]"
              inputClassName="text-[13.5px]"
            />
          </div>
          <Panel>
            <RunListHead />
            {visible.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13.5px] text-muted-foreground">
                No reviews match this filter.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {visible.map((run) => (
                  <RunRow key={run.id} run={run} />
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
