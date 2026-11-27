import { env, waitUntil } from "cloudflare:workers";
import {
  ACTIVE_RUN_STATUSES,
  isActiveRun,
  type RunTrigger,
} from "@openvscan/core";
import { chunk } from "@openvscan/db";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEngine } from "@/lib/engine";

/**
 * Server-only helpers shared by the webhook, the dashboard server functions
 * and re-runs. The web Worker inserts the `run` row (with a snapshot of the
 * repository's policy) and hands its id to the engine, which owns every write
 * to the run after that.
 */

type Repo = typeof schema.repository.$inferSelect;
type PullRequest = typeof schema.pullRequest.$inferSelect;

interface CreateRunInput {
  repo: Repo;
  pullRequest?: PullRequest | null;
  trigger: RunTrigger;
  headRef: string;
  headSha: string;
  /** PR base sha; null for branch runs (full scan, no diff). */
  baseSha?: string | null;
}

/** Insert a queued run and start it on the engine. Returns the run id. */
export async function createAndStartRun(
  input: CreateRunInput,
): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.insert(schema.run).values({
    id,
    repositoryId: input.repo.id,
    pullRequestId: input.pullRequest?.id ?? null,
    trigger: input.trigger,
    status: "queued",
    phase: "queued",
    headRef: input.headRef,
    headSha: input.headSha,
    baseSha: input.baseSha ?? null,
    scanners: input.repo.scanners,
    agent: input.repo.agent,
    agentModel: input.repo.agentModel,
    failOn: input.repo.failOn,
    instructions: input.repo.instructions,
    focus: input.repo.focus,
    ignorePaths: input.repo.ignorePaths,
  });

  try {
    await getEngine().startRun(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.run)
      .set({
        status: "failed",
        phase: "done",
        error: `Could not start the review engine: ${message}`,
        completedAt: new Date(),
      })
      .where(eq(schema.run.id, id));
    await db.insert(schema.runLog).values({
      id: crypto.randomUUID(),
      runId: id,
      level: "error",
      message: `Engine unavailable: ${message}`,
    });
  }
  return id;
}

/** Flag a run for cancellation and ask the engine to stop it (best-effort). */
export async function requestCancel(runId: string, reason: string) {
  const db = getDb();
  await db
    .update(schema.run)
    .set({ cancelRequested: true })
    .where(eq(schema.run.id, runId));
  try {
    await getEngine().cancelRun(runId, reason);
  } catch (err) {
    console.error("engine cancelRun failed", runId, err);
  }
}

/** Cancel every queued/running run of a PR (it was superseded by a push). */
export async function cancelActiveRunsForPr(
  pullRequestId: string,
  reason: string,
) {
  const db = getDb();
  const active = await db.query.run.findMany({
    where: and(
      eq(schema.run.pullRequestId, pullRequestId),
      inArray(schema.run.status, [...ACTIVE_RUN_STATUSES]),
    ),
    columns: { id: true },
  });
  await Promise.all(active.map((r) => requestCancel(r.id, reason)));
}

/**
 * Delete the R2 artifacts (diff, raw scanner output, review.json) of runs.
 * Keys live under `runs/<runId>/`.
 */
async function purgeRunArtifacts(runIds: string[]) {
  const bucket = env.ARTIFACTS;
  for (let i = 0; i < runIds.length; i += 10) {
    await Promise.all(
      runIds.slice(i, i + 10).map(async (runId) => {
        let cursor: string | undefined;
        do {
          const page = await bucket.list({ prefix: `runs/${runId}/`, cursor });
          if (page.objects.length) {
            await bucket.delete(page.objects.map((o) => o.key));
          }
          cursor = page.truncated ? page.cursor : undefined;
        } while (cursor);
      }),
    );
  }
}

/**
 * Prepare repositories for deletion: stop their active runs and schedule the
 * removal of their stored artifacts. The caller deletes the rows (runs,
 * findings and logs cascade).
 */
export async function releaseRepositories(repoIds: string[], reason: string) {
  if (repoIds.length === 0) return;
  const db = getDb();
  const runs: { id: string; status: string }[] = [];
  for (const part of chunk(repoIds, 90)) {
    runs.push(
      ...(await db.query.run.findMany({
        where: inArray(schema.run.repositoryId, part),
        columns: { id: true, status: true },
      })),
    );
  }
  await Promise.all(
    runs
      .filter((r) => isActiveRun(r.status))
      .map((r) => requestCancel(r.id, reason)),
  );
  const ids = runs.map((r) => r.id);
  waitUntil(
    purgeRunArtifacts(ids).catch((err) =>
      console.error("artifact purge failed", err),
    ),
  );
}
