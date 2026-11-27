import * as schema from "@openvscan/db";
import { chunk } from "@openvscan/db";
import { installationOctokit, normalizePrivateKey, type Octokit } from "@openvscan/github";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

export { schema };

export function getDb(env: Env) {
  return drizzle(env.DB, { schema });
}
export type Db = ReturnType<typeof getDb>;

export async function logRun(
  db: Db,
  runId: string,
  level: "info" | "warn" | "error",
  message: string,
): Promise<void> {
  await db
    .insert(schema.runLog)
    .values({ id: crypto.randomUUID(), runId, level, message: message.slice(0, 2000) })
    .catch((err) => console.error("run_log insert failed", err));
}

export async function updateRun(
  db: Db,
  runId: string,
  values: Partial<typeof schema.run.$inferInsert>,
): Promise<void> {
  await db.update(schema.run).set(values).where(eq(schema.run.id, runId));
}

export function appCreds(env: Env) {
  return {
    appId: env.GITHUB_APP_ID,
    privateKey: normalizePrivateKey(env.GITHUB_APP_PRIVATE_KEY),
  };
}

export function githubFor(env: Env, installationId: string): Octokit {
  return installationOctokit({ ...appCreds(env), installationId });
}

/** The run's page in the dashboard. */
export function runUrl(env: Env, runId: string): string {
  return `${env.APP_URL.replace(/\/$/, "")}/dashboard/runs/${runId}`;
}

/** sha256(key) → 32 hex chars; stable finding identity across runs. */
export async function fingerprint(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type Statement = Parameters<Db["batch"]>[0][number];

/** Run statements in D1 batches of 50 (each batch is one transaction). */
export async function batchAll(db: Db, stmts: Statement[]): Promise<void> {
  for (const part of chunk(stmts, 50)) {
    if (part.length) await db.batch(part as [Statement, ...Statement[]]);
  }
}
