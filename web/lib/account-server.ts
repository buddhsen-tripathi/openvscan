import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq, gt } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { githubUserToken } from "@/lib/github";
import { isMailConfigured } from "@/lib/mail";
import { requireUserId } from "@/lib/user";
import { getEnv } from "@/src/lib/env";

/**
 * Account reads and the few account changes Better Auth only exposes on the
 * server. Password changes, unlinking, revoking other sessions and deletion
 * go through Better Auth's rate-limited HTTP routes (see lib/api.ts).
 * Session tokens never leave the server; the client refers to sessions by id.
 */

async function currentSessionId() {
  const s = await getAuth().api.getSession({ headers: getRequestHeaders() });
  return s?.session.id ?? null;
}

/** GitHub login for a linked account (best effort; the token may be stale). */
async function githubLogin(userId: string) {
  const accessToken = await githubUserToken(userId);
  if (!accessToken) return null;
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/vnd.github+json",
        "user-agent": "openvscan",
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { login?: string }).login ?? null;
  } catch {
    return null;
  }
}

export const getAccount = createServerFn({ method: "GET" }).handler(
  async () => {
    const userId = await requireUserId();
    const db = getDb();
    const [u, accounts, sessions, current] = await Promise.all([
      db.query.user.findFirst({ where: eq(schema.user.id, userId) }),
      db.query.account.findMany({
        where: eq(schema.account.userId, userId),
        columns: {
          id: true,
          providerId: true,
          createdAt: true,
        },
      }),
      db.query.session.findMany({
        where: and(
          eq(schema.session.userId, userId),
          gt(schema.session.expiresAt, new Date()),
        ),
        orderBy: [desc(schema.session.updatedAt)],
        columns: {
          id: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      currentSessionId(),
    ]);
    if (!u) throw new Error("User not found");
    const github = accounts.find((a) => a.providerId === "github");
    return {
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        emailVerified: u.emailVerified,
        createdAt: u.createdAt,
      },
      hasPassword: accounts.some((a) => a.providerId === "credential"),
      github: github
        ? {
            id: github.id,
            login: await githubLogin(userId),
            linkedAt: github.createdAt,
          }
        : null,
      sessions: sessions.map((s) => ({ ...s, current: s.id === current })),
      capabilities: {
        githubSignIn: Boolean(
          getEnv("GITHUB_CLIENT_ID") && getEnv("GITHUB_CLIENT_SECRET"),
        ),
        email: isMailConfigured(),
      },
    };
  },
);

export const updateProfile = createServerFn({ method: "POST" })
  .validator((data: { name: string; image?: string | null }) => {
    const name = data?.name?.trim();
    if (!name) throw new Error("Name is required");
    if (name.length > 80)
      throw new Error("Name must be 80 characters or fewer");
    const image = data.image?.trim() || null;
    if (image && !/^https:\/\/\S{1,500}$/.test(image)) {
      throw new Error("Avatar must be an https:// URL");
    }
    return { name, image };
  })
  .handler(async ({ data }) => {
    await requireUserId();
    await getAuth().api.updateUser({
      body: data,
      headers: getRequestHeaders(),
    });
    return { success: true };
  });

function checkNewPassword(p: unknown): string {
  if (typeof p !== "string" || p.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  if (p.length > 128)
    throw new Error("Password must be 128 characters or fewer");
  return p;
}

/** Add a password to an account that only signs in with GitHub. */
export const setPassword = createServerFn({ method: "POST" })
  .validator((data: { newPassword: string }) => ({
    newPassword: checkNewPassword(data?.newPassword),
  }))
  .handler(async ({ data }) => {
    await requireUserId();
    await getAuth().api.setPassword({
      body: { newPassword: data.newPassword },
      headers: getRequestHeaders(),
    });
    return { success: true };
  });

export const revokeSession = createServerFn({ method: "POST" })
  .validator((id: string) => {
    if (typeof id !== "string" || !id) throw new Error("Invalid session");
    return id;
  })
  .handler(async ({ data: id }) => {
    const userId = await requireUserId();
    // Scope by user: a session id from someone else's account is a no-op.
    await getDb()
      .delete(schema.session)
      .where(and(eq(schema.session.id, id), eq(schema.session.userId, userId)));
    return { success: true };
  });
