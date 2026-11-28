import { AGENT_INFO, REVIEW_TRIGGER_INFO } from "@openvscan/core";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import Link from "@/components/AppLink";
import { AgentLogo } from "@/components/brand/AgentLogo";
import { BrushPanel } from "@/components/brand/BrushPanel";
import { SeverityCountsInline, timeAgo } from "@/components/dashboard/RunList";
import {
  EmptyState,
  GithubAvatar,
  ListHead,
  Loading,
  Notice,
  PageHeader,
  Panel,
} from "@/components/dashboard/ui";
import {
  Folder,
  Github,
  Lock,
  Plus,
  Refresh,
  Spinner,
} from "@/components/icons";
import { HeroFindings } from "@/components/landing/product";
import { RunGlyph, runOutcomeLabel } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/Input";
import {
  useConnectableReposQuery,
  useConnectRepositoryMutation,
  useGithubConnectionQuery,
  useRepositoriesQuery,
  useSyncGithubMutation,
} from "@/lib/api";
import { cn } from "@/lib/utils";

/** Error codes the GitHub App setup callback (api/github/setup) may return. */
const SETUP_ERRORS: Record<string, string> = {
  missing_installation:
    "GitHub didn't say which installation to connect. Install the App again.",
  invalid: "That installation id isn't valid.",
  github_not_linked:
    "Link your GitHub account in Settings → GitHub account, then install the App again.",
  not_admin:
    "Only the account owner or an organization admin can connect this installation.",
  taken: "This installation is already connected to another OpenVScan account.",
  failed: "Something went wrong talking to GitHub. Try again.",
};

export const Route = createFileRoute("/dashboard/repositories/")({
  // The GitHub App setup callback redirects back here with ?error= / ?connected=.
  validateSearch: (
    search: Record<string, unknown>,
  ): { error?: string; connected?: boolean } => ({
    error:
      typeof search.error === "string"
        ? (SETUP_ERRORS[search.error] ?? SETUP_ERRORS.failed)
        : undefined,
    connected: search.connected ? true : undefined,
  }),
  component: RepositoriesPage,
});

const REPO_GRID =
  "md:grid md:grid-cols-[minmax(0,1fr)_130px_120px_230px] md:items-center md:gap-4";

function RepositoriesPage() {
  const search = Route.useSearch();
  const { data: connection, isLoading: connLoading } =
    useGithubConnectionQuery();
  const { data: repositories = [], isLoading: reposLoading } =
    useRepositoriesQuery();
  const hasInstallation = (connection?.installations.length ?? 0) > 0;
  const sync = useSyncGithubMutation();
  const suspended = connection?.installations.filter((i) => i.suspendedAt);

  return (
    <>
      <PageHeader
        title="Repositories"
        description="Connected repositories and when their pull requests get reviewed."
        actions={
          hasInstallation ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={sync.isPending}
                onClick={() => sync.mutate()}
                title="Re-check installations and repositories on GitHub"
              >
                <Refresh className={cn(sync.isPending && "animate-spin")} />
                {sync.isPending ? "Syncing…" : "Sync"}
              </Button>
              {connection?.installUrl && (
                <Button variant="outline" asChild>
                  <a href={connection.installUrl}>
                    <Github />
                    Manage on GitHub
                  </a>
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      {sync.isError && (
        <Notice tone="danger" className="mb-6">
          Sync failed:{" "}
          {sync.error instanceof Error ? sync.error.message : "unknown error"}
        </Notice>
      )}
      {sync.data && (
        <Notice tone="success" className="mb-6">
          In sync with GitHub.
          {sync.data.updated > 0 && ` Updated ${sync.data.updated}.`}
          {sync.data.removed > 0 &&
            ` Removed ${sync.data.removed} no longer accessible.`}
        </Notice>
      )}
      {suspended && suspended.length > 0 && (
        <Notice tone="warning" className="mb-6">
          The GitHub App is suspended on{" "}
          {suspended.map((i) => i.accountLogin).join(", ")}. Reviews are paused
          until it&apos;s unsuspended on GitHub.
        </Notice>
      )}

      {search.error && (
        <Notice tone="danger" className="mb-6">
          GitHub setup failed: {search.error}
        </Notice>
      )}
      {search.connected && (
        <Notice tone="success" className="mb-6">
          GitHub App installed. Connect the repositories you want reviewed
          below.
        </Notice>
      )}

      {connLoading ? (
        <Loading />
      ) : !hasInstallation && !connection?.configured ? (
        <Panel>
          <EmptyState icon={Github} title="GitHub isn't configured here">
            This deployment has no GitHub App credentials. See{" "}
            <Link href="/docs/github-app" className="link-underline">
              Register a GitHub App
            </Link>{" "}
            to set one up.
          </EmptyState>
        </Panel>
      ) : !hasInstallation ? (
        <InstallPrompt
          installUrl={connection?.installUrl ?? null}
          githubLogin={connection?.githubLogin ?? null}
          linkConfigured={connection?.linkConfigured ?? false}
        />
      ) : (
        <div className="space-y-6">
          <Panel
            title="Connected"
            description={`${repositories.length} ${repositories.length === 1 ? "repository" : "repositories"}`}
          >
            {reposLoading ? (
              <Loading className="py-10" />
            ) : repositories.length === 0 ? (
              <EmptyState icon={Folder} title="No repositories yet">
                Pick one from the list below to start reviewing its pull
                requests.
              </EmptyState>
            ) : (
              <>
                <ListHead className={REPO_GRID}>
                  <span>Repository</span>
                  <span>Reviews</span>
                  <span>Agent</span>
                  <span className="text-right">Last review</span>
                </ListHead>
                <div className="divide-y divide-border">
                  {repositories.map((repo) => {
                    const latest = repo.runs[0];
                    return (
                      <Link
                        key={repo.id}
                        href={`/dashboard/repositories/${repo.id}`}
                        className={cn(
                          "flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-accent/60",
                          REPO_GRID,
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <GithubAvatar
                            login={repo.owner}
                            className="size-7 rounded-[6px]"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 truncate text-[14px] font-medium text-foreground">
                              <span className="truncate">{repo.fullName}</span>
                              {repo.private && (
                                <Lock
                                  size={12}
                                  className="shrink-0 text-muted-foreground"
                                />
                              )}
                            </div>
                            <div className="mt-0.5 text-[12.5px] text-muted-foreground md:hidden">
                              {REVIEW_TRIGGER_INFO[repo.reviewTrigger].label} ·{" "}
                              {latest
                                ? timeAgo(latest.createdAt)
                                : "no reviews"}
                            </div>
                          </div>
                        </div>
                        <div className="hidden text-[13px] text-foreground md:block">
                          {repo.reviewTrigger === "request" ? (
                            <span className="text-muted-foreground">
                              On request
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="size-1.5 rounded-full bg-accent-brand" />
                              {REVIEW_TRIGGER_INFO[repo.reviewTrigger].label}
                            </span>
                          )}
                        </div>
                        <div className="hidden text-[13px] text-foreground md:block">
                          {repo.agent ? (
                            <span className="inline-flex items-center gap-2">
                              <AgentLogo
                                agent={repo.agent}
                                className="size-3.5"
                              />
                              {AGENT_INFO[repo.agent].label}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              Scanners only
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center justify-end gap-3">
                          {latest ? (
                            <>
                              {latest.status === "completed" && (
                                <SeverityCountsInline
                                  counts={latest.counts}
                                  className="hidden xl:inline-flex"
                                />
                              )}
                              <span className="hidden whitespace-nowrap text-[12.5px] text-muted-foreground sm:inline">
                                {timeAgo(latest.createdAt)}
                              </span>
                              <span
                                title={runOutcomeLabel(
                                  latest.status,
                                  latest.conclusion,
                                )}
                              >
                                <RunGlyph
                                  status={latest.status}
                                  conclusion={latest.conclusion}
                                />
                              </span>
                            </>
                          ) : (
                            <span className="text-[12.5px] text-muted-foreground">
                              No reviews
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </Panel>

          {connection?.configured && <ConnectPanel />}
        </div>
      )}
    </>
  );
}

function ConnectPanel() {
  const { data: connectable = [], isLoading } = useConnectableReposQuery(true);
  const connect = useConnectRepositoryMutation();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? connectable.filter((r) => r.fullName.toLowerCase().includes(q))
      : connectable;
  }, [connectable, query]);

  return (
    <Panel
      title="Add a repository"
      description="Repositories the GitHub App can see that aren't connected yet"
      actions={
        connectable.length > 6 && (
          <SearchInput
            aria-label="Search repositories"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-[200px]"
            inputClassName="h-8 text-[13px]"
          />
        )
      }
    >
      {isLoading ? (
        <Loading className="py-10" />
      ) : connectable.length === 0 ? (
        <p className="px-5 py-6 text-[13.5px] text-muted-foreground">
          Nothing left to connect. Give the GitHub App access to more
          repositories to see them here.
        </p>
      ) : (
        <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
          {visible.map((repo) => (
            <div
              key={repo.githubRepoId}
              className="flex items-center justify-between gap-4 px-5 py-2.5"
            >
              <span className="flex min-w-0 items-center gap-2 text-[13.5px] text-foreground">
                <Folder size={15} className="shrink-0 text-muted-foreground" />
                <span className="truncate">{repo.fullName}</span>
                {repo.private && (
                  <Lock size={12} className="shrink-0 text-muted-foreground" />
                )}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={connect.isPending}
                onClick={async () => {
                  setPending(repo.githubRepoId);
                  try {
                    await connect.mutateAsync(repo.githubRepoId);
                  } finally {
                    setPending(null);
                  }
                }}
              >
                {pending === repo.githubRepoId ? (
                  <Spinner className="animate-spin" />
                ) : (
                  <Plus />
                )}
                Connect
              </Button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

const LINK_HREF = `/api/github/link?redirect=${encodeURIComponent("/dashboard/repositories")}`;

function InstallPrompt({
  installUrl,
  githubLogin,
  linkConfigured,
}: {
  installUrl: string | null;
  githubLogin: string | null;
  linkConfigured: boolean;
}) {
  // Installing is checked against the user's own GitHub account, so that
  // comes first; otherwise GitHub sends them back here with an error.
  const linked = Boolean(githubLogin);
  return (
    <Panel>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col justify-center p-8 sm:p-10">
          <div className="eyebrow text-[10.5px] text-muted-foreground">
            Step {linked ? 2 : 1} of 4
          </div>
          {linked ? (
            <>
              <h2 className="mt-3 font-display text-[30px] leading-[1.1] tracking-[-0.02em] text-foreground">
                Install the GitHub App
              </h2>
              <p className="mt-3 max-w-[420px] text-[14.5px] leading-relaxed text-muted-foreground">
                Choose the repositories OpenVScan may read. It asks for read
                access to code and write access to checks and pull request
                comments, nothing else.
              </p>
              <ul className="mt-5 space-y-2 text-[13.5px] text-foreground">
                {[
                  "Contents: read",
                  "Checks and pull requests: read & write",
                  "Revoke any time from GitHub settings",
                ].map((p) => (
                  <li key={p} className="flex items-center gap-2.5">
                    <span className="h-px w-3 bg-foreground" />
                    {p}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-[13px] text-muted-foreground">
                Linked as{" "}
                <span className="font-medium text-foreground">
                  @{githubLogin}
                </span>
                . Install it on that account or on an organization you
                administer.
              </p>
              {installUrl && (
                <div className="mt-6">
                  <Button size="lg" asChild>
                    <a href={installUrl}>
                      <Github />
                      Install GitHub App
                    </a>
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <h2 className="mt-3 font-display text-[30px] leading-[1.1] tracking-[-0.02em] text-foreground">
                Link your GitHub account
              </h2>
              <p className="mt-3 max-w-[420px] text-[14.5px] leading-relaxed text-muted-foreground">
                OpenVScan checks that you own the account or administer the
                organization you install the App on, so only you can connect its
                repositories. Linking reads your GitHub identity; it does not
                grant access to code.
              </p>
              {linkConfigured ? (
                <div className="mt-7">
                  <Button size="lg" asChild>
                    <a href={LINK_HREF}>
                      <Github />
                      Link GitHub account
                    </a>
                  </Button>
                </div>
              ) : (
                <Notice tone="warning" className="mt-6">
                  GitHub linking isn&apos;t configured on this deployment. Set
                  GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.
                </Notice>
              )}
            </>
          )}
        </div>
        <BrushPanel
          id="install"
          tone="moss"
          className="hidden min-h-[360px] items-center justify-center p-10 lg:flex"
        >
          <HeroFindings limit={3} className="max-w-[440px]" />
        </BrushPanel>
      </div>
    </Panel>
  );
}
