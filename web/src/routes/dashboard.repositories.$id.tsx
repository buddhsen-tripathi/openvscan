import {
  AGENT_INFO,
  AGENT_MODELS,
  AGENT_PROVIDERS,
  type AgentProvider,
  FAIL_THRESHOLDS,
  type FailThreshold,
  PR_COMMAND_INFO,
  PR_COMMANDS,
  REVIEW_FOCUS,
  REVIEW_FOCUS_INFO,
  REVIEW_TRIGGER_INFO,
  REVIEW_TRIGGERS,
  type ReviewFocus,
  type ReviewTrigger,
  SCANNER_INFO,
  SCANNERS,
  type Scanner,
} from "@openvscan/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import Link from "@/components/AppLink";
import { AgentLogo } from "@/components/brand/AgentLogo";
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
  SettingsSection,
  Switch,
  TabBar,
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
import { Input, Textarea } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import {
  useCredentialsQuery,
  useDisconnectRepositoryMutation,
  useRepositoryQuery,
  useSkillsQuery,
  useStartManualRunMutation,
  useUpdateRepositorySettingsMutation,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type Tab = "overview" | "settings";

export const Route = createFileRoute("/dashboard/repositories/$id")({
  validateSearch: (search: Record<string, unknown>): { tab?: "settings" } => ({
    tab: search.tab === "settings" ? "settings" : undefined,
  }),
  component: RepositoryDetailPage,
});

type Repo = NonNullable<ReturnType<typeof useRepositoryQuery>["data"]>;

function RepositoryDetailPage() {
  const { id } = Route.useParams();
  const { tab = "overview" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
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
  const setTab = (t: Tab) =>
    navigate({ search: t === "settings" ? { tab: t } : {}, replace: true });

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
            <TriggerBadge trigger={repo.reviewTrigger} />
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

      <div className="mb-6 border-b border-border">
        <TabBar
          label="Repository"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "overview", label: "Overview" },
            { key: "settings", label: "Review policy" },
          ]}
        />
      </div>

      {tab === "settings" ? (
        <SettingsForm repo={repo} />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
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
            <PolicySummary repo={repo} onEdit={() => setTab("settings")} />
          </div>
        </div>
      )}
    </>
  );
}

function TriggerBadge({ trigger }: { trigger: ReviewTrigger }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "size-1.5 rounded-full",
          trigger === "request" ? "bg-muted-foreground/50" : "bg-accent-brand",
        )}
      />
      {REVIEW_TRIGGER_INFO[trigger].label}
    </span>
  );
}

/* -------------------------------- Overview -------------------------------- */

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

/** The policy at a glance, so the overview answers "what will happen?". */
function PolicySummary({ repo, onEdit }: { repo: Repo; onEdit: () => void }) {
  const rows: [string, string][] = [
    ["Reviews", REVIEW_TRIGGER_INFO[repo.reviewTrigger].label],
    ["Branches", repo.baseBranches.join(", ") || "All"],
    [
      "Scanners",
      repo.scanners.length
        ? repo.scanners.map((s) => SCANNER_INFO[s].label).join(", ")
        : "None",
    ],
    [
      "AI reviewer",
      repo.agent
        ? [AGENT_INFO[repo.agent].label, repo.agentModel]
            .filter(Boolean)
            .join(" · ")
        : "Off",
    ],
    [
      "Focus",
      repo.focus.length
        ? repo.focus.map((f) => REVIEW_FOCUS_INFO[f].label).join(", ")
        : "General",
    ],
    ["Skills", repo.skills.length ? `${repo.skills.length} selected` : "None"],
    ["Fails on", FAIL_LABELS[repo.failOn]],
  ];
  return (
    <Panel
      title="Review policy"
      actions={
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
      }
    >
      <dl className="divide-y divide-border text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-5 py-2.5">
            <dt className="shrink-0 text-muted-foreground">{k}</dt>
            <dd className="min-w-0 text-right text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function PullRequests({ repo }: { repo: Repo }) {
  const prs = repo.pullRequests;
  return (
    <Panel title="Pull requests">
      {prs.length === 0 ? (
        <EmptyState icon={GitPullRequest} title="No pull requests yet">
          {repo.reviewTrigger === "request"
            ? "Reviews run when someone comments a review command on a pull request."
            : "Open a pull request and the review starts within a minute."}
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
                    {pr.paused && (
                      <Pill tone="outline" className="ml-2">
                        paused
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

/* --------------------------------- Settings -------------------------------- */

const MODEL_EXAMPLE: Record<AgentProvider, string> = {
  claude: "claude-opus-5-5",
  codex: "gpt-5",
  cursor: "auto",
};

const AGENT_OPTIONS: { value: AgentProvider | null; label: ReactNode }[] = [
  { value: null, label: <AgentOption name="None" detail="Scanners only" /> },
  ...AGENT_PROVIDERS.map((p) => ({
    value: p,
    label: (
      <AgentOption
        name={AGENT_INFO[p].label}
        detail={AGENT_INFO[p].cmd}
        logo={<AgentLogo agent={p} />}
      />
    ),
  })),
];

function AgentOption({
  name,
  detail,
  logo,
}: {
  name: string;
  detail: string;
  logo?: ReactNode;
}) {
  return (
    <span className="flex items-center justify-center gap-2.5 py-0.5">
      {logo}
      <span className="text-left">
        <span className="block font-medium">{name}</span>
        <span className="block font-mono text-[10.5px] font-normal opacity-70">
          {detail}
        </span>
      </span>
    </span>
  );
}

const FAIL_LABELS: Record<FailThreshold, string> = {
  critical: "Critical only",
  high: "High or above",
  medium: "Medium or above",
  low: "Low or above",
  never: "Never (report only)",
};
const FAIL_OPTIONS = FAIL_THRESHOLDS.map((t) => ({
  value: t,
  label: FAIL_LABELS[t],
}));
const TRIGGER_OPTIONS = REVIEW_TRIGGERS.map((t) => ({
  value: t,
  label: REVIEW_TRIGGER_INFO[t].label,
}));

/** Select value for the CLI default and for a model typed by hand. */
const DEFAULT_MODEL = "default";
const CUSTOM_MODEL = "custom";

function modelOptions(agent: AgentProvider) {
  return [
    ...AGENT_MODELS[agent].map((m) => ({
      value: m.value ?? DEFAULT_MODEL,
      label: m.label,
    })),
    { value: CUSTOM_MODEL, label: "Custom model id…" },
  ];
}

function modelChoice(agent: AgentProvider | null, model: string | null) {
  if (!model) return DEFAULT_MODEL;
  return agent && AGENT_MODELS[agent].some((m) => m.value === model)
    ? model
    : CUSTOM_MODEL;
}

const lines = (text: string) =>
  text
    .split(/[\n,]/)
    .map((l) => l.trim())
    .filter(Boolean);

type Policy = Pick<
  Repo,
  | "reviewTrigger"
  | "skipDrafts"
  | "baseBranches"
  | "scanners"
  | "agent"
  | "agentModel"
  | "focus"
  | "skills"
  | "instructions"
  | "failOn"
  | "ignorePaths"
>;

/** Form state for a saved policy (lists as editable text). */
function formFrom(p: Policy) {
  const model = modelChoice(p.agent, p.agentModel);
  return {
    reviewTrigger: p.reviewTrigger,
    skipDrafts: p.skipDrafts,
    baseBranches: p.baseBranches.join(", "),
    scanners: p.scanners,
    agent: p.agent,
    model,
    customModel: model === CUSTOM_MODEL ? (p.agentModel ?? "") : "",
    focus: p.focus,
    skills: p.skills,
    instructions: p.instructions ?? "",
    failOn: p.failOn,
    ignorePaths: p.ignorePaths.join("\n"),
  };
}

function SettingsForm({ repo }: { repo: Repo }) {
  const navigate = useNavigate();
  const update = useUpdateRepositorySettingsMutation(repo.id);
  const disconnect = useDisconnectRepositoryMutation();
  const { data: creds } = useCredentialsQuery();

  const initial = formFrom(repo);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: v }));
  };
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const missingCredential =
    form.agent !== null &&
    creds !== undefined &&
    !creds.credentials.some((c) => c.provider === form.agent);

  const toggle = <T,>(list: T[], item: T) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  const changeAgent = (agent: AgentProvider | null) => {
    set("agent", agent);
    // A Claude alias means nothing to Codex: fall back to the default.
    if (agent && !modelOptions(agent).some((o) => o.value === form.model)) {
      set("model", DEFAULT_MODEL);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const updated = await update.mutateAsync({
        reviewTrigger: form.reviewTrigger,
        skipDrafts: form.skipDrafts,
        baseBranches: lines(form.baseBranches),
        scanners: form.scanners,
        agent: form.agent,
        agentModel:
          form.model === CUSTOM_MODEL
            ? form.customModel.trim() || null
            : form.model === DEFAULT_MODEL
              ? null
              : form.model,
        focus: form.focus,
        skills: form.skills,
        instructions: form.instructions.trim() || null,
        failOn: form.failOn,
        ignorePaths: lines(form.ignorePaths),
      });
      setForm(formFrom(updated));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    }
  };

  return (
    <form onSubmit={handleSave} className="pb-24">
      <SettingsSection
        title="When to review"
        description="Which pull request events start a review. Anyone with write access can still ask for one with a comment."
      >
        <Panel>
          <div className="divide-y divide-border">
            <SettingRow
              title="Review pull requests"
              description={REVIEW_TRIGGER_INFO[form.reviewTrigger].description}
            >
              <Select
                aria-label="Review pull requests"
                value={form.reviewTrigger}
                onChange={(v) => set("reviewTrigger", v)}
                options={TRIGGER_OPTIONS}
                className="w-full sm:w-[200px]"
              />
            </SettingRow>
            <SettingRow
              title="Skip drafts"
              description="Wait until a pull request is marked ready for review."
            >
              <Switch
                checked={form.skipDrafts}
                onChange={(v) => set("skipDrafts", v)}
                label="Skip draft pull requests"
              />
            </SettingRow>
            <SettingRow
              title="Target branches"
              description="Only review pull requests into these branches automatically. Leave empty for all."
            >
              <Input
                aria-label="Target branches"
                value={form.baseBranches}
                onChange={(e) => set("baseBranches", e.target.value)}
                placeholder="All branches"
                className="w-full font-mono text-[13px] sm:w-[260px]"
              />
            </SettingRow>
          </div>
        </Panel>
      </SettingsSection>

      <SettingsSection
        title="Scanners"
        description="Open-source scanners that run in an isolated container. On a pull request, dependency, infrastructure and workflow scanners run only when the change touches files they read."
      >
        <div className="grid gap-3 md:grid-cols-3">
          {SCANNERS.map((s) => (
            <CheckCard
              key={s}
              checked={form.scanners.includes(s)}
              onChange={() =>
                set("scanners", toggle<Scanner>(form.scanners, s))
              }
              title={SCANNER_INFO[s].label}
              description={SCANNER_INFO[s].description}
            />
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        title="AI review"
        description="A coding agent triages scanner findings and reviews the diff, using your own credential."
      >
        <Panel>
          <div className="space-y-5 p-5">
            <SegmentedControl
              label="AI reviewer"
              value={form.agent}
              onChange={changeAgent}
              options={AGENT_OPTIONS}
            />
            {missingCredential && (
              <Notice tone="warning" className="text-[12.5px]">
                No {AGENT_INFO[form.agent as AgentProvider].label} credential
                saved, so reviews skip the AI step. Add one in{" "}
                <Link
                  href="/dashboard/settings#agents"
                  className="font-medium underline underline-offset-2"
                >
                  AI agents
                </Link>
                .
              </Notice>
            )}
          </div>
          {form.agent && (
            <div className="divide-y divide-border border-t border-border">
              <SettingRow
                title="Model"
                description={
                  form.model === CUSTOM_MODEL
                    ? "Any model id the CLI accepts."
                    : `${AGENT_MODELS[form.agent].find((m) => (m.value ?? DEFAULT_MODEL) === form.model)?.hint ?? ""}.${form.agent === "claude" ? " Aliases follow the newest model of each tier." : ""}`
                }
              >
                <div className="flex w-full flex-col gap-2 sm:w-[260px]">
                  <Select
                    aria-label="Model"
                    value={form.model}
                    onChange={(v) => set("model", v)}
                    options={modelOptions(form.agent)}
                  />
                  {form.model === CUSTOM_MODEL && (
                    <Input
                      aria-label="Custom model id"
                      value={form.customModel}
                      onChange={(e) => set("customModel", e.target.value)}
                      placeholder={MODEL_EXAMPLE[form.agent as AgentProvider]}
                      className="font-mono text-[13px]"
                    />
                  )}
                </div>
              </SettingRow>
              <div className="px-5 py-4">
                <div className="text-[14px] font-medium text-foreground">
                  Focus areas
                </div>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Extra checklists for the reviewer. Pick what this codebase is.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {REVIEW_FOCUS.map((f) => (
                    <CheckCard
                      key={f}
                      compact
                      checked={form.focus.includes(f)}
                      onChange={() =>
                        set("focus", toggle<ReviewFocus>(form.focus, f))
                      }
                      title={REVIEW_FOCUS_INFO[f].label}
                      description={REVIEW_FOCUS_INFO[f].description}
                    />
                  ))}
                </div>
              </div>
              <SkillPicker
                value={form.skills}
                onChange={(v) => set("skills", v)}
              />
              <div className="space-y-2 px-5 py-4">
                <label
                  htmlFor="instructions"
                  className="block text-[14px] font-medium text-foreground"
                >
                  Instructions
                </label>
                <Textarea
                  id="instructions"
                  rows={4}
                  maxLength={4000}
                  value={form.instructions}
                  onChange={(e) => set("instructions", e.target.value)}
                  placeholder="All SQL goes through db/query.ts; treat raw string concatenation there as critical."
                  className="text-[13px]"
                />
                <p className="text-right text-[12px] text-muted-foreground tabular">
                  {form.instructions.length} / 4000
                </p>
              </div>
            </div>
          )}
        </Panel>
      </SettingsSection>

      <SettingsSection
        title="Check result"
        description="When the GitHub check fails, and which files never count."
      >
        <Panel>
          <div className="divide-y divide-border">
            <SettingRow
              title="Fail the check on"
              description="Findings in the diff at or above this severity. AI-dismissed findings never fail it."
            >
              <Select
                aria-label="Fail the check on"
                value={form.failOn}
                onChange={(v) => set("failOn", v)}
                options={FAIL_OPTIONS}
                className="w-full sm:w-[200px]"
              />
            </SettingRow>
            <div className="space-y-2 px-5 py-4">
              <label
                htmlFor="ignore-paths"
                className="block text-[14px] font-medium text-foreground"
              >
                Ignored paths
              </label>
              <p className="text-[13px] text-muted-foreground">
                One glob per line. Findings in matching files are dropped.
              </p>
              <Textarea
                id="ignore-paths"
                rows={3}
                value={form.ignorePaths}
                onChange={(e) => set("ignorePaths", e.target.value)}
                placeholder={"vendor/**\n**/fixtures/**\n*.min.js"}
                className="font-mono text-[12.5px]"
              />
            </div>
          </div>
        </Panel>
      </SettingsSection>

      <SettingsSection
        title="Pull request commands"
        description="Comment on a pull request to drive the bot. Only people with write access are heard."
      >
        <CommandsCard slug={repo.appSlug} />
      </SettingsSection>

      <SettingsSection
        title="Danger zone"
        description="Stops reviews and deletes this repository's review history from OpenVScan."
      >
        <Panel className="border-destructive/30">
          <SettingRow
            title="Disconnect repository"
            description="The GitHub App stays installed; reconnect any time."
          >
            <Button
              type="button"
              variant="destructive"
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
              {disconnect.isPending ? (
                <Spinner className="animate-spin" />
              ) : (
                <Trash />
              )}
              Disconnect
            </Button>
          </SettingRow>
          {disconnect.error && (
            <div className="px-5 pb-4">
              <Notice tone="danger">
                {disconnect.error instanceof Error
                  ? disconnect.error.message
                  : "Failed to disconnect"}
              </Notice>
            </div>
          )}
        </Panel>
      </SettingsSection>

      <SaveBar
        dirty={dirty}
        saved={saved}
        pending={update.isPending}
        error={error}
        onReset={() => {
          setForm(initial);
          setError(null);
        }}
      />
    </form>
  );
}

/** Built-in and the user's own review skills, in selection order. */
function SkillPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const { data } = useSkillsQuery();
  const all = data ? [...data.builtins, ...data.skills] : [];
  const toggle = (id: string) =>
    onChange(
      value.includes(id) ? value.filter((x) => x !== id) : [...value, id],
    );
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="text-[14px] font-medium text-foreground">
          Review skills
        </div>
        <Link
          href="/dashboard/settings#skills"
          className="text-[12.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Manage skills
        </Link>
      </div>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        Instructions the reviewer reads and applies. If they add up to more than
        120 KB, the ones picked first are kept.
      </p>
      {!data ? (
        <Spinner className="mt-3 size-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {all.map((s) => (
            <CheckCard
              key={s.id}
              compact
              checked={value.includes(s.id)}
              onChange={() => toggle(s.id)}
              title={s.builtin ? s.name : `${s.name} (yours)`}
              description={s.description || "No description"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** A checkbox rendered as a selectable card. */
function CheckCard({
  checked,
  onChange,
  title,
  description,
  compact,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[8px] border bg-card transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent-brand/25",
        compact ? "px-3 py-2.5" : "px-4 py-3.5 shadow-edge",
        checked
          ? "border-foreground/30"
          : "border-border hover:border-input hover:bg-accent/40",
      )}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={onChange}
      />
      <span
        className={cn(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-[4px] border",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input bg-card",
        )}
      >
        {checked && <Check size={11} strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-foreground">
          {title}
        </span>
        <span className="block text-[12.5px] text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  );
}

function CommandsCard({ slug }: { slug: string | null }) {
  if (!slug) {
    return (
      <Notice tone="warning">
        Set <code className="font-mono">GITHUB_APP_SLUG</code> on the web Worker
        to enable comment commands.
      </Notice>
    );
  }
  return (
    <Panel>
      <div className="divide-y divide-border">
        {PR_COMMANDS.map((c) => (
          <div
            key={c}
            className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-3"
          >
            <code className="rounded-[5px] bg-muted px-2 py-0.5 font-mono text-[12.5px] text-foreground">
              @{slug} {c}
            </code>
            <span className="text-[13px] text-muted-foreground">
              {PR_COMMAND_INFO[c]}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Pinned to the bottom of the viewport while there are unsaved changes. */
function SaveBar({
  dirty,
  saved,
  pending,
  error,
  onReset,
}: {
  dirty: boolean;
  saved: boolean;
  pending: boolean;
  error: string | null;
  onReset: () => void;
}) {
  if (!dirty && !saved && !error) return null;
  return (
    <div className="sticky bottom-4 z-20 mt-6">
      <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-border bg-popover px-4 py-3 shadow-float animate-in fade-in-0 slide-in-from-bottom-2 duration-150">
        <span
          className={cn(
            "min-w-0 flex-1 text-[13.5px]",
            error ? "text-status-failed" : "text-foreground",
          )}
        >
          {error ??
            (dirty
              ? "You have unsaved changes."
              : "Saved. Applies from the next review.")}
        </span>
        {dirty && (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={onReset}>
              Discard
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending && <Spinner className="animate-spin" />}
              Save changes
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
