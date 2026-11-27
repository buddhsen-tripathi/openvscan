import { AGENT_PROVIDERS, CREDENTIAL_KINDS, FAIL_THRESHOLDS, type Scanner } from "@openvscan/core";
import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { pullRequest, run } from "./review";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
    .notNull(),
};

/**
 * A GitHub App installation (a user or org account), owned by the OpenVScan
 * user who installed it. Installation access tokens are minted from this.
 */
export const githubInstallation = sqliteTable("github_installation", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // GitHub's numeric installation id (text to avoid precision issues).
  installationId: text("installation_id").notNull().unique(),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type").notNull(), // 'User' | 'Organization'
  /** Set while the installation is suspended on GitHub (no reviews run). */
  suspendedAt: integer("suspended_at", { mode: "timestamp" }),
  ...timestamps,
});

/** A connected repository plus its review policy. */
export const repository = sqliteTable(
  "repository",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    installationId: text("installation_id")
      .notNull()
      .references(() => githubInstallation.id, { onDelete: "cascade" }),
    githubRepoId: text("github_repo_id").notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    fullName: text("full_name").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    private: integer("private", { mode: "boolean" }).default(false).notNull(),
    /** Review every PR automatically (opened / synchronize / reopened). */
    autoReview: integer("auto_review", { mode: "boolean" }).default(true).notNull(),
    /** Skip draft PRs until they're marked ready for review. */
    skipDrafts: integer("skip_drafts", { mode: "boolean" }).default(true).notNull(),
    scanners: text("scanners", { mode: "json" })
      .$type<Scanner[]>()
      .default(["trivy", "opengrep", "gitleaks"])
      .notNull(),
    /** Coding agent for the AI review; null = scanners only. */
    agent: text("agent", { enum: AGENT_PROVIDERS }),
    /** Optional model override passed to the agent CLI. */
    agentModel: text("agent_model"),
    /** Extra reviewer instructions appended to the agent prompt. */
    instructions: text("instructions"),
    failOn: text("fail_on", { enum: FAIL_THRESHOLDS }).default("high").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("repository_github_repo_id_uq").on(t.githubRepoId)],
);

/** Bring-your-own coding-agent credential, AES-GCM encrypted at rest. */
export const agentCredential = sqliteTable(
  "agent_credential",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: CREDENTIAL_KINDS }).notNull(),
    provider: text("provider", { enum: AGENT_PROVIDERS }).notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    /** Last 4 characters, for display only. */
    hint: text("hint").notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
    ...timestamps,
  },
  // One credential per agent per user; saving again replaces it.
  (t) => [
    uniqueIndex("agent_credential_user_provider_uq").on(t.userId, t.provider),
    index("agent_credential_user_idx").on(t.userId),
  ],
);

export const githubInstallationRelations = relations(
  githubInstallation,
  ({ one, many }) => ({
    user: one(user, {
      fields: [githubInstallation.userId],
      references: [user.id],
    }),
    repositories: many(repository),
  }),
);

export const repositoryRelations = relations(repository, ({ one, many }) => ({
  user: one(user, { fields: [repository.userId], references: [user.id] }),
  installation: one(githubInstallation, {
    fields: [repository.installationId],
    references: [githubInstallation.id],
  }),
  pullRequests: many(pullRequest),
  runs: many(run),
}));

export const agentCredentialRelations = relations(agentCredential, ({ one }) => ({
  user: one(user, { fields: [agentCredential.userId], references: [user.id] }),
}));
