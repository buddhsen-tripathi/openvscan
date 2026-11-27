import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * A person who signs in. Sign-in itself is WorkOS AuthKit: `id` is the WorkOS
 * user id, and this row mirrors the profile so the rest of the schema can
 * reference users. Sessions live in a sealed cookie, not in D1.
 */
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * The GitHub account a user linked, with a GitHub App user token. It proves
 * which installations the user may connect (personal account or org admin).
 * The tokens are AES-GCM sealed with CREDENTIALS_KEY (AAD = row id) as
 * `{ accessToken, refreshToken }` JSON.
 */
export const githubAccount = sqliteTable("github_account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  /** GitHub's numeric user id, as a string. */
  githubId: text("github_id").notNull().unique(),
  login: text("login").notNull(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  /** When the access token expires (null: it does not). */
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
    .notNull(),
});

export const userRelations = relations(user, ({ one }) => ({
  githubAccount: one(githubAccount, {
    fields: [user.id],
    references: [githubAccount.userId],
  }),
}));

export const githubAccountRelations = relations(githubAccount, ({ one }) => ({
  user: one(user, { fields: [githubAccount.userId], references: [user.id] }),
}));
