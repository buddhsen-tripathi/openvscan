import {
  AGENT_PROVIDERS,
  type AgentProvider,
  FAIL_THRESHOLDS,
  type FailThreshold,
  REVIEW_FOCUS,
  REVIEW_TRIGGERS,
  type ReviewFocus,
  type ReviewTrigger,
  SCANNERS,
  type Scanner,
} from "@openvscan/core";
import { chunk } from "@openvscan/db";
import {
  appOctokit,
  getBranchHeadSha,
  type InstallationRepo,
} from "@openvscan/github";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  accessibleRepos,
  getAppCreds,
  installUrl,
  isGithubConfigured,
  octokitForInstallation,
} from "@/lib/github";
import { isGithubLinkConfigured, linkedGithub } from "@/lib/github-account";
import { createAndStartRun, releaseRepositories } from "@/lib/runs";
import { requireUserId } from "@/lib/user";
import { getEnv } from "@/src/lib/env";

/* ------------------------- Connection / install ------------------------- */

export const getGithubConnection = createServerFn({ method: "GET" }).handler(
  async () => {
    const userId = await requireUserId();
    const db = getDb();
    const installations = await db.query.githubInstallation.findMany({
      where: eq(schema.githubInstallation.userId, userId),
    });
    const linked = await linkedGithub(userId);
    return {
      configured: isGithubConfigured(),
      installUrl: installUrl(),
      installations,
      // Installing needs a linked GitHub account: the setup callback checks
      // with the user's own token that they own (or admin) the installation.
      githubLogin: linked?.login ?? null,
      linkConfigured: isGithubLinkConfigured(),
    };
  },
);

/** Repos the user's installation(s) can access that aren't connected yet. */
export const listConnectableRepos = createServerFn({ method: "GET" }).handler(
  async () => {
    const userId = await requireUserId();
    const db = getDb();
    const installations = await db.query.githubInstallation.findMany({
      where: eq(schema.githubInstallation.userId, userId),
    });
    if (installations.length === 0) return [];

    const connected = await db.query.repository.findMany({
      where: eq(schema.repository.userId, userId),
      columns: { githubRepoId: true },
    });
    const connectedIds = new Set(connected.map((r) => r.githubRepoId));

    const results: InstallationRepo[] = [];
    for (const inst of installations) {
      try {
        const repos = await accessibleRepos(inst.installationId);
        results.push(...repos.filter((r) => !connectedIds.has(r.githubRepoId)));
      } catch (err) {
        // One unreachable installation shouldn't hide the others.
        console.error(
          "listing repos of installation failed",
          inst.installationId,
          err,
        );
      }
    }
    return results;
  },
);

/* ------------------------------ Repositories ----------------------------- */

async function requireRepo(userId: string, id: string) {
  const repo = await getDb().query.repository.findFirst({
    where: and(
      eq(schema.repository.id, id),
      eq(schema.repository.userId, userId),
    ),
    with: { installation: true },
  });
  if (!repo) throw new Error("Repository not found");
  return repo;
}

export const connectRepository = createServerFn({ method: "POST" })
  .validator((githubRepoId: string) => {
    if (typeof githubRepoId !== "string" || !/^\d+$/.test(githubRepoId)) {
      throw new Error("Invalid repository id");
    }
    return githubRepoId;
  })
  .handler(async ({ data: githubRepoId }) => {
    const userId = await requireUserId();
    const db = getDb();

    const existing = await db.query.repository.findFirst({
      where: eq(schema.repository.githubRepoId, githubRepoId),
    });
    if (existing) {
      if (existing.userId === userId) return existing;
      throw new Error(
        "This repository is already connected by another account",
      );
    }

    const installations = await db.query.githubInstallation.findMany({
      where: eq(schema.githubInstallation.userId, userId),
    });

    // Find the repo + its installation among everything the user can access.
    for (const inst of installations) {
      const repos = await accessibleRepos(inst.installationId);
      const match = repos.find((r) => r.githubRepoId === githubRepoId);
      if (!match) continue;

      const [row] = await db
        .insert(schema.repository)
        .values({
          id: crypto.randomUUID(),
          userId,
          installationId: inst.id,
          githubRepoId: match.githubRepoId,
          owner: match.owner,
          name: match.name,
          fullName: match.fullName,
          defaultBranch: match.defaultBranch,
          private: match.private,
        })
        .returning();
      return row;
    }
    throw new Error("Repository not accessible by the GitHub App");
  });

/** Connected repos with their latest run, for the list page. */
export const listRepositories = createServerFn({ method: "GET" }).handler(
  async () => {
    const userId = await requireUserId();
    return getDb().query.repository.findMany({
      where: eq(schema.repository.userId, userId),
      orderBy: [desc(schema.repository.createdAt)],
      with: {
        runs: {
          orderBy: [desc(schema.run.createdAt)],
          limit: 1,
          columns: {
            id: true,
            status: true,
            conclusion: true,
            createdAt: true,
            counts: true,
          },
        },
      },
    });
  },
);

/** Repo + its PRs (each with its latest run) + recent runs. */
export const getRepository = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const userId = await requireUserId();
    const db = getDb();
    const repo = await db.query.repository.findFirst({
      where: and(
        eq(schema.repository.id, id),
        eq(schema.repository.userId, userId),
      ),
      with: {
        installation: { columns: { accountLogin: true, accountType: true } },
        pullRequests: {
          orderBy: [desc(schema.pullRequest.updatedAt)],
          limit: 50,
          with: {
            runs: {
              orderBy: [desc(schema.run.createdAt)],
              limit: 1,
            },
          },
        },
        runs: {
          orderBy: [desc(schema.run.createdAt)],
          limit: 20,
          with: {
            pullRequest: { columns: { number: true, title: true } },
          },
        },
      },
    });
    if (!repo) throw new Error("Repository not found");
    // The App's handle on GitHub, for the `@<slug> review` command reference.
    return { ...repo, appSlug: getEnv("GITHUB_APP_SLUG") ?? null };
  });

export interface RepositorySettingsInput {
  id: string;
  reviewTrigger: ReviewTrigger;
  skipDrafts: boolean;
  baseBranches: string[];
  ignorePaths: string[];
  scanners: Scanner[];
  agent: AgentProvider | null;
  agentModel: string | null;
  focus: ReviewFocus[];
  instructions: string | null;
  failOn: FailThreshold;
}

/** Trimmed, de-duplicated, non-empty strings that each match `pattern`. */
function cleanList(
  value: unknown,
  pattern: RegExp,
  label: string,
  max = 50,
): string[] {
  const list = Array.isArray(value)
    ? [...new Set(value.map((v) => String(v).trim()).filter(Boolean))]
    : [];
  if (list.length > max) throw new Error(`At most ${max} ${label}`);
  const bad = list.find((v) => !pattern.test(v));
  if (bad) throw new Error(`Invalid ${label.replace(/s$/, "")}: ${bad}`);
  return list;
}

export const updateRepositorySettings = createServerFn({ method: "POST" })
  .validator((data: RepositorySettingsInput) => {
    if (!data || typeof data.id !== "string") throw new Error("Invalid input");
    const scanners = Array.isArray(data.scanners)
      ? [...new Set(data.scanners)].filter((s): s is Scanner =>
          (SCANNERS as readonly string[]).includes(s),
        )
      : [];
    if (scanners.length === 0 && !data.agent) {
      throw new Error("Enable at least one scanner or an AI agent");
    }
    if (
      data.agent !== null &&
      !(AGENT_PROVIDERS as readonly string[]).includes(data.agent)
    ) {
      throw new Error("Unknown agent");
    }
    if (!(FAIL_THRESHOLDS as readonly string[]).includes(data.failOn)) {
      throw new Error("Invalid fail threshold");
    }
    if (!(REVIEW_TRIGGERS as readonly string[]).includes(data.reviewTrigger)) {
      throw new Error("Invalid review trigger");
    }
    const focus = Array.isArray(data.focus)
      ? [...new Set(data.focus)].filter((f): f is ReviewFocus =>
          (REVIEW_FOCUS as readonly string[]).includes(f),
        )
      : [];
    const agentModel = data.agentModel?.trim() || null;
    if (agentModel && !/^[\w.:/-]{1,100}$/.test(agentModel)) {
      throw new Error(
        "Model name may only contain letters, digits and . : / - _",
      );
    }
    const instructions = data.instructions?.trim() || null;
    if (instructions && instructions.length > 4000) {
      throw new Error("Instructions must be 4000 characters or fewer");
    }
    return {
      id: data.id,
      reviewTrigger: data.reviewTrigger,
      skipDrafts: Boolean(data.skipDrafts),
      baseBranches: cleanList(
        data.baseBranches,
        /^[\w./-]{1,250}$/,
        "branches",
      ),
      ignorePaths: cleanList(data.ignorePaths, /^[^\0\n]{1,200}$/, "paths"),
      scanners,
      agent: data.agent,
      agentModel,
      focus,
      instructions,
      failOn: data.failOn,
    };
  })
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    await requireRepo(userId, data.id);
    const db = getDb();
    const { id, ...settings } = data;
    const [updated] = await db
      .update(schema.repository)
      .set(settings)
      .where(eq(schema.repository.id, id))
      .returning();
    return updated;
  });

/** Review a branch head on demand (no PR → full-repo scan, no diff). */
export const startManualRun = createServerFn({ method: "POST" })
  .validator((data: { repositoryId: string; branch?: string }) => {
    const branch = data.branch?.trim() || undefined;
    if (branch && !/^[\w./-]{1,250}$/.test(branch)) {
      throw new Error("Invalid branch name");
    }
    return { repositoryId: data.repositoryId, branch };
  })
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const repo = await requireRepo(userId, data.repositoryId);
    const branch = data.branch ?? repo.defaultBranch;

    let headSha: string;
    try {
      headSha = await getBranchHeadSha(
        octokitForInstallation(repo.installation.installationId),
        repo.owner,
        repo.name,
        branch,
      );
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        throw new Error(`Branch "${branch}" was not found on GitHub`);
      }
      throw err;
    }

    const { installation: _installation, ...repoRow } = repo;
    const runId = await createAndStartRun({
      repo: repoRow,
      trigger: "manual",
      headRef: branch,
      headSha,
      baseSha: null,
    });
    return { runId };
  });

export const disconnectRepository = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const userId = await requireUserId();
    await requireRepo(userId, id);
    await releaseRepositories([id], "Repository disconnected");
    await getDb().delete(schema.repository).where(eq(schema.repository.id, id));
    return { message: "Repository disconnected" };
  });

/**
 * Reconcile with GitHub on demand (webhooks can be missed): drop
 * installations and repositories the App can no longer reach, and refresh
 * names, visibility, default branches and suspension state.
 */
export const syncGithub = createServerFn({ method: "POST" }).handler(
  async () => {
    const userId = await requireUserId();
    const db = getDb();
    const installations = await db.query.githubInstallation.findMany({
      where: eq(schema.githubInstallation.userId, userId),
      with: { repositories: true },
    });
    const app = appOctokit(getAppCreds());
    let updated = 0;
    let removed = 0;

    for (const inst of installations) {
      let info: { suspended_at?: string | null; account?: unknown };
      try {
        ({ data: info } = await app.request(
          "GET /app/installations/{installation_id}",
          { installation_id: Number(inst.installationId) },
        ));
      } catch (err) {
        if ((err as { status?: number }).status !== 404) throw err;
        // Uninstalled while we weren't listening.
        await releaseRepositories(
          inst.repositories.map((r) => r.id),
          "GitHub App uninstalled",
        );
        await db
          .delete(schema.githubInstallation)
          .where(eq(schema.githubInstallation.id, inst.id));
        removed += inst.repositories.length;
        continue;
      }
      const login = (info.account as { login?: string } | null)?.login;
      await db
        .update(schema.githubInstallation)
        .set({
          suspendedAt: info.suspended_at ? new Date(info.suspended_at) : null,
          ...(login ? { accountLogin: login } : {}),
        })
        .where(eq(schema.githubInstallation.id, inst.id));
      if (info.suspended_at) continue; // repo list is unavailable while suspended

      const live = new Map(
        (await accessibleRepos(inst.installationId)).map((r) => [
          r.githubRepoId,
          r,
        ]),
      );
      const gone = inst.repositories.filter((r) => !live.has(r.githubRepoId));
      if (gone.length) {
        const ids = gone.map((r) => r.id);
        await releaseRepositories(ids, "Repository no longer accessible");
        for (const part of chunk(ids, 90)) {
          await db
            .delete(schema.repository)
            .where(inArray(schema.repository.id, part));
        }
        removed += gone.length;
      }
      for (const repo of inst.repositories) {
        const gh = live.get(repo.githubRepoId);
        if (
          !gh ||
          (gh.fullName === repo.fullName &&
            gh.private === repo.private &&
            gh.defaultBranch === repo.defaultBranch)
        )
          continue;
        await db
          .update(schema.repository)
          .set({
            owner: gh.owner,
            name: gh.name,
            fullName: gh.fullName,
            private: gh.private,
            defaultBranch: gh.defaultBranch,
          })
          .where(eq(schema.repository.id, repo.id));
        updated++;
      }
    }
    return { installations: installations.length, updated, removed };
  },
);
