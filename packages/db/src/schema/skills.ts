import { SKILL_SOURCES } from "@openvscan/core";
import { relations } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

/**
 * A review skill a user added: markdown instructions for the AI reviewer.
 * `body` is a normalised snapshot (frontmatter removed); an imported skill is
 * never fetched again, and `sha256` identifies the exact text that was
 * reviewed and saved. Repositories reference skills by id in
 * `repository.skills` (built-ins as `builtin:<slug>`).
 */
export const reviewSkill = sqliteTable(
  "review_skill",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    body: text("body").notNull(),
    source: text("source", { enum: SKILL_SOURCES }).notNull(),
    /** The file an imported skill was fetched from. */
    sourceUrl: text("source_url"),
    /** Hex sha256 of `body`. */
    sha256: text("sha256").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  },
  // Also serves lookups by user (leading column).
  (t) => [uniqueIndex("review_skill_user_name_uq").on(t.userId, t.name)],
);

export const reviewSkillRelations = relations(reviewSkill, ({ one }) => ({
  user: one(user, { fields: [reviewSkill.userId], references: [user.id] }),
}));
