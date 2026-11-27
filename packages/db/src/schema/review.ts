import {
  AGENT_PROVIDERS,
  AI_VERDICTS,
  CONCLUSIONS,
  FAIL_THRESHOLDS,
  FINDING_SOURCES,
  RUN_PHASES,
  RUN_STATUSES,
  RUN_TRIGGERS,
  type Scanner,
  type ScannerStat,
  SEVERITIES,
  type SeverityCounts,
} from "@openvscan/core";
import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { repository } from "./github";

/** A pull request we've seen, kept in sync from webhook payloads. */
export const pullRequest = sqliteTable(
  "pull_request",
  {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repository.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    author: text("author").notNull(),
    authorAvatar: text("author_avatar"),
    url: text("url").notNull(),
    state: text("state", { enum: ["open", "closed", "merged"] }).notNull(),
    draft: integer("draft", { mode: "boolean" }).default(false).notNull(),
    headRef: text("head_ref").notNull(),
    headSha: text("head_sha").notNull(),
    baseRef: text("base_ref").notNull(),
    baseSha: text("base_sha").notNull(),
    /** Head repo full name; differs from the base repo for forks. */
    headRepoFullName: text("head_repo_full_name").notNull(),
    /** Id of the bot's sticky summary comment, updated on each run. */
    summaryCommentId: text("summary_comment_id"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [uniqueIndex("pull_request_repo_number_uq").on(t.repositoryId, t.number)],
);

/**
 * One execution of the review pipeline for a commit: checkout → scanners →
 * AI review → publish. Driven by the `ReviewWorkflow` in the engine Worker.
 */
export const run = sqliteTable(
  "run",
  {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repository.id, { onDelete: "cascade" }),
    /** Null for manual runs of a branch with no PR. */
    pullRequestId: text("pull_request_id").references(() => pullRequest.id, {
      onDelete: "cascade",
    }),
    trigger: text("trigger", { enum: RUN_TRIGGERS }).notNull(),
    status: text("status", { enum: RUN_STATUSES }).default("queued").notNull(),
    phase: text("phase", { enum: RUN_PHASES }).default("queued").notNull(),
    conclusion: text("conclusion", { enum: CONCLUSIONS }),
    headRef: text("head_ref").notNull(),
    headSha: text("head_sha").notNull(),
    /** Merge-base comparison target; null for branch runs (full scan). */
    baseSha: text("base_sha"),
    /** Snapshot of the repository policy when the run was created. */
    scanners: text("scanners", { mode: "json" }).$type<Scanner[]>().notNull(),
    agent: text("agent", { enum: AGENT_PROVIDERS }),
    agentModel: text("agent_model"),
    failOn: text("fail_on", { enum: FAIL_THRESHOLDS }).notNull(),
    instructions: text("instructions"),
    /** Agent's overall summary + risk rating (markdown). */
    aiSummary: text("ai_summary"),
    aiRisk: text("ai_risk"),
    /** Why the AI step didn't run / failed, if it didn't succeed. */
    aiError: text("ai_error"),
    counts: text("counts", { mode: "json" }).$type<SeverityCounts>(),
    scannerStats: text("scanner_stats", { mode: "json" }).$type<
      Record<string, ScannerStat>
    >(),
    filesChanged: integer("files_changed"),
    checkRunId: text("check_run_id"),
    reviewId: text("review_id"),
    error: text("error"),
    cancelRequested: integer("cancel_requested", { mode: "boolean" })
      .default(false)
      .notNull(),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("run_repository_idx").on(t.repositoryId, t.createdAt),
    index("run_pull_request_idx").on(t.pullRequestId, t.createdAt),
  ],
);

export const finding = sqliteTable(
  "finding",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => run.id, { onDelete: "cascade" }),
    source: text("source", { enum: FINDING_SOURCES }).notNull(),
    ruleId: text("rule_id"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    severity: text("severity", { enum: SEVERITIES }).notNull(),
    filePath: text("file_path"),
    startLine: integer("start_line"),
    endLine: integer("end_line"),
    /** True when the finding sits on a line the PR changed. */
    inDiff: integer("in_diff", { mode: "boolean" }).default(false).notNull(),
    cwe: text("cwe"),
    remediation: text("remediation"),
    suggestion: text("suggestion"),
    /** Stable across runs: lets the UI show new vs. already-known findings. */
    fingerprint: text("fingerprint").notNull(),
    aiVerdict: text("ai_verdict", { enum: AI_VERDICTS }),
    aiReasoning: text("ai_reasoning"),
    /** Posted as an inline PR comment; later runs won't repeat it. */
    commented: integer("commented", { mode: "boolean" }).default(false).notNull(),
    /** Scanner-specific extras (package, version, CVE, URLs, …). */
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [index("finding_run_idx").on(t.runId)],
);

export const runLog = sqliteTable(
  "run_log",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => run.id, { onDelete: "cascade" }),
    level: text("level", { enum: ["info", "warn", "error"] }).notNull(),
    message: text("message").notNull(),
    timestamp: integer("timestamp", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [index("run_log_run_idx").on(t.runId, t.timestamp)],
);

export const pullRequestRelations = relations(pullRequest, ({ one, many }) => ({
  repository: one(repository, {
    fields: [pullRequest.repositoryId],
    references: [repository.id],
  }),
  runs: many(run),
}));

export const runRelations = relations(run, ({ one, many }) => ({
  repository: one(repository, {
    fields: [run.repositoryId],
    references: [repository.id],
  }),
  pullRequest: one(pullRequest, {
    fields: [run.pullRequestId],
    references: [pullRequest.id],
  }),
  findings: many(finding),
  logs: many(runLog),
}));

export const findingRelations = relations(finding, ({ one }) => ({
  run: one(run, { fields: [finding.runId], references: [run.id] }),
}));

export const runLogRelations = relations(runLog, ({ one }) => ({
  run: one(run, { fields: [runLog.runId], references: [run.id] }),
}));
