import {
  AGENT_INFO,
  AGENT_PROVIDERS,
  type AgentProvider,
  FAIL_THRESHOLDS,
  type FailThreshold,
  SCANNER_INFO,
  SCANNERS,
  type Scanner,
} from "@openvscan/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useState } from "react";
import Link from "@/components/AppLink";
import {
  RunListHead,
  RunRow,
  SeverityCountsInline,
  timeAgo,
} from "@/components/dashboard/RunList";
import {
  EmptyState,
  GithubAvatar,
  Loading,
  Notice,
  PageHeader,
  Panel,
  SettingRow,
  Switch,
  useBreadcrumb,
} from "@/components/dashboard/ui";
import {
  Check,
  ExternalLink,
  Folder,
  GitBranch,
  GitPullRequest,
  Lock,
  Play,
  Spinner,
  Trash,
} from "@/components/icons";
import { Pill, RunGlyph, runOutcomeLabel } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  useCredentialsQuery,
  useDisconnectRepositoryMutation,
  useRepositoryQuery,
  useStartManualRunMutation,
  useUpdateRepositorySettingsMutation,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/repositories/$id")({
  component: RepositoryDetailPage,
});

type Repo = NonNullable<ReturnType<typeof useRepositoryQuery>["data"]>;

function RepositoryDetailPage() {
  const { id } = Route.useParams();
  const { data: repo, isLoading, error } = useRepositoryQuery(id);
  useBreadcrumb(repo?.fullName);

  if (isLoading) return <Loading />;
  if (!repo) {
    return (
      <Panel>
        <EmptyState
          icon={Folder}
          title="Repository not found"
          action={
            <Button variant="outline" asChild>
              <Link href="/dashboard/repositories">Back to repositories</Link>
            </Button>
          }
        >
          {error instanceof Error
            ? error.message
            : "It may have been disconnected."}
        </EmptyState>
      </Panel>
    );
  }

  const [owner, name] = repo.fullName.split("/");

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2 normal-case tracking-normal">
            <GithubAvatar login={owner} className="size-4 rounded-[4px]" />
            <span className="font-mono text-[12px]">{owner}</span>
          </span>
        }
        title={name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              {repo.private && <Lock size={13} />}
              {repo.private ? "Private" : "Public"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <GitBranch size={13} />
              <span className="font-mono text-[12.5px]">
                {repo.defaultBranch}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  repo.autoReview
                    ? "bg-accent-brand"
                    : "bg-muted-foreground/50",
                )}
              />
              {repo.autoReview
                ? "Reviews every pull request"
                : "Manual reviews only"}
            </span>
          </span>
        }
        actions={
          <Button variant="outline" asChild>
            <a
              href={`https://github.com/${repo.fullName}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink />
              GitHub
            </a>
          </Button>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <PullRequests repo={repo} />
          <Panel title="Recent reviews">
            {repo.runs.length === 0 ? (
              <p className="px-5 py-6 text-[13.5px] text-muted-foreground">
                No reviews yet.
              </p>
            ) : (
              <>
                <RunListHead />
                <div className="divide-y divide-border">
                  {repo.runs.map((run) => (
                    <RunRow key={run.id} run={run} showRepo={false} />
                  ))}
                </div>
              </>
            )}
          </Panel>
        </div>
        <div className="space-y-6">
          <ManualRunCard repo={repo} />
          <SettingsForm repo={repo} />
        </div>
      </div>
    </>
  );
}

function ManualRunCard({ repo }: { repo: Repo }) {
  const navigate = useNavigate();
  const start = useStartManualRunMutation(repo.id);
  const [branch, setBranch] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { runId } = await start.mutateAsync(branch.trim() || undefined);
      navigate({ to: "/dashboard/runs/$id", params: { id: runId } });
    } catch {
      /* surfaced below */
    }
  };

  return (
    <Panel
      title="Review a branch"
      description="Scans the whole tree at the branch's latest commit"
    >
      <form onSubmit={submit} className="flex gap-2 p-4">
        <label htmlFor="branch" className="sr-only">
          Branch
        </label>
        <div className="relative flex-1">
          <GitBranch
            size={14}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="branch"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder={repo.defaultBranch}
            className="pl-8 font-mono text-[13px]"
          />
        </div>
        <Button type="submit" disabled={start.isPending}>
          {start.isPending ? <Spinner className="animate-spin" /> : <Play />}
          Run
        </Button>
      </form>
      {start.error && (
        <div className="px-4 pb-4">
          <Notice tone="danger">
            {start.error instanceof Error
              ? start.error.message
              : "Failed to start"}
          </Notice>
        </div>
      )}
    </Panel>
  );
}

function PullRequests({ repo }: { repo: Repo }) {
  const prs = repo.pullRequests;
  return (
    <Panel title="Pull requests">
      {prs.length === 0 ? (
        <EmptyState icon={GitPullRequest} title="No pull requests yet">
          {repo.autoReview
            ? "Open a pull request and the review starts within a minute."
            : "Automatic reviews are off for this repository."}
        </EmptyState>
      ) : (
        <div className="divide-y divide-border">
          {prs.map((pr) => {
            const latest = pr.runs[0];
            const body = (
              <>
                {latest ? (
                  <RunGlyph
                    status={latest.status}
                    conclusion={latest.conclusion}
                  />
                ) : (
                  <span className="grid size-[22px] shrink-0 place-items-center rounded-full border border-dashed border-border text-muted-foreground">
                    <GitPullRequest size={11} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] text-foreground">
                    <span className="font-mono text-[12.5px] text-muted-foreground">
                      #{pr.number}
                    </span>{" "}
                    <span className="font-medium">{pr.title}</span>
                    {pr.draft && (
                      <Pill tone="outline" className="ml-2">
                        draft
                      </Pill>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
                    <span>{pr.author}</span>
                    <span className="text-muted-foreground/50">·</span>
                    <span className="truncate font-mono text-[11.5px]">
                      {pr.headRef} → {pr.baseRef}
                    </span>
                    <span className="text-muted-foreground/50">·</span>
                    <span>{timeAgo(pr.updatedAt)}</span>
                  </div>
                </div>
                <div className="hidden shrink-0 items-center gap-4 sm:flex">
                  {latest?.status === "completed" && (
                    <SeverityCountsInline counts={latest.counts} />
                  )}
                  <span className="w-[88px] whitespace-nowrap text-right text-[13px] text-foreground">
                    {latest ? (
                      runOutcomeLabel(latest.status, latest.conclusion)
                    ) : (
                      <span className="text-muted-foreground">
                        Not reviewed
                      </span>
                    )}
                  </span>
                </div>
              </>
            );
            return latest ? (
              <Link
                key={pr.id}
                href={`/dashboard/runs/${latest.id}`}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/60"
              >
                {body}
              </Link>
            ) : (
              <div key={pr.id} className="flex items-center gap-3 px-5 py-3">
                {body}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

const AGENT_OPTIONS: { value: AgentProvider | null; label: ReactNode }[] = [
  { value: null, label: <AgentOption name="None" detail="Scanners only" /> },
  ...AGENT_PROVIDERS.map((p) => ({
    value: p,
    label: (
      <AgentOption name={AGENT_INFO[p].label} detail={AGENT_INFO[p].cmd} />
    ),
  })),
];

function AgentOption({ name, detail }: { name: string; detail: string }) {
  return (
    <>
      <span className="block font-medium">{name}</span>
      <span className="block font-mono text-[10.5px] font-normal opacity-70">
        {detail}
      </span>
    </>
  );
}

const FAIL_OPTIONS = FAIL_THRESHOLDS.map((t) => ({
  value: t,
  label: t.charAt(0).toUpperCase() + t.slice(1),
}));

function SettingsForm({ repo }: { repo: Repo }) {
  const navigate = useNavigate();
  const update = useUpdateRepositorySettingsMutation(repo.id);
  const disconnect = useDisconnectRepositoryMutation();
  const { data: creds } = useCredentialsQuery();

  const [autoReview, setAutoReview] = useState(repo.autoReview);
  const [skipDrafts, setSkipDrafts] = useState(repo.skipDrafts);
  const [scanners, setScanners] = useState<Scanner[]>(repo.scanners);
  const [agent, setAgent] = useState<AgentProvider | null>(repo.agent);
  const [agentModel, setAgentModel] = useState(repo.agentModel ?? "");
  const [instructions, setInstructions] = useState(repo.instructions ?? "");
  const [failOn, setFailOn] = useState<FailThreshold>(repo.failOn);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const snapshot = JSON.stringify([
    autoReview,
    skipDrafts,
    scanners,
    agent,
    agentModel,
    instructions,
    failOn,
  ]);

  const missingCredential =
    agent !== null &&
    creds !== undefined &&
    !creds.credentials.some((c) => c.provider === agent);

  const toggleScanner = (s: Scanner) =>
    setScanners((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    try {
      await update.mutateAsync({
        autoReview,
        skipDrafts,
        scanners,
        agent,
        agentModel: agentModel.trim() || null,
        instructions: instructions.trim() || null,
        failOn,
      });
      setSavedAt(snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    }
  };

  return (
    <Panel title="Review policy" description="Applies from the next review">
      <form onSubmit={handleSave}>
        <div className="divide-y divide-border">
          <SettingRow
            title="Review pull requests"
            description="On open, push, reopen and ready for review."
          >
            <Switch
              checked={autoReview}
              onChange={setAutoReview}
              label="Review pull requests automatically"
            />
          </SettingRow>
          <SettingRow
            title="Skip drafts"
            description="Wait until the PR is marked ready."
          >
            <Switch
              checked={skipDrafts}
              onChange={setSkipDrafts}
              label="Skip draft pull requests"
            />
          </SettingRow>

          <fieldset className="px-5 py-4">
            <legend className="sr-only">Scanners</legend>
            <div className="mb-2.5 text-[14px] font-medium text-foreground">
              Scanners
            </div>
            <div className="space-y-1.5">
              {SCANNERS.map((s) => {
                const on = scanners.includes(s);
                return (
                  <label
                    key={s}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-[8px] border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent-brand/25",
                      on
                        ? "border-foreground/25 bg-background"
                        : "border-border hover:bg-accent/50",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() => toggleScanner(s)}
                    />
                    <span
                      className={cn(
                        "mt-0.5 grid size-4 shrink-0 place-items-center rounded-[4px] border",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-card",
                      )}
                    >
                      {on && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium text-foreground">
                        {SCANNER_INFO[s].label}
                      </span>
                      <span className="block text-[12.5px] text-muted-foreground">
                        {SCANNER_INFO[s].description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="px-5 py-4">
            <legend className="sr-only">AI reviewer</legend>
            <div className="mb-2.5 text-[14px] font-medium text-foreground">
              AI reviewer
            </div>
            <SegmentedControl
              label="AI reviewer"
              value={agent}
              onChange={setAgent}
              options={AGENT_OPTIONS}
            />
            {missingCredential && (
              <Notice tone="warning" className="mt-3 text-[12.5px]">
                No {AGENT_INFO[agent].label} credential saved, so reviews skip
                the AI step. Add one in{" "}
                <Link
                  href="/dashboard/settings"
                  className="font-medium underline underline-offset-2"
                >
                  AI agents
                </Link>
                .
              </Notice>
            )}
            {agent && (
              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="agent-model">Model</Label>
                  <Input
                    id="agent-model"
                    value={agentModel}
                    onChange={(e) => setAgentModel(e.target.value)}
                    placeholder="Agent default"
                    className="font-mono text-[13px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="instructions">
                    Instructions for the reviewer
                  </Label>
                  <Textarea
                    id="instructions"
                    rows={4}
                    maxLength={4000}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="All SQL goes through db/query.ts; treat raw string concatenation there as critical."
                    className="text-[13px]"
                  />
                </div>
              </div>
            )}
          </fieldset>

          <div className="px-5 py-4">
            <div className="text-[14px] font-medium text-foreground">
              Fail the check on
            </div>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Findings in the diff at or above this severity. AI-dismissed
              findings never fail it.
            </p>
            <SegmentedControl
              label="Fail the check on"
              value={failOn}
              onChange={setFailOn}
              options={FAIL_OPTIONS}
              className="mt-3 text-[12.5px]"
            />
          </div>
        </div>

        <div className="space-y-3 border-t border-border bg-muted/40 px-5 py-4">
          {error && <Notice tone="danger">{error}</Notice>}
          {disconnect.error && (
            <Notice tone="danger">
              {disconnect.error instanceof Error
                ? disconnect.error.message
                : "Failed to disconnect"}
            </Notice>
          )}
          {savedAt === snapshot && (
            <Notice tone="success">Saved. Applies to the next review.</Notice>
          )}
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={update.isPending}>
              {update.isPending && <Spinner className="animate-spin" />}
              Save policy
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="ml-auto text-destructive hover:bg-destructive/[0.07] hover:text-destructive"
              disabled={disconnect.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Disconnect ${repo.fullName}? Its review history is deleted.`,
                  )
                ) {
                  disconnect.mutate(repo.id, {
                    onSuccess: () =>
                      navigate({ to: "/dashboard/repositories" }),
                  });
                }
              }}
            >
              <Trash />
              Disconnect
            </Button>
          </div>
        </div>
      </form>
    </Panel>
  );
}
