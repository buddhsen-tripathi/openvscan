import {
  CREDENTIAL_INFO,
  CREDENTIAL_KINDS,
  type CredentialKind,
  codexPlanLabel,
  emptyCounts,
  isActiveRun,
  parseCodexAuthFile,
  SEVERITIES,
  type Severity,
  sealSecret,
  secretHint,
} from "@openvscan/core";
import { createServerFn } from "@tanstack/react-start";
import { and, asc, count, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  cancelActiveRunsForPr,
  createAndStartRun,
  requestCancel,
} from "@/lib/runs";
import { describeSkills } from "@/lib/skills";
import { requireUserId } from "@/lib/user";
import { getEnv } from "@/src/lib/env";

/** Subquery: ids of the repositories the user owns (avoids D1's 100-param cap). */
function userRepoIds(userId: string) {
  return getDb()
    .select({ id: schema.repository.id })
    .from(schema.repository)
    .where(eq(schema.repository.userId, userId));
}

/* ------------------------------ Overview ----------------------------- */

export const getOverview = createServerFn({ method: "GET" }).handler(
  async () => {
    const userId = await requireUserId();
    const db = getDb();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [[repoCount], [runsWeek], openPrs, recentRuns] = await Promise.all([
      db
        .select({ n: count() })
        .from(schema.repository)
        .where(eq(schema.repository.userId, userId)),
      db
        .select({ n: count() })
        .from(schema.run)
        .where(
          and(
            inArray(schema.run.repositoryId, userRepoIds(userId)),
            gte(schema.run.createdAt, weekAgo),
          ),
        ),
      db.query.pullRequest.findMany({
        where: and(
          inArray(schema.pullRequest.repositoryId, userRepoIds(userId)),
          eq(schema.pullRequest.state, "open"),
        ),
        orderBy: [desc(schema.pullRequest.updatedAt)],
        limit: 100,
        with: {
          repository: { columns: { id: true, fullName: true } },
          runs: { orderBy: [desc(schema.run.createdAt)], limit: 1 },
        },
      }),
      db.query.run.findMany({
        where: inArray(schema.run.repositoryId, userRepoIds(userId)),
        orderBy: [desc(schema.run.createdAt)],
        limit: 8,
        with: {
          repository: { columns: { id: true, fullName: true } },
          pullRequest: { columns: { number: true, title: true } },
        },
      }),
    ]);

    // Open exposure: severity totals on the latest completed run of each open PR.
    const exposure = emptyCounts();
    let reviewedPrs = 0;
    let failingPrs = 0;
    for (const pr of openPrs) {
      const latest = pr.runs[0];
      if (!latest) continue;
      reviewedPrs++;
      if (latest.conclusion === "fail") failingPrs++;
      if (latest.counts) {
        for (const s of SEVERITIES) exposure[s] += latest.counts[s] ?? 0;
      }
    }

    return {
      repositories: repoCount?.n ?? 0,
      openPrs: openPrs.length,
      reviewedPrs,
      failingPrs,
      runsLast7Days: runsWeek?.n ?? 0,
      exposure,
      attention: openPrs
        .filter((pr) => pr.runs[0]?.conclusion === "fail")
        .slice(0, 6),
      recentRuns,
    };
  },
);

/* -------------------------------- Runs ------------------------------- */

export const listRuns = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireUserId();
  return getDb().query.run.findMany({
    where: inArray(schema.run.repositoryId, userRepoIds(userId)),
    orderBy: [desc(schema.run.createdAt)],
    limit: 50,
    with: {
      repository: { columns: { id: true, fullName: true } },
      pullRequest: { columns: { number: true, title: true, url: true } },
    },
  });
});

async function requireRun(userId: string, runId: string) {
  const run = await getDb().query.run.findFirst({
    where: eq(schema.run.id, runId),
    with: { repository: true, pullRequest: true },
  });
  if (!run || run.repository.userId !== userId)
    throw new Error("Run not found");
  return run;
}

export const getRun = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const userId = await requireUserId();
    const run = await requireRun(userId, id);
    const db = getDb();
    const [findings, logs, skills] = await Promise.all([
      db.query.finding.findMany({ where: eq(schema.finding.runId, id) }),
      db.query.runLog.findMany({
        where: eq(schema.runLog.runId, id),
        orderBy: [asc(schema.runLog.timestamp)],
        limit: 500,
      }),
      describeSkills(userId, run.skills),
    ]);
    const rank = (s: Severity) => SEVERITIES.indexOf(s);
    findings.sort(
      (a, b) =>
        rank(a.severity) - rank(b.severity) ||
        Number(b.inDiff) - Number(a.inDiff) ||
        (a.filePath ?? "").localeCompare(b.filePath ?? ""),
    );
    return {
      ...run,
      // Scanner metadata is free-form JSON; narrow it to a serializable shape.
      findings: findings.map((f) => ({
        ...f,
        metadata: f.metadata as Record<
          string,
          string | number | boolean | null
        > | null,
      })),
      logs,
      skills,
    };
  });

/** Re-run a review: PR runs use the PR's current head, branch runs the same sha. */
export const rerun = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const userId = await requireUserId();
    const original = await requireRun(userId, id);
    const { repository: repo, pullRequest: pr } = original;

    if (pr) {
      await cancelActiveRunsForPr(pr.id, "Superseded by a re-run");
      const runId = await createAndStartRun({
        repo,
        pullRequest: pr,
        trigger: "pull_request",
        headRef: pr.headRef,
        headSha: pr.headSha,
        baseSha: pr.baseSha,
      });
      return { runId };
    }
    const runId = await createAndStartRun({
      repo,
      trigger: "manual",
      headRef: original.headRef,
      headSha: original.headSha,
      baseSha: original.baseSha,
    });
    return { runId };
  });

export const cancelRun = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const userId = await requireUserId();
    const run = await requireRun(userId, id);
    if (!isActiveRun(run.status)) {
      throw new Error(`Cannot cancel a ${run.status} run`);
    }
    await requestCancel(id, "Cancelled from the dashboard");
    return { message: "Cancellation requested" };
  });

/* ------------------------- Agent credentials ------------------------- */

export const listCredentials = createServerFn({ method: "GET" }).handler(
  async () => {
    const userId = await requireUserId();
    const rows = await getDb().query.agentCredential.findMany({
      where: eq(schema.agentCredential.userId, userId),
      // Never select the ciphertext/iv into the client payload.
      columns: {
        id: true,
        kind: true,
        provider: true,
        hint: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      encryptionConfigured: Boolean(getEnv("CREDENTIALS_KEY")),
      credentials: rows,
    };
  },
);

export const saveCredential = createServerFn({ method: "POST" })
  .validator((data: { kind: CredentialKind; secret: string }) => {
    if (!(CREDENTIAL_KINDS as readonly string[]).includes(data?.kind)) {
      throw new Error("Unknown credential type");
    }
    const secret = typeof data.secret === "string" ? data.secret.trim() : "";
    if (data.kind === "codex_chatgpt_login") {
      if (secret.length > 64_000)
        throw new Error("That auth.json is too large");
      // Keep only the tokens; the rest of the file isn't needed.
      const login = parseCodexAuthFile(secret);
      return {
        kind: data.kind,
        secret: JSON.stringify(login),
        hint: codexPlanLabel(login),
      };
    }
    if (secret.length < 20 || secret.length > 4000) {
      throw new Error(
        "That doesn't look like a valid token (expected 20–4000 characters)",
      );
    }
    if (/\s/.test(secret)) {
      throw new Error("The token must not contain spaces or line breaks");
    }
    // Catch the common mix-up of pasting one kind of credential as another.
    // (Unknown prefixes are accepted — providers change formats.)
    const looksLike = CREDENTIAL_KINDS.find(
      (k) =>
        k !== data.kind &&
        k !== "openai_api_key" && // "sk-" is too generic to infer from
        CREDENTIAL_INFO[k].prefix &&
        secret.startsWith(CREDENTIAL_INFO[k].prefix ?? "\u0000"),
    );
    if (looksLike) {
      throw new Error(
        `This looks like a ${CREDENTIAL_INFO[looksLike].label}, not a ${CREDENTIAL_INFO[data.kind].label}`,
      );
    }
    return { kind: data.kind, secret, hint: secretHint(secret) };
  })
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const key = getEnv("CREDENTIALS_KEY");
    if (!key) {
      throw new Error(
        "CREDENTIALS_KEY is not configured on this deployment — an operator must set it before credentials can be saved",
      );
    }
    const db = getDb();
    const provider = CREDENTIAL_INFO[data.kind].provider;
    const existing = await db.query.agentCredential.findFirst({
      where: and(
        eq(schema.agentCredential.userId, userId),
        eq(schema.agentCredential.provider, provider),
      ),
      columns: { id: true },
    });
    const id = existing?.id ?? crypto.randomUUID();
    // The row id is bound as AAD so a ciphertext can't be moved between rows.
    const sealed = await sealSecret(key, data.secret, id);
    const values = {
      kind: data.kind,
      provider,
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      hint: data.hint,
      lastUsedAt: null,
    };
    if (existing) {
      await db
        .update(schema.agentCredential)
        .set(values)
        .where(eq(schema.agentCredential.id, id));
    } else {
      await db.insert(schema.agentCredential).values({ id, userId, ...values });
    }
    return { id, provider, kind: data.kind, hint: values.hint };
  });

export const deleteCredential = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const userId = await requireUserId();
    await getDb()
      .delete(schema.agentCredential)
      .where(
        and(
          eq(schema.agentCredential.id, id),
          eq(schema.agentCredential.userId, userId),
        ),
      );
    return { message: "Credential removed" };
  });
