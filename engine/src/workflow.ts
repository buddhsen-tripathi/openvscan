import {
  type AgentProvider,
  countBySeverity,
  CREDENTIAL_INFO,
  type FailThreshold,
  openSecret,
  isRelevant,
  type Scanner,
  SCANNERS,
  type ScannerStat,
  severityRank,
} from "@openvscan/core";
import { chunk } from "@openvscan/db";
import {
  completeCheckRun,
  createCheckRun,
  createReadOnlyRepoToken,
  createReview,
  upsertSummaryComment,
} from "@openvscan/github";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import {
  agentFailure,
  agentInvocation,
  buildPrompt,
  filterAgentFindings,
  DIFF_PATH,
  FINDINGS_PATH,
  parseAgentReview,
  PROMPT_PATH,
  REVIEW_PATH,
  TASK_DIR,
  WORK_DIR,
} from "./agent";
import {
  appCreds,
  batchAll,
  type Db,
  fingerprint,
  getDb,
  githubFor,
  logRun,
  runUrl,
  schema,
  updateRun,
} from "./db";
import {
  buildDiffMap,
  type DiffMap,
  isDependencyInDiff,
  isInDiff,
  type PrFile,
  renderUnifiedDiff,
} from "./diff";
import {
  buildAnnotations,
  buildCheckOutput,
  buildInlineComments,
  buildSummaryComment,
  decideConclusion,
  type ReportContext,
  type ReportFinding,
  sanitize,
} from "./report";
import { type ScanSandbox, sandboxFor } from "./sandbox";
import {
  capFindings,
  type NormalizedFinding,
  OUT_DIR,
  REPO_DIR,
  relPath,
  SCANNER_SPECS,
} from "./scanners";

interface ReviewParams {
  runId: string;
}

/** Everything the pipeline needs, loaded once (step results are durable). */
interface RunContext {
  runId: string;
  userId: string;
  installationId: string;
  owner: string;
  repo: string;
  fullName: string;
  isPr: boolean;
  prId: string | null;
  prNumber: number | null;
  prTitle: string | null;
  prAuthor: string | null;
  summaryCommentId: string | null;
  headRef: string;
  headSha: string;
  baseRef: string | null;
  scanners: Scanner[];
  agent: AgentProvider | null;
  agentModel: string | null;
  failOn: FailThreshold;
  instructions: string | null;
}

const AI_POLL_INTERVAL = "30 seconds";
const AI_MAX_POLLS = 50; // ≈ 25 minutes
const GH_RETRY = { retries: { limit: 3, delay: "10 seconds", backoff: "exponential" } } as const;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 1000);

export class ReviewWorkflow extends WorkflowEntrypoint<Env, ReviewParams> {
  async run(event: Readonly<WorkflowEvent<ReviewParams>>, step: WorkflowStep) {
    const { runId } = event.payload;
    const env = this.env;
    const sb = () => sandboxFor(env, runId);
    let checkRunId: string | null = null;
    let ctx: RunContext | null = null;

    try {
      ctx = await step.do("load", async () => loadContext(getDb(env), runId));
      if (!ctx) return { skipped: true };
      const c = ctx;

      checkRunId = await step.do("github:check-run", GH_RETRY, async () => {
        const id = await createCheckRun(githubFor(env, c.installationId), {
          owner: c.owner,
          repo: c.repo,
          headSha: c.headSha,
          externalId: runId,
          detailsUrl: runUrl(env, runId),
        });
        await updateRun(getDb(env), runId, { checkRunId: id });
        return id;
      });

      const diffInfo = await step.do("github:diff", GH_RETRY, async () =>
        c.isPr ? fetchPrDiff(env, c) : null,
      );

      await step.do("sandbox:checkout", { retries: { limit: 2, delay: "15 seconds" }, timeout: "15 minutes" }, async () => {
        const db = getDb(env);
        await updateRun(db, runId, { phase: "checkout" });
        await logRun(db, runId, "info", `Checking out ${c.fullName}@${c.headSha.slice(0, 7)}`);
        await checkout(env, sb(), c);
        return true;
      });

      // ---- Scanners: one durable, independently-retried step each.
      await step.do("phase:scanning", async () => {
        await updateRun(getDb(env), runId, { phase: "scanning" });
        return true;
      });
      const stats: Record<string, ScannerStat> = {};
      for (const name of SCANNERS) {
        if (!c.scanners.includes(name)) {
          stats[name] = { status: "skipped", findings: 0 };
          continue;
        }
        try {
          stats[name] = await step.do(
            `scan:${name}`,
            { retries: { limit: 1, delay: "10 seconds" }, timeout: "20 minutes" },
            async () => runScanner(env, sb(), c, name),
          );
        } catch (err) {
          stats[name] = { status: "failed", findings: 0, error: errMsg(err) };
          await step.do(`scan:${name}:failed`, async () => {
            await logRun(getDb(env), runId, "error", `${name} failed: ${errMsg(err)}`);
            return true;
          });
        }
      }
      await step.do("scan:stats", async () => {
        await updateRun(getDb(env), runId, { scannerStats: stats });
        return true;
      });

      // ---- AI review (optional): a failure here is recorded, not fatal.
      if (c.agent) {
        try {
          const started = await step.do("ai:start", { retries: { limit: 1, delay: "10 seconds" } }, async () =>
            startAgent(env, sb(), c, diffInfo),
          );
          let outcome: { state: string; exitCode?: number } = { state: started.ok ? "running" : "skipped" };
          for (let i = 0; started.ok && i < AI_MAX_POLLS && outcome.state === "running"; i++) {
            await step.sleep(`ai:wait:${i}`, AI_POLL_INTERVAL);
            outcome = await step.do(`ai:poll:${i}`, async () => {
              if (await isCancelled(getDb(env), runId)) return { state: "cancelled" };
              const s = await sb().taskState(TASK_DIR);
              return s.state === "exited" ? { state: "exited", exitCode: s.exitCode } : { state: s.state };
            });
          }
          await step.do("ai:collect", async () => collectAgent(env, sb(), c, started, outcome));
        } catch (err) {
          await step.do("ai:failed", async () => {
            await sb().lockEgress().catch(() => {});
            const db = getDb(env);
            await updateRun(db, runId, { aiError: errMsg(err) });
            await logRun(db, runId, "error", `AI review failed: ${errMsg(err)}`);
            return true;
          });
        }
      }

      // ---- Publish to GitHub, then finalise the run.
      const result = await step.do("publish", { ...GH_RETRY, timeout: "5 minutes" }, async () =>
        publish(env, c, checkRunId, stats),
      );
      await step.do("cleanup", async () => {
        await sb().destroy();
        return true;
      });
      return result;
    } catch (err) {
      const message = errMsg(err);
      await step.do("fail", async () => {
        const db = getDb(env);
        await updateRun(db, runId, {
          status: "failed",
          phase: "done",
          conclusion: "neutral",
          error: message,
          completedAt: new Date(),
        });
        await logRun(db, runId, "error", `Run failed: ${message}`);
        if (ctx && checkRunId) {
          await completeCheckRun(githubFor(env, ctx.installationId), {
            owner: ctx.owner,
            repo: ctx.repo,
            checkRunId,
            conclusion: "neutral",
            title: "Security review could not complete",
            summary: `OpenVScan hit an error and could not finish this review:\n\n> ${sanitize(message, 500)}\n\n[Open in OpenVScan](${runUrl(env, runId)})`,
          }).catch(() => {});
        }
        await sb().destroy().catch(() => {});
        return true;
      });
      return { failed: true, error: message };
    }
  }
}

/* --------------------------------- Steps --------------------------------- */

async function isCancelled(db: Db, runId: string): Promise<boolean> {
  const r = await db.query.run.findFirst({
    where: eq(schema.run.id, runId),
    columns: { status: true, cancelRequested: true },
  });
  return !r || r.cancelRequested || r.status === "cancelled";
}

async function loadContext(db: Db, runId: string): Promise<RunContext | null> {
  const run = await db.query.run.findFirst({
    where: eq(schema.run.id, runId),
    with: { repository: { with: { installation: true } }, pullRequest: true },
  });
  if (!run) return null;
  if (run.cancelRequested || run.status === "cancelled") return null;
  await updateRun(db, runId, { status: "running", phase: "checkout", startedAt: new Date() });
  await logRun(db, runId, "info", `Review started (${run.trigger})`);
  const repo = run.repository;
  return {
    runId,
    userId: repo.userId,
    installationId: repo.installation.installationId,
    owner: repo.owner,
    repo: repo.name,
    fullName: repo.fullName,
    isPr: Boolean(run.pullRequest),
    prId: run.pullRequest?.id ?? null,
    prNumber: run.pullRequest?.number ?? null,
    prTitle: run.pullRequest?.title ?? null,
    prAuthor: run.pullRequest?.author ?? null,
    summaryCommentId: run.pullRequest?.summaryCommentId ?? null,
    headRef: run.headRef,
    headSha: run.headSha,
    baseRef: run.pullRequest?.baseRef ?? null,
    // Policy snapshot taken when the run was created.
    scanners: run.scanners,
    agent: run.agent,
    agentModel: run.agentModel,
    failOn: run.failOn,
    instructions: run.instructions,
  };
}

interface DiffInfo {
  changedFiles: string[];
  truncated: boolean;
  prBody: string | null;
}

/** PR diff from GitHub (what review comments anchor to), stored in R2. */
async function fetchPrDiff(env: Env, c: RunContext): Promise<DiffInfo> {
  const gh = githubFor(env, c.installationId);
  const pull_number = c.prNumber as number;
  const [files, pr] = await Promise.all([
    gh.paginate("GET /repos/{owner}/{repo}/pulls/{pull_number}/files", {
      owner: c.owner,
      repo: c.repo,
      pull_number,
      per_page: 100,
    }),
    gh.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
      owner: c.owner,
      repo: c.repo,
      pull_number,
    }),
  ]);
  const prFiles: PrFile[] = files.map((f) => ({
    filename: f.filename,
    status: f.status,
    patch: f.patch,
    previous_filename: f.previous_filename,
  }));
  const map = buildDiffMap(prFiles);
  const unified = renderUnifiedDiff(prFiles);
  await Promise.all([
    env.ARTIFACTS.put(`runs/${c.runId}/diff.json`, JSON.stringify(map)),
    env.ARTIFACTS.put(`runs/${c.runId}/pr.diff`, unified.text),
  ]);
  await updateRun(getDb(env), c.runId, { filesChanged: prFiles.length });
  return {
    changedFiles: prFiles.map((f) => f.filename).slice(0, 300),
    truncated: unified.truncated,
    prBody: pr.data.body ? pr.data.body.slice(0, 4000) : null,
  };
}

async function loadDiffMap(env: Env, runId: string): Promise<DiffMap | null> {
  const obj = await env.ARTIFACTS.get(`runs/${runId}/diff.json`);
  return obj ? ((await obj.json()) as DiffMap) : null;
}

/**
 * Shallow-fetch exactly the head commit through the egress proxy, which adds
 * a read-only token scoped to this one repository. Works for fork PRs too:
 * GitHub serves PR head commits from the base repository.
 */
async function checkout(env: Env, sb: DurableObjectStub<ScanSandbox>, c: RunContext): Promise<void> {
  await sb.start();
  const token = await createReadOnlyRepoToken(
    { ...appCreds(env), installationId: c.installationId },
    c.repo,
  );
  await sb.setEgress({ phase: "checkout", repo: c.fullName, githubToken: token });
  try {
    const res = await sb.exec(
      [
        "sh",
        "-c",
        `set -e
rm -rf "$1" && git init -q "$1" && cd "$1"
git remote add origin "$2"
git fetch -q --no-tags --depth=1 origin "$3"
git -c advice.detachedHead=false checkout -q FETCH_HEAD
mkdir -p "$4"`,
        "checkout",
        REPO_DIR,
        `https://github.com/${c.fullName}.git`,
        c.headSha,
        OUT_DIR,
      ],
      { timeoutSec: 600 },
    );
    if (res.exitCode !== 0) {
      throw new Error(`git checkout failed (${res.exitCode}): ${res.stderr.trim().slice(-500)}`);
    }
  } finally {
    await sb.lockEgress();
  }
}

/** Re-checkout if the container was replaced since the checkout step. */
async function ensureRepo(env: Env, sb: DurableObjectStub<ScanSandbox>, c: RunContext) {
  const { fresh } = await sb.start();
  if (fresh || !(await sb.exists(`${REPO_DIR}/.git`))) {
    await logRun(getDb(env), c.runId, "warn", "Sandbox was recycled; checking out again");
    await checkout(env, sb, c);
  }
}

async function runScanner(
  env: Env,
  sb: DurableObjectStub<ScanSandbox>,
  c: RunContext,
  name: Scanner,
): Promise<ScannerStat> {
  const db = getDb(env);
  const spec = SCANNER_SPECS[name];
  const t0 = Date.now();
  if (await isCancelled(db, c.runId)) return { status: "skipped", findings: 0 };
  await ensureRepo(env, sb, c);
  await logRun(db, c.runId, "info", `Running ${name}`);

  // Trivy may refresh its vulnerability DB; nothing else gets network.
  await sb.setEgress(name === "trivy" ? { phase: "scan" } : { phase: "locked" });
  let res: { exitCode: number; stderr: string };
  try {
    res = await sb.exec(spec.argv, { env: spec.env, timeoutSec: spec.timeoutSec });
    if (name === "trivy" && res.exitCode !== 0) {
      await logRun(db, c.runId, "warn", "Trivy DB refresh failed; using the DB bundled in the image");
      res = await sb.exec([...spec.argv.slice(0, -1), "--skip-db-update", spec.argv.at(-1) as string], {
        env: spec.env,
        timeoutSec: spec.timeoutSec,
      });
    }
  } finally {
    await sb.lockEgress();
  }
  if (res.exitCode !== 0) {
    throw new Error(`${name} exited ${res.exitCode}: ${res.stderr.trim().slice(-400)}`);
  }

  const raw = await sb.readText(spec.outputPath);
  if (raw == null) throw new Error(`${name} produced no output`);
  await env.ARTIFACTS.put(`runs/${c.runId}/${name}.json`, raw);

  const parsed = capFindings(spec.parse(raw));
  const diff = c.isPr ? await loadDiffMap(env, c.runId) : null;
  const rows = await Promise.all(parsed.map((f) => toRow(c.runId, f, diff)));

  // Idempotent on retry: replace this scanner's findings for the run.
  await db
    .delete(schema.finding)
    .where(and(eq(schema.finding.runId, c.runId), eq(schema.finding.source, name)));
  await insertFindings(db, rows);

  const inDiff = rows.filter((r) => r.inDiff).length;
  await logRun(
    db,
    c.runId,
    "info",
    `${name}: ${rows.length} finding(s)${c.isPr ? `, ${inDiff} in this diff` : ""}`,
  );
  return { status: "ok", findings: rows.length, durationMs: Date.now() - t0 };
}

async function toRow(
  runId: string,
  f: NormalizedFinding,
  diff: DiffMap | null,
): Promise<typeof schema.finding.$inferInsert> {
  return {
    id: crypto.randomUUID(),
    runId,
    source: f.source,
    ruleId: f.ruleId,
    title: f.title,
    description: f.description,
    severity: f.severity,
    filePath: f.filePath,
    startLine: f.startLine,
    endLine: f.endLine,
    inDiff:
      f.metadata?.kind === "dependency"
        ? isDependencyInDiff(
            diff,
            f.filePath,
            (f.metadata.package as string | null) ?? null,
            (f.metadata.installedVersion as string | null) ?? null,
          )
        : isInDiff(diff, f.filePath, f.startLine, f.endLine),
    cwe: f.cwe,
    remediation: f.remediation,
    suggestion: f.suggestion,
    fingerprint: await fingerprint(f.fingerprintKey),
    metadata: f.metadata,
  };
}

async function insertFindings(db: Db, rows: (typeof schema.finding.$inferInsert)[]) {
  if (!rows.length) return;
  // 20 columns per row → 4 rows per statement keeps us under 100 params.
  await batchAll(
    db,
    chunk(rows, 4).map((part) => db.insert(schema.finding).values(part)),
  );
}

type AgentStart = { ok: true; findingIds: string[] } | { ok: false; error: string };

async function startAgent(
  env: Env,
  sb: DurableObjectStub<ScanSandbox>,
  c: RunContext,
  diffInfo: DiffInfo | null,
): Promise<AgentStart> {
  const db = getDb(env);
  const provider = c.agent as AgentProvider;
  if (await isCancelled(db, c.runId)) return { ok: false, error: "cancelled" };
  await updateRun(db, c.runId, { phase: "ai_review" });

  const cred = await db.query.agentCredential.findFirst({
    where: and(
      eq(schema.agentCredential.userId, c.userId),
      eq(schema.agentCredential.provider, provider),
    ),
  });
  if (!cred) {
    const error = `No ${provider === "claude" ? "Claude" : "OpenAI"} credential configured. Add one in Settings → AI agents.`;
    await updateRun(db, c.runId, { aiError: error });
    await logRun(db, c.runId, "warn", error);
    return { ok: false, error };
  }
  if (!env.CREDENTIALS_KEY) throw new Error("CREDENTIALS_KEY is not set on the engine");
  const secret = await openSecret(env.CREDENTIALS_KEY, { ciphertext: cred.ciphertext, iv: cred.iv }, cred.id);

  // Give the agent the scanner findings, most relevant first.
  const findings = await db.query.finding.findMany({
    where: and(eq(schema.finding.runId, c.runId), ne(schema.finding.source, "ai")),
  });
  const ordered = findings
    .sort((a, b) => Number(b.inDiff) - Number(a.inDiff) || severityRank(a.severity) - severityRank(b.severity))
    .slice(0, 200);
  const findingsJson = ordered.map((f) => ({
    id: f.id,
    source: f.source,
    ruleId: f.ruleId,
    severity: f.severity,
    title: f.title,
    file: f.filePath,
    line: f.startLine,
    inDiff: f.inDiff,
    description: f.description.slice(0, 1500),
  }));

  await ensureRepo(env, sb, c);
  const diffText = c.isPr ? await (await env.ARTIFACTS.get(`runs/${c.runId}/pr.diff`))?.text() : null;
  await sb.writeText(DIFF_PATH, diffText ?? "(no pull request diff: manual branch review)\n");
  await sb.writeText(FINDINGS_PATH, JSON.stringify(findingsJson, null, 2));
  await sb.writeText(
    PROMPT_PATH,
    buildPrompt({
      repoFullName: c.fullName,
      pr: c.isPr
        ? { number: c.prNumber as number, title: c.prTitle ?? "", body: diffInfo?.prBody ?? null, author: c.prAuthor ?? "unknown" }
        : null,
      headRef: c.headRef,
      headSha: c.headSha,
      baseRef: c.baseRef,
      changedFiles: diffInfo?.changedFiles ?? [],
      diffTruncated: diffInfo?.truncated ?? false,
      scannerFindingCount: findingsJson.length,
      instructions: c.instructions,
    }),
  );

  const kind = cred.kind;
  const inv = agentInvocation(provider, kind, c.agentModel);
  // From here until ai:collect the sandbox can reach ONLY the model API, and
  // the proxy (not the sandbox) holds the credential.
  await sb.setEgress({ phase: "agent", kind, secret });
  await sb.startTask(TASK_DIR, inv.argv, { cwd: WORK_DIR, env: inv.env });
  await db
    .update(schema.agentCredential)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.agentCredential.id, cred.id));
  await logRun(
    db,
    c.runId,
    "info",
    `AI review started with ${provider === "claude" ? "Claude Code" : "Codex"} (${CREDENTIAL_INFO[kind].label}), ${findingsJson.length} scanner finding(s) to triage`,
  );
  return { ok: true, findingIds: ordered.map((f) => f.id) };
}

async function collectAgent(
  env: Env,
  sb: DurableObjectStub<ScanSandbox>,
  c: RunContext,
  started: AgentStart,
  outcome: { state: string; exitCode?: number },
): Promise<{ ok: boolean }> {
  const db = getDb(env);
  if (!started.ok) return { ok: false };
  // Revoke model access first, whatever happened.
  await sb.lockEgress().catch(() => {});

  const fail = async (error: string) => {
    await updateRun(db, c.runId, { aiError: error });
    await logRun(db, c.runId, "warn", `AI review: ${error}`);
    return { ok: false };
  };

  if (outcome.state === "running") {
    await sb.killTask(TASK_DIR).catch(() => {});
    return fail("timed out after 25 minutes");
  }
  if (outcome.state === "cancelled") {
    await sb.killTask(TASK_DIR).catch(() => {});
    return { ok: false };
  }
  if (outcome.state === "lost") return fail("the sandbox stopped before the agent finished");

  const provider = c.agent as AgentProvider;
  const raw = await sb.readText(REVIEW_PATH, 2 * 1024 * 1024);
  if (raw == null) {
    const stdout = (await sb.readText(`${TASK_DIR}/stdout.log`, 8 * 1024 * 1024).catch(() => null)) ?? "";
    const stderr = (await sb.readText(`${TASK_DIR}/stderr.log`, 1024 * 1024).catch(() => null)) ?? "";
    return fail(agentFailure(provider, outcome.exitCode ?? -1, stdout, stderr));
  }
  await env.ARTIFACTS.put(`runs/${c.runId}/review.json`, raw);

  let review: ReturnType<typeof parseAgentReview>;
  try {
    review = parseAgentReview(raw);
  } catch (err) {
    return fail(errMsg(err));
  }

  // Apply triage only to findings we actually gave the agent.
  const allowed = new Set(started.findingIds);
  const updates = review.triage
    .filter((t) => allowed.has(t.id))
    .map((t) =>
      db
        .update(schema.finding)
        .set({
          aiVerdict: t.verdict,
          aiReasoning: t.reasoning,
          ...(t.severity ? { severity: t.severity } : {}),
        })
        .where(and(eq(schema.finding.id, t.id), eq(schema.finding.runId, c.runId))),
    );
  await batchAll(db, updates);

  const diff = c.isPr ? await loadDiffMap(env, c.runId) : null;
  const { kept, dropped: filtered } = filterAgentFindings(review.findings);
  const aiRows = await Promise.all(
    kept.map((f) => {
      const file = relPath(f.file);
      return toRow(
        c.runId,
        {
          source: "ai",
          ruleId: f.cwe ?? null,
          title: f.title,
          description: f.exploit ? `${f.description}\n\n**Exploit scenario:** ${f.exploit}` : f.description,
          severity: f.severity,
          filePath: file,
          startLine: f.line ?? null,
          endLine: f.endLine ?? null,
          cwe: f.cwe ?? null,
          remediation: f.remediation ?? null,
          suggestion: f.suggestion ?? null,
          fingerprintKey: `ai|${f.cwe ?? f.title.toLowerCase()}|${file ?? ""}`,
          metadata: { kind: "ai", confidence: f.confidence ?? null },
        },
        diff,
      ).then((row) => ({ ...row, aiVerdict: "confirmed" as const }));
    }),
  );
  await db
    .delete(schema.finding)
    .where(and(eq(schema.finding.runId, c.runId), eq(schema.finding.source, "ai")));
  await insertFindings(db, aiRows);

  await updateRun(db, c.runId, { aiSummary: review.summary, aiRisk: review.risk, aiError: null });
  const dismissed = review.triage.filter((t) => allowed.has(t.id) && t.verdict === "false_positive").length;
  await logRun(
    db,
    c.runId,
    "info",
    `AI review done: risk ${review.risk}, ${kept.length} new finding(s)${filtered ? ` (${filtered} low-confidence or out-of-scope dropped)` : ""}, ${dismissed} false positive(s) dismissed`,
  );
  return { ok: true };
}

async function publish(
  env: Env,
  c: RunContext,
  checkRunId: string | null,
  stats: Record<string, ScannerStat>,
) {
  const db = getDb(env);
  if (await isCancelled(db, c.runId)) return { cancelled: true };
  await updateRun(db, c.runId, { phase: "publishing" });

  const run = await db.query.run.findFirst({ where: eq(schema.run.id, c.runId) });
  const rows = await db.query.finding.findMany({ where: eq(schema.finding.runId, c.runId) });
  const findings: ReportFinding[] = rows.map((r) => ({ ...r }));

  const rctx: ReportContext = {
    isPr: c.isPr,
    failOn: c.failOn,
    runUrl: runUrl(env, c.runId),
    repoFullName: c.fullName,
    headSha: c.headSha,
    agent: c.agent,
    aiSummary: run?.aiSummary ?? null,
    aiRisk: run?.aiRisk ?? null,
    aiError: run?.aiError ?? null,
    scannerErrors: Object.entries(stats)
      .filter(([, s]) => s.status === "failed")
      .map(([n, s]) => `${n} failed: ${s.error ?? "error"}`),
  };
  const conclusion = decideConclusion(findings, rctx);
  const gh = githubFor(env, c.installationId);

  if (checkRunId) {
    const out = buildCheckOutput(findings, conclusion, rctx);
    await completeCheckRun(gh, {
      owner: c.owner,
      repo: c.repo,
      checkRunId,
      conclusion: conclusion === "fail" ? "failure" : conclusion === "pass" ? "success" : "neutral",
      ...out,
      annotations: buildAnnotations(findings, rctx),
    });
  }

  let reviewId: string | null = null;
  if (c.isPr && c.prId && c.prNumber) {
    // Don't repeat inline remarks a previous run already posted on this PR.
    const previous = await db.query.run.findMany({
      where: and(eq(schema.run.pullRequestId, c.prId), ne(schema.run.id, c.runId), eq(schema.run.status, "completed")),
      columns: { id: true },
      orderBy: [desc(schema.run.createdAt)],
      limit: 20,
    });
    const seen = new Set<string>();
    if (previous.length) {
      const prev = await db.query.finding.findMany({
        where: and(inArray(schema.finding.runId, previous.map((p) => p.id)), eq(schema.finding.commented, true)),
        columns: { fingerprint: true },
      });
      for (const p of prev) seen.add(p.fingerprint);
    }

    const diff = await loadDiffMap(env, c.runId);
    const { comments, fingerprints } = buildInlineComments(findings, diff, seen);
    // Idempotent on step retry: the review id is saved as soon as it posts.
    reviewId = run?.reviewId ?? null;
    if (comments.length && !reviewId) {
      const res = await createReview(gh, {
        owner: c.owner,
        repo: c.repo,
        prNumber: c.prNumber,
        commitSha: c.headSha,
        body: `🛡️ **OpenVScan** flagged ${comments.length} issue${comments.length === 1 ? "" : "s"} in this diff. See the summary comment for the full report.`,
        comments,
      });
      reviewId = res.id;
      await updateRun(db, c.runId, { reviewId });
      if (res.inlineDropped) {
        await logRun(db, c.runId, "warn", "GitHub rejected inline comments; posted summary only");
      } else {
        await batchAll(
          db,
          chunk(fingerprints, 90).map((part) =>
            db
              .update(schema.finding)
              .set({ commented: true })
              .where(and(eq(schema.finding.runId, c.runId), inArray(schema.finding.fingerprint, part))),
          ),
        );
      }
    }

    const pr = await db.query.pullRequest.findFirst({ where: eq(schema.pullRequest.id, c.prId) });
    const commentId = await upsertSummaryComment(gh, {
      owner: c.owner,
      repo: c.repo,
      prNumber: c.prNumber,
      body: buildSummaryComment(findings, conclusion, rctx),
      knownCommentId: pr?.summaryCommentId ?? c.summaryCommentId,
      appId: env.GITHUB_APP_ID,
    });
    await db
      .update(schema.pullRequest)
      .set({ summaryCommentId: commentId })
      .where(eq(schema.pullRequest.id, c.prId));
  }

  const counts = countBySeverity(findings.filter((f) => isRelevant(f, c.isPr)));
  await updateRun(db, c.runId, {
    status: "completed",
    phase: "done",
    conclusion,
    counts,
    reviewId,
    completedAt: new Date(),
  });
  await logRun(db, c.runId, "info", `Completed: ${conclusion} (${findings.length} finding(s) total)`);
  return { conclusion, findings: findings.length };
}
