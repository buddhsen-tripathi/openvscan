import { SEVERITIES } from "@openvscan/core";
import { createFileRoute } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import Link from "@/components/AppLink";
import { useDashboardUser } from "@/components/dashboard/DashboardContext";
import { RunListHead, RunRow, timeAgo } from "@/components/dashboard/RunList";
import {
  EmptyState,
  Loading,
  PageHeader,
  Panel,
  StatStrip,
} from "@/components/dashboard/ui";
import {
  ArrowRight,
  Bot,
  Check,
  Folder,
  Github,
  GitPullRequest,
  Plus,
  ShieldCheck,
} from "@/components/icons";
import { SEVERITY_CLASS, SeverityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useCredentialsQuery,
  useGithubConnectionQuery,
  useOverviewQuery,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardPage,
});

const noSubscribe = () => () => {};

/** Time-of-day greeting in the viewer's timezone; neutral during SSR. */
function useGreeting() {
  return useSyncExternalStore(
    noSubscribe,
    () => {
      const h = new Date().getHours();
      return h < 12
        ? "Good morning"
        : h < 18
          ? "Good afternoon"
          : "Good evening";
    },
    () => "Welcome back",
  );
}

function DashboardPage() {
  const user = useDashboardUser();
  const { data, isLoading } = useOverviewQuery();
  const firstName = user.name?.split(" ")[0] ?? "";
  const greeting = useGreeting();

  return (
    <>
      <PageHeader
        title={`${greeting}${firstName ? `, ${firstName}` : ""}`}
        description="Security reviews across your connected repositories."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/dashboard/runs">All reviews</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/repositories">
                <Plus /> Connect repository
              </Link>
            </Button>
          </>
        }
      />

      {isLoading || !data ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <SetupChecklist repositories={data.repositories} />

          <StatStrip
            items={[
              {
                label: "Repositories",
                value: data.repositories,
                hint: "Connected to OpenVScan",
              },
              {
                label: "Open PRs reviewed",
                value: (
                  <>
                    {data.reviewedPrs}
                    <span className="text-muted-foreground">
                      /{data.openPrs}
                    </span>
                  </>
                ),
                hint: "Latest commit has a review",
              },
              {
                label: "Failing checks",
                value: data.failingPrs,
                tone: data.failingPrs > 0 ? "danger" : undefined,
                hint: "Open PRs blocked by findings",
              },
              {
                label: "Reviews · 7 days",
                value: data.runsLast7Days,
                hint: "Pull request and branch runs",
              },
            ]}
          />

          <Exposure exposure={data.exposure} />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
            <Panel
              title="Recent reviews"
              actions={
                <Link
                  href="/dashboard/runs"
                  className="inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  View all <ArrowRight size={13} />
                </Link>
              }
            >
              {data.recentRuns.length === 0 ? (
                <EmptyState icon={GitPullRequest} title="No reviews yet">
                  Open a pull request on a connected repository, or start a
                  review from a repository page.
                </EmptyState>
              ) : (
                <>
                  <RunListHead />
                  <div className="divide-y divide-border">
                    {data.recentRuns.map((run) => (
                      <RunRow key={run.id} run={run} />
                    ))}
                  </div>
                </>
              )}
            </Panel>

            <Panel
              title="Needs attention"
              description="Open pull requests failing their check"
            >
              {data.attention.length === 0 ? (
                <div className="flex items-start gap-3 px-5 py-6">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-status-completed-muted text-status-completed">
                    <ShieldCheck size={16} />
                  </span>
                  <div>
                    <div className="text-[14px] font-medium text-foreground">
                      All clear
                    </div>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      No open pull request is blocked by a finding.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {data.attention.map((pr) => (
                    <Link
                      key={pr.id}
                      href={`/dashboard/runs/${pr.runs[0]?.id}`}
                      className="flex gap-3 px-5 py-3 transition-colors hover:bg-accent/60"
                    >
                      <span className="mt-[7px] size-2 shrink-0 rounded-full bg-status-failed" />
                      <div className="min-w-0">
                        <div className="truncate text-[14px] text-foreground">
                          <span className="font-mono text-[12.5px] text-muted-foreground">
                            #{pr.number}
                          </span>{" "}
                          <span className="font-medium">{pr.title}</span>
                        </div>
                        <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                          {pr.repository.fullName} · {pr.author} ·{" "}
                          {timeAgo(pr.updatedAt)}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}

/** Findings on the latest review of each open PR, as one stacked bar. */
function Exposure({
  exposure,
}: {
  exposure: Record<(typeof SEVERITIES)[number], number>;
}) {
  const total = SEVERITIES.reduce((n, s) => n + (exposure[s] ?? 0), 0);
  return (
    <Panel
      title="Open exposure"
      description="Findings on the latest review of each open pull request"
      actions={
        <span className="tabular font-display text-[22px] leading-none text-foreground">
          {total}
          <span className="ml-1.5 font-sans text-[12.5px] text-muted-foreground">
            total
          </span>
        </span>
      }
    >
      <div className="px-5 pt-5 pb-4">
        <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full bg-muted">
          {total > 0 &&
            SEVERITIES.filter((s) => exposure[s] > 0).map((s) => (
              <div
                key={s}
                className={cn(
                  "h-full first:rounded-l-full last:rounded-r-full",
                  SEVERITY_CLASS[s].bg,
                )}
                style={{ width: `${(exposure[s] / total) * 100}%` }}
                title={`${exposure[s]} ${s}`}
              />
            ))}
        </div>
      </div>
      <div className="grid grid-cols-2 border-t border-border sm:grid-cols-5">
        {SEVERITIES.map((s, i) => (
          <div
            key={s}
            className={cn(
              "border-border px-5 py-3.5",
              i < 4 && "sm:border-r",
              i % 2 === 0 && "border-r sm:border-r",
              i < 4 && "border-b sm:border-b-0",
            )}
          >
            <SeverityBadge severity={s} />
            <div
              className={cn(
                "tabular mt-1.5 font-display text-[26px] leading-none",
                exposure[s] > 0
                  ? "text-foreground"
                  : "text-muted-foreground/50",
              )}
            >
              {exposure[s]}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** First-run checklist: GitHub App → repository → agent credential. */
function SetupChecklist({ repositories }: { repositories: number }) {
  const { data: connection } = useGithubConnectionQuery();
  const { data: creds } = useCredentialsQuery();
  if (!connection || !creds) return null;
  const hasInstall = connection.installations.length > 0;
  const hasCred = creds.credentials.length > 0;
  if (hasInstall && repositories > 0 && hasCred) return null;

  const steps = [
    {
      done: hasInstall,
      title: "Install the GitHub App",
      desc: "Choose which repositories OpenVScan can read.",
      href: connection.installUrl ?? "/dashboard/repositories",
      cta: "Install",
      icon: Github,
    },
    {
      done: repositories > 0,
      title: "Connect a repository",
      desc: "Pull requests on it get reviewed automatically.",
      href: "/dashboard/repositories",
      cta: "Connect",
      icon: Folder,
    },
    {
      done: hasCred,
      title: "Add your coding agent",
      desc: "Claude Code or Codex, on your own credential.",
      href: "/dashboard/settings",
      cta: "Add agent",
      icon: Bot,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Panel>
      <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="border-b border-border p-5 lg:border-r lg:border-b-0">
          <div className="eyebrow text-[10.5px] text-muted-foreground">
            Setup · {doneCount} of 3
          </div>
          <h2 className="mt-2 font-display text-[22px] leading-tight tracking-[-0.01em] text-foreground">
            Get your first review
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
            Three steps, then open a pull request and watch the check appear.
          </p>
          <div className="mt-4 flex gap-1">
            {steps.map((s) => (
              <span
                key={s.title}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  s.done ? "bg-accent-brand" : "bg-muted",
                )}
              />
            ))}
          </div>
        </div>
        <ol className="divide-y divide-border">
          {steps.map((s, i) => (
            <li key={s.title} className="flex items-center gap-4 px-5 py-3.5">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-medium",
                  s.done
                    ? "bg-accent-brand text-accent-brand-foreground"
                    : "border border-border text-muted-foreground",
                )}
              >
                {s.done ? <Check size={14} strokeWidth={3} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "text-[14px] font-medium",
                    s.done
                      ? "text-muted-foreground line-through decoration-1"
                      : "text-foreground",
                  )}
                >
                  {s.title}
                </div>
                <div className="text-[12.5px] text-muted-foreground">
                  {s.desc}
                </div>
              </div>
              {!s.done && (
                <Button size="sm" variant="outline" asChild>
                  <Link href={s.href}>
                    <s.icon size={14} />
                    {s.cta}
                  </Link>
                </Button>
              )}
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}
