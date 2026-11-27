import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import {
  appOrigin,
  authkitDomain,
  clearSession,
  currentSession,
  deleteWorkosUser,
  listUserSessions,
  revokeUserSession,
  updateWorkosUser,
  WorkosError,
} from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import {
  isGithubLinkConfigured,
  linkedGithub,
  unlinkGithub,
} from "@/lib/github-account";
import { releaseRepositories } from "@/lib/runs";
import { requireUserId } from "@/lib/user";

/**
 * Account reads and changes. Sign-in methods, passwords and email
 * verification are WorkOS AuthKit's; here we only mirror the profile, manage
 * the linked GitHub account and list or end WorkOS sessions.
 */

async function requireSession() {
  const s = await currentSession();
  if (!s) throw new Error("Unauthorized");
  return s;
}

export const getAccount = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await requireSession();
    const userId = session.userId;
    const [u, github, sessions] = await Promise.all([
      getDb().query.user.findFirst({ where: eq(schema.user.id, userId) }),
      linkedGithub(userId),
      listUserSessions(userId).catch(() => null),
    ]);
    if (!u) throw new Error("User not found");
    return {
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        emailVerified: u.emailVerified,
        createdAt: u.createdAt,
      },
      github: github
        ? { login: github.login, linkedAt: github.createdAt }
        : null,
      // null when WorkOS couldn't be reached; the page says so.
      sessions:
        sessions?.map((s) => ({
          id: s.id,
          ipAddress: s.ip_address,
          userAgent: s.user_agent,
          authMethod: s.auth_method,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
          current: s.id === session.sessionId,
        })) ?? null,
      capabilities: {
        githubLink: isGithubLinkConfigured(),
        // The MCP endpoint, when this deployment has an AuthKit domain.
        mcpUrl: authkitDomain() ? `${appOrigin()}/mcp` : null,
      },
    };
  },
);

export const updateProfile = createServerFn({ method: "POST" })
  .validator((data: { name: string }) => {
    const name = data?.name?.trim();
    if (!name) throw new Error("Name is required");
    if (name.length > 80)
      throw new Error("Name must be 80 characters or fewer");
    return { name };
  })
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const [first, ...rest] = data.name.split(/\s+/);
    await updateWorkosUser(userId, {
      first_name: first,
      last_name: rest.join(" "),
    });
    await getDb()
      .update(schema.user)
      .set({ name: data.name })
      .where(eq(schema.user.id, userId));
    return { success: true };
  });

export const unlinkGithubAccount = createServerFn({ method: "POST" }).handler(
  async () => {
    const userId = await requireUserId();
    await unlinkGithub(userId);
    return { success: true };
  },
);

export const revokeSession = createServerFn({ method: "POST" })
  .validator((id: string) => {
    if (typeof id !== "string" || !/^[\w-]{1,100}$/.test(id))
      throw new Error("Invalid session");
    return id;
  })
  .handler(async ({ data: id }) => {
    const session = await requireSession();
    if (id === session.sessionId)
      throw new Error("Use Sign out to end this session");
    // Only the user's own sessions: revokeUserSession checks the id is theirs.
    await revokeUserSession(session.userId, id);
    return { success: true };
  });

export const revokeOtherSessions = createServerFn({ method: "POST" }).handler(
  async () => {
    const session = await requireSession();
    const sessions = await listUserSessions(session.userId);
    for (const s of sessions) {
      if (s.id !== session.sessionId)
        await revokeUserSession(session.userId, s.id, sessions);
    }
    return { success: true };
  },
);

/** How recently the user must have signed in to delete the account. */
const DELETE_FRESHNESS_SEC = 24 * 60 * 60;

export const deleteAccount = createServerFn({ method: "POST" })
  .validator((data: { confirmEmail: string }) => ({
    confirmEmail: String(data?.confirmEmail ?? ""),
  }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const db = getDb();
    const u = await db.query.user.findFirst({
      where: eq(schema.user.id, session.userId),
    });
    if (!u) throw new Error("User not found");
    if (data.confirmEmail.trim().toLowerCase() !== u.email.toLowerCase()) {
      throw new Error("Type your email address to confirm");
    }
    if (
      !session.authTime ||
      Date.now() / 1000 - session.authTime > DELETE_FRESHNESS_SEC
    ) {
      throw new Error(
        "For your security, sign out and sign in again, then delete the account within a day.",
      );
    }
    // Stop running reviews and remove stored artifacts; the rows cascade.
    const repos = await db
      .select({ id: schema.repository.id })
      .from(schema.repository)
      .where(eq(schema.repository.userId, u.id));
    await releaseRepositories(
      repos.map((r) => r.id),
      "Account deleted",
    );
    await deleteWorkosUser(u.id).catch((err) => {
      if (!(err instanceof WorkosError && err.status === 404)) throw err;
    });
    await db.delete(schema.user).where(eq(schema.user.id, u.id));
    clearSession();
    return { success: true };
  });
