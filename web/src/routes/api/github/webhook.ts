import { chunk } from "@openvscan/db";
import { CHECK_NAME, verifyWebhookSignature } from "@openvscan/github";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  cancelActiveRunsForPr,
  createAndStartRun,
  releaseRepositories,
} from "@/lib/runs";
import { getEnv } from "@/src/lib/env";

/**
 * GitHub App webhook. Events (configure on the App):
 *   pull_request, check_run, installation, installation_repositories,
 *   repository
 *
 * A PR open/push/reopen/ready-for-review creates a review run and hands it
 * to the engine; the engine reports back through a Check Run, a PR review
 * and a sticky summary comment.
 */

const ok = () => new Response("ok", { status: 200 });

type GhUser = { login: string; avatar_url?: string };

type PullRequestPayload = {
  action: string;
  number: number;
  pull_request: {
    number: number;
    title: string;
    html_url: string;
    state: "open" | "closed";
    merged?: boolean;
    draft?: boolean;
    user: GhUser;
    head: { ref: string; sha: string; repo: { full_name: string } | null };
    base: { ref: string; sha: string };
  };
  repository: RepoPayload;
};

/** The `repository` object GitHub sends with every repo-scoped event. */
type RepoPayload = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
};

type CheckRunPayload = {
  action: string;
  check_run: {
    name: string;
    head_sha: string;
    pull_requests: { number: number }[];
  };
  repository: { id: number };
};

const REVIEW_ACTIONS = new Set([
  "opened",
  "reopened",
  "synchronize",
  "ready_for_review",
]);

function connectedRepo(githubRepoId: number) {
  return getDb().query.repository.findFirst({
    where: eq(schema.repository.githubRepoId, String(githubRepoId)),
    with: { installation: { columns: { suspendedAt: true } } },
  });
}

/** Keep name, owner, visibility and default branch in step with GitHub. */
async function syncRepoMetadata(
  repo: {
    id: string;
    fullName: string;
    private: boolean;
    defaultBranch: string;
  },
  gh: RepoPayload,
) {
  if (
    repo.fullName === gh.full_name &&
    repo.private === gh.private &&
    repo.defaultBranch === gh.default_branch
  )
    return;
  await getDb()
    .update(schema.repository)
    .set({
      owner: gh.owner.login,
      name: gh.name,
      fullName: gh.full_name,
      private: gh.private,
      defaultBranch: gh.default_branch,
    })
    .where(eq(schema.repository.id, repo.id));
}

/** Insert or refresh our copy of the PR from the webhook payload. */
async function upsertPullRequest(
  repositoryId: string,
  pr: PullRequestPayload["pull_request"],
) {
  const db = getDb();
  const values = {
    title: pr.title.slice(0, 500),
    author: pr.user.login,
    authorAvatar: pr.user.avatar_url ?? null,
    url: pr.html_url,
    state: pr.merged ? ("merged" as const) : pr.state,
    draft: Boolean(pr.draft),
    headRef: pr.head.ref,
    headSha: pr.head.sha,
    baseRef: pr.base.ref,
    baseSha: pr.base.sha,
    // A deleted fork has no head repo; fall back to the ref for display.
    headRepoFullName: pr.head.repo?.full_name ?? pr.head.ref,
  };
  const existing = await db.query.pullRequest.findFirst({
    where: and(
      eq(schema.pullRequest.repositoryId, repositoryId),
      eq(schema.pullRequest.number, pr.number),
    ),
  });
  if (existing) {
    await db
      .update(schema.pullRequest)
      .set(values)
      .where(eq(schema.pullRequest.id, existing.id));
    return { ...existing, ...values };
  }
  const id = crypto.randomUUID();
  await db
    .insert(schema.pullRequest)
    .values({ id, repositoryId, number: pr.number, ...values })
    // Two deliveries racing on the same PR: the unique index wins, refresh instead.
    .onConflictDoUpdate({
      target: [schema.pullRequest.repositoryId, schema.pullRequest.number],
      set: values,
    });
  const row = await db.query.pullRequest.findFirst({
    where: and(
      eq(schema.pullRequest.repositoryId, repositoryId),
      eq(schema.pullRequest.number, pr.number),
    ),
  });
  return row!;
}

async function handlePullRequest(payload: PullRequestPayload) {
  const found = await connectedRepo(payload.repository.id);
  if (!found) return; // not connected in OpenVScan
  const { installation, ...repo } = found;
  await syncRepoMetadata(repo, payload.repository);

  const pr = await upsertPullRequest(repo.id, payload.pull_request);

  if (payload.action === "closed") {
    await cancelActiveRunsForPr(pr.id, "Pull request closed");
    return;
  }
  if (!REVIEW_ACTIONS.has(payload.action)) return; // edited, labeled, …
  if (!repo.autoReview || installation.suspendedAt) return;
  if (pr.draft && repo.skipDrafts) return;

  // GitHub redelivers webhooks; don't review the same commit twice.
  const db = getDb();
  const duplicate = await db.query.run.findFirst({
    where: and(
      eq(schema.run.pullRequestId, pr.id),
      eq(schema.run.headSha, pr.headSha),
      inArray(schema.run.status, ["queued", "running", "completed"]),
    ),
    columns: { id: true },
  });
  if (duplicate) return;

  await cancelActiveRunsForPr(pr.id, "Superseded by a newer commit");
  await createAndStartRun({
    repo,
    pullRequest: pr,
    trigger: "pull_request",
    headRef: pr.headRef,
    headSha: pr.headSha,
    baseSha: pr.baseSha,
  });
}

/** "Re-run" clicked on our check in the GitHub UI. */
async function handleCheckRun(payload: CheckRunPayload) {
  if (payload.action !== "rerequested") return;
  if (payload.check_run.name !== CHECK_NAME) return;
  const found = await connectedRepo(payload.repository.id);
  if (!found || found.installation.suspendedAt) return;
  const { installation: _installation, ...repo } = found;

  const db = getDb();
  const prNumber = payload.check_run.pull_requests[0]?.number;
  const pr = prNumber
    ? await db.query.pullRequest.findFirst({
        where: and(
          eq(schema.pullRequest.repositoryId, repo.id),
          eq(schema.pullRequest.number, prNumber),
        ),
      })
    : await db.query.pullRequest.findFirst({
        where: and(
          eq(schema.pullRequest.repositoryId, repo.id),
          eq(schema.pullRequest.headSha, payload.check_run.head_sha),
        ),
      });
  if (!pr) return;

  await cancelActiveRunsForPr(pr.id, "Re-run requested from GitHub");
  await createAndStartRun({
    repo,
    pullRequest: pr,
    trigger: "pull_request",
    headRef: pr.headRef,
    headSha: payload.check_run.head_sha,
    baseSha: pr.baseSha,
  });
}

type InstallationRepoChange = {
  installation: { id: number };
  repositories_removed?: { id: number }[];
};

/** Drop repository rows GitHub tells us are no longer accessible. */
async function handleInstallationRepos(payload: InstallationRepoChange) {
  const removed = (payload.repositories_removed ?? []).map((r) => String(r.id));
  if (removed.length === 0) return;
  const db = getDb();
  for (const part of chunk(removed, 90)) {
    const rows = await db.query.repository.findMany({
      where: inArray(schema.repository.githubRepoId, part),
      columns: { id: true },
    });
    if (rows.length === 0) continue;
    const ids = rows.map((r) => r.id);
    await releaseRepositories(ids, "Repository removed from the GitHub App");
    await db
      .delete(schema.repository)
      .where(inArray(schema.repository.id, ids));
  }
}

/** Installation removed, suspended or unsuspended on GitHub. */
async function handleInstallation(payload: {
  action: string;
  installation: { id: number };
}) {
  const db = getDb();
  const inst = await db.query.githubInstallation.findFirst({
    where: eq(
      schema.githubInstallation.installationId,
      String(payload.installation.id),
    ),
    with: { repositories: { columns: { id: true } } },
  });
  if (!inst) return;
  if (payload.action === "deleted") {
    await releaseRepositories(
      inst.repositories.map((r) => r.id),
      "GitHub App uninstalled",
    );
    // Cascades to the installation's repositories (and their PRs/runs).
    await db
      .delete(schema.githubInstallation)
      .where(eq(schema.githubInstallation.id, inst.id));
  } else if (payload.action === "suspend" || payload.action === "unsuspend") {
    await db
      .update(schema.githubInstallation)
      .set({ suspendedAt: payload.action === "suspend" ? new Date() : null })
      .where(eq(schema.githubInstallation.id, inst.id));
  }
}

/** Repository renamed, transferred, made private/public, or deleted. */
async function handleRepository(payload: {
  action: string;
  repository: RepoPayload;
}) {
  const repo = await connectedRepo(payload.repository.id);
  if (!repo) return;
  if (payload.action === "deleted") {
    await releaseRepositories([repo.id], "Repository deleted on GitHub");
    await getDb()
      .delete(schema.repository)
      .where(eq(schema.repository.id, repo.id));
    return;
  }
  await syncRepoMetadata(repo, payload.repository);
}

export const Route = createFileRoute("/api/github/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = getEnv("GITHUB_WEBHOOK_SECRET");
        const signature = request.headers.get("x-hub-signature-256");
        const event = request.headers.get("x-github-event");
        const raw = await request.text();

        if (!secret || !signature) {
          return new Response("webhook not configured", { status: 401 });
        }
        const valid = await verifyWebhookSignature(secret, raw, signature);
        if (!valid) return new Response("invalid signature", { status: 401 });

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("invalid json", { status: 400 });
        }

        try {
          switch (event) {
            case "pull_request":
              await handlePullRequest(payload as unknown as PullRequestPayload);
              break;
            case "check_run":
              await handleCheckRun(payload as unknown as CheckRunPayload);
              break;
            case "installation_repositories":
              await handleInstallationRepos(
                payload as unknown as InstallationRepoChange,
              );
              break;
            case "installation":
              await handleInstallation(
                payload as unknown as {
                  action: string;
                  installation: { id: number };
                },
              );
              break;
            case "repository":
              await handleRepository(
                payload as unknown as {
                  action: string;
                  repository: RepoPayload;
                },
              );
              break;
            default:
              break; // ignore other events (ping, push, …)
          }
        } catch (e) {
          // A 500 marks the delivery failed, so it can be redelivered from
          // the App's settings once the cause is fixed.
          console.error("webhook handler error", event, e);
          return new Response("handler error", { status: 500 });
        }

        return ok();
      },
    },
  },
});
