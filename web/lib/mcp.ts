import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  AGENT_PROVIDERS,
  FAIL_THRESHOLDS,
  isDismissed,
  REVIEW_FOCUS,
  REVIEW_TRIGGERS,
  SCANNERS,
  SEVERITIES,
  type Severity,
} from "@openvscan/core";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import {
  getRepository,
  listRepositories,
  startManualRun,
  updateRepositorySettings,
} from "@/lib/github-server";
import { cancelActiveRunsForPr } from "@/lib/runs";
import { cancelRun, getRun, listRuns, rerun } from "@/lib/server";
import { listSkills } from "@/lib/skills-server";
import { runAsUser } from "@/lib/user";
import { getEnv } from "@/src/lib/env";

/**
 * OpenVScan's remote MCP server (Streamable HTTP, stateless). Coding agents
 * connect to `/mcp` and sign in through WorkOS AuthKit; every tool runs as
 * that user through the same server functions the dashboard uses, so the
 * same ownership checks apply.
 */

const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

const fail = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});

function appUrl(path: string) {
  return `${(getEnv("VITE_APP_URL") ?? "https://openvscan.com").replace(/\/$/, "")}${path}`;
}

/** A repository by id or "owner/name", owned by the user. */
async function resolveRepository(userId: string, ref: string) {
  const repo = await getDb().query.repository.findFirst({
    where: and(
      eq(schema.repository.userId, userId),
      or(eq(schema.repository.id, ref), eq(schema.repository.fullName, ref)),
    ),
  });
  if (!repo)
    throw new Error(
      `No connected repository "${ref}". Call list_repositories to see them.`,
    );
  return repo;
}

const rank = (s: Severity) => SEVERITIES.indexOf(s);

function buildServer(userId: string): McpServer {
  const server = new McpServer(
    { name: "openvscan", version: "1.0.0" },
    {
      instructions:
        "OpenVScan reviews GitHub pull requests for security issues. A review (run) has findings from Trivy, Opengrep, Gitleaks and an AI reviewer. Use list_reviews or list_repositories to find ids, get_review for findings with their fixes, and start_review or rerun_review to scan again.",
    },
  );
  const as = <T>(fn: () => Promise<T>) => runAsUser(userId, fn);
  const tool = async (fn: () => Promise<ReturnType<typeof json>>) => {
    try {
      return await as(fn);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  };

  server.registerTool(
    "list_repositories",
    {
      title: "List repositories",
      description:
        "Repositories connected to OpenVScan, with their review settings and latest review.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () =>
      tool(async () => {
        const repos = await listRepositories();
        return json(
          repos.map((r) => ({
            id: r.id,
            fullName: r.fullName,
            reviewTrigger: r.reviewTrigger,
            scanners: r.scanners,
            agent: r.agent,
            failOn: r.failOn,
            latestReview: r.runs[0]
              ? {
                  id: r.runs[0].id,
                  status: r.runs[0].status,
                  conclusion: r.runs[0].conclusion,
                  counts: r.runs[0].counts,
                }
              : null,
          })),
        );
      }),
  );

  server.registerTool(
    "list_reviews",
    {
      title: "List reviews",
      description:
        "Recent reviews, newest first. Filter by repository (id or owner/name), pull request number or status.",
      inputSchema: {
        repository: z
          .string()
          .optional()
          .describe("Repository id or owner/name"),
        pull_request: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Pull request number (needs repository)"),
        status: z
          .enum(["queued", "running", "completed", "failed", "cancelled"])
          .optional(),
        limit: z.number().int().min(1).max(50).default(20),
      },
      annotations: { readOnlyHint: true },
    },
    ({ repository, pull_request, status, limit }) =>
      tool(async () => {
        const repoId = repository
          ? (await resolveRepository(userId, repository)).id
          : null;
        const runs = (await listRuns())
          .filter((r) => !repoId || r.repositoryId === repoId)
          .filter(
            (r) => !pull_request || r.pullRequest?.number === pull_request,
          )
          .filter((r) => !status || r.status === status)
          .slice(0, limit);
        return json(
          runs.map((r) => ({
            id: r.id,
            repository: r.repository.fullName,
            pullRequest: r.pullRequest
              ? { number: r.pullRequest.number, title: r.pullRequest.title }
              : null,
            headRef: r.headRef,
            headSha: r.headSha,
            status: r.status,
            conclusion: r.conclusion,
            counts: r.counts,
            createdAt: r.createdAt,
            url: appUrl(`/dashboard/runs/${r.id}`),
          })),
        );
      }),
  );

  server.registerTool(
    "get_review",
    {
      title: "Get a review",
      description:
        "A review's summary and findings: severity, file and lines, whether the PR changed those lines, the AI verdict and reasoning, remediation and any suggested fix.",
      inputSchema: {
        review_id: z.string(),
        min_severity: z
          .enum(SEVERITIES)
          .optional()
          .describe("Only findings at or above this severity"),
        in_diff_only: z
          .boolean()
          .default(false)
          .describe("Only findings on lines the pull request changed"),
        include_dismissed: z
          .boolean()
          .default(false)
          .describe("Include findings the AI marked false positive"),
      },
      annotations: { readOnlyHint: true },
    },
    ({ review_id, min_severity, in_diff_only, include_dismissed }) =>
      tool(async () => {
        const run = await getRun({ data: review_id });
        const findings = run.findings
          .filter(
            (f) => !min_severity || rank(f.severity) <= rank(min_severity),
          )
          .filter((f) => !in_diff_only || f.inDiff)
          .filter((f) => include_dismissed || !isDismissed(f))
          .slice(0, 200);
        return json({
          id: run.id,
          repository: run.repository.fullName,
          pullRequest: run.pullRequest
            ? {
                number: run.pullRequest.number,
                title: run.pullRequest.title,
                url: run.pullRequest.url,
              }
            : null,
          headRef: run.headRef,
          headSha: run.headSha,
          status: run.status,
          conclusion: run.conclusion,
          failOn: run.failOn,
          aiSummary: run.aiSummary,
          aiRisk: run.aiRisk,
          aiError: run.aiError,
          aiSkipped: run.aiSkipped,
          skills: run.skills.map((s) => s.name),
          error: run.error,
          counts: run.counts,
          url: appUrl(`/dashboard/runs/${run.id}`),
          findings: findings.map((f) => ({
            id: f.id,
            source: f.source,
            severity: f.severity,
            title: f.title,
            file: f.filePath,
            startLine: f.startLine,
            endLine: f.endLine,
            inDiff: f.inDiff,
            ruleId: f.ruleId,
            cwe: f.cwe,
            aiVerdict: f.aiVerdict,
            aiReasoning: f.aiReasoning,
            description: f.description.slice(0, 2000),
            remediation: f.remediation,
            suggestion: f.suggestion,
          })),
          findingsShown: findings.length,
          findingsTotal: run.findings.length,
        });
      }),
  );

  server.registerTool(
    "start_review",
    {
      title: "Review a branch",
      description:
        "Start a review of a branch's latest commit (the whole repository, no pull request diff). Returns the review id; poll get_review until it completes.",
      inputSchema: {
        repository: z.string().describe("Repository id or owner/name"),
        branch: z
          .string()
          .optional()
          .describe("Defaults to the repository's default branch"),
      },
    },
    ({ repository, branch }) =>
      tool(async () => {
        const repo = await resolveRepository(userId, repository);
        const { runId } = await startManualRun({
          data: { repositoryId: repo.id, branch },
        });
        return json({
          reviewId: runId,
          url: appUrl(`/dashboard/runs/${runId}`),
        });
      }),
  );

  server.registerTool(
    "rerun_review",
    {
      title: "Re-run a review",
      description:
        "Run a review again. A pull request review re-runs on the pull request's current head.",
      inputSchema: { review_id: z.string() },
    },
    ({ review_id }) =>
      tool(async () => {
        const { runId } = await rerun({ data: review_id });
        return json({
          reviewId: runId,
          url: appUrl(`/dashboard/runs/${runId}`),
        });
      }),
  );

  server.registerTool(
    "cancel_review",
    {
      title: "Cancel a review",
      description: "Cancel a queued or running review.",
      inputSchema: { review_id: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    ({ review_id }) =>
      tool(async () => json(await cancelRun({ data: review_id }))),
  );

  server.registerTool(
    "set_pull_request_paused",
    {
      title: "Pause or resume a pull request",
      description:
        "Pause automatic reviews on one pull request (pushes stop starting reviews; running ones are cancelled), or resume them.",
      inputSchema: {
        repository: z.string().describe("Repository id or owner/name"),
        pull_request: z.number().int().positive(),
        paused: z.boolean(),
      },
    },
    ({ repository, pull_request, paused }) =>
      tool(async () => {
        const repo = await resolveRepository(userId, repository);
        const db = getDb();
        const pr = await db.query.pullRequest.findFirst({
          where: and(
            eq(schema.pullRequest.repositoryId, repo.id),
            eq(schema.pullRequest.number, pull_request),
          ),
        });
        if (!pr)
          throw new Error(
            `OpenVScan has not seen pull request #${pull_request} on ${repo.fullName}`,
          );
        await db
          .update(schema.pullRequest)
          .set({ paused })
          .where(eq(schema.pullRequest.id, pr.id));
        if (paused) await cancelActiveRunsForPr(pr.id, "Reviews paused");
        return json({ pullRequest: pull_request, paused });
      }),
  );

  server.registerTool(
    "list_skills",
    {
      title: "List review skills",
      description:
        "Review skills the AI reviewer can use: OpenVScan's built-ins and the ones you added in Settings. Pass their ids in update_repository_settings `skills`.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () =>
      tool(async () => {
        const { builtins, skills } = await listSkills();
        return json(
          [...builtins, ...skills].map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            builtin: s.builtin,
            source: s.source,
            sourceUrl: s.sourceUrl,
            updatedAt: s.updatedAt,
          })),
        );
      }),
  );

  server.registerTool(
    "get_repository_settings",
    {
      title: "Get repository settings",
      description: "A repository's review policy and its recent pull requests.",
      inputSchema: {
        repository: z.string().describe("Repository id or owner/name"),
      },
      annotations: { readOnlyHint: true },
    },
    ({ repository }) =>
      tool(async () => {
        const repo = await resolveRepository(userId, repository);
        const r = await getRepository({ data: repo.id });
        return json({
          id: r.id,
          fullName: r.fullName,
          defaultBranch: r.defaultBranch,
          settings: {
            reviewTrigger: r.reviewTrigger,
            skipDrafts: r.skipDrafts,
            baseBranches: r.baseBranches,
            ignorePaths: r.ignorePaths,
            scanners: r.scanners,
            agent: r.agent,
            agentModel: r.agentModel,
            focus: r.focus,
            skills: r.skills,
            instructions: r.instructions,
            failOn: r.failOn,
          },
          pullRequests: r.pullRequests.slice(0, 20).map((pr) => ({
            number: pr.number,
            title: pr.title,
            state: pr.state,
            paused: pr.paused,
            latestReview: pr.runs[0]
              ? {
                  id: pr.runs[0].id,
                  status: pr.runs[0].status,
                  conclusion: pr.runs[0].conclusion,
                }
              : null,
          })),
        });
      }),
  );

  server.registerTool(
    "update_repository_settings",
    {
      title: "Update repository settings",
      description:
        "Change a repository's review policy. Fields you leave out keep their current value.",
      inputSchema: {
        repository: z.string().describe("Repository id or owner/name"),
        review_trigger: z.enum(REVIEW_TRIGGERS).optional(),
        skip_drafts: z.boolean().optional(),
        base_branches: z
          .array(z.string())
          .optional()
          .describe("Empty: every base branch"),
        ignore_paths: z
          .array(z.string())
          .optional()
          .describe("Globs whose findings are dropped"),
        scanners: z.array(z.enum(SCANNERS)).optional(),
        agent: z
          .enum(AGENT_PROVIDERS)
          .nullable()
          .optional()
          .describe("null turns the AI reviewer off"),
        agent_model: z.string().nullable().optional(),
        focus: z.array(z.enum(REVIEW_FOCUS)).optional(),
        skills: z
          .array(z.string())
          .max(20)
          .optional()
          .describe(
            "Review skill ids from list_skills, in priority order. Replaces the current list; [] removes all.",
          ),
        instructions: z.string().max(4000).nullable().optional(),
        fail_on: z.enum(FAIL_THRESHOLDS).optional(),
      },
      annotations: { idempotentHint: true },
    },
    (input) =>
      tool(async () => {
        const repo = await resolveRepository(userId, input.repository);
        const updated = await updateRepositorySettings({
          data: {
            id: repo.id,
            reviewTrigger: input.review_trigger ?? repo.reviewTrigger,
            skipDrafts: input.skip_drafts ?? repo.skipDrafts,
            baseBranches: input.base_branches ?? repo.baseBranches,
            ignorePaths: input.ignore_paths ?? repo.ignorePaths,
            scanners: input.scanners ?? repo.scanners,
            agent: input.agent === undefined ? repo.agent : input.agent,
            agentModel:
              input.agent_model === undefined
                ? repo.agentModel
                : input.agent_model,
            focus: input.focus ?? repo.focus,
            skills: input.skills ?? repo.skills,
            instructions:
              input.instructions === undefined
                ? repo.instructions
                : input.instructions,
            failOn: input.fail_on ?? repo.failOn,
          },
        });
        return json({ id: updated?.id, updated: true });
      }),
  );

  return server;
}

/** Handle one MCP request for an authenticated user (stateless: a server per request). */
export async function handleMcp(
  request: Request,
  userId: string,
): Promise<Response> {
  const server = buildServer(userId);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    void server.close();
  }
}
