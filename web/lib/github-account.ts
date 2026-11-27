import { openSecret, sealSecret } from "@openvscan/core";
import { eq } from "drizzle-orm";
import type { AuthResponse } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getEnv } from "@/src/lib/env";

/**
 * The GitHub account a user links, through the GitHub App's own OAuth
 * client. Its user token tells us which installations the user may connect.
 * Tokens are sealed with CREDENTIALS_KEY; GitHub App user tokens expire after
 * eight hours and are refreshed here.
 */

interface GithubTokens {
  accessToken: string;
  refreshToken: string | null;
  /** Seconds until the access token expires, when it does. */
  expiresIn?: number | null;
}

export function isGithubLinkConfigured(): boolean {
  return Boolean(getEnv("GITHUB_CLIENT_ID") && getEnv("GITHUB_CLIENT_SECRET"));
}

function credentialsKey(): string {
  const key = getEnv("CREDENTIALS_KEY");
  if (!key) throw new Error("CREDENTIALS_KEY is not set");
  return key;
}

/** GitHub's consent page for linking, coming back to `redirectUri`. */
export function githubAuthorizeUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: getEnv("GITHUB_CLIENT_ID") ?? "",
    redirect_uri: redirectUri,
    state,
    allow_signup: "false",
  });
  return `https://github.com/login/oauth/authorize?${q}`;
}

async function tokenRequest(
  params: Record<string, string>,
): Promise<GithubTokens> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: getEnv("GITHUB_CLIENT_ID"),
      client_secret: getEnv("GITHUB_CLIENT_SECRET"),
      ...params,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new Error(`GitHub token request failed: ${body.error ?? res.status}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresIn: body.expires_in ?? null,
  };
}

/** Trade an OAuth callback code for tokens. */
export function exchangeGithubCode(code: string, redirectUri: string) {
  return tokenRequest({ code, redirect_uri: redirectUri });
}

/** Thrown when the GitHub account is already linked to another user. */
export class GithubAccountTaken extends Error {
  constructor() {
    super("That GitHub account is linked to another OpenVScan account.");
  }
}

async function githubUser(accessToken: string) {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "openvscan",
    },
  });
  if (!res.ok) throw new Error(`GitHub /user failed (HTTP ${res.status})`);
  const u = (await res.json()) as { id: number; login: string };
  return { id: String(u.id), login: u.login };
}

/** Link (or relink) `userId` to the GitHub account behind `tokens`. */
export async function saveGithubAccount(userId: string, tokens: GithubTokens) {
  const db = getDb();
  const gh = await githubUser(tokens.accessToken);
  const other = await db.query.githubAccount.findFirst({
    where: eq(schema.githubAccount.githubId, gh.id),
    columns: { userId: true },
  });
  if (other && other.userId !== userId) throw new GithubAccountTaken();

  const existing = await db.query.githubAccount.findFirst({
    where: eq(schema.githubAccount.userId, userId),
    columns: { id: true },
  });
  const id = existing?.id ?? crypto.randomUUID();
  const sealed = await sealSecret(
    credentialsKey(),
    JSON.stringify({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    }),
    id,
  );
  const expiresAt = tokens.expiresIn
    ? new Date(Date.now() + tokens.expiresIn * 1000)
    : null;
  const values = { githubId: gh.id, login: gh.login, ...sealed, expiresAt };
  if (existing) {
    await db
      .update(schema.githubAccount)
      .set(values)
      .where(eq(schema.githubAccount.id, id));
  } else {
    await db.insert(schema.githubAccount).values({ id, userId, ...values });
  }
  return gh;
}

/** The linked GitHub account (no tokens), or null. */
export function linkedGithub(userId: string) {
  return getDb().query.githubAccount.findFirst({
    where: eq(schema.githubAccount.userId, userId),
    columns: { id: true, githubId: true, login: true, createdAt: true },
  });
}

export async function unlinkGithub(userId: string) {
  await getDb()
    .delete(schema.githubAccount)
    .where(eq(schema.githubAccount.userId, userId));
}

/** A working GitHub user token for `userId`, refreshing it if needed; null if none. */
export async function githubUserToken(userId: string): Promise<string | null> {
  const db = getDb();
  const row = await db.query.githubAccount.findFirst({
    where: eq(schema.githubAccount.userId, userId),
  });
  if (!row) return null;
  const tokens = JSON.parse(
    await openSecret(credentialsKey(), row, row.id),
  ) as {
    accessToken: string;
    refreshToken: string | null;
  };
  const fresh =
    !row.expiresAt || row.expiresAt.getTime() - Date.now() > 5 * 60 * 1000;
  if (fresh) return tokens.accessToken;
  if (!tokens.refreshToken) return null;
  try {
    const next = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    });
    await saveGithubAccount(userId, next);
    return next.accessToken;
  } catch {
    // The refresh token expired (six months) or was revoked: link again.
    return null;
  }
}

/**
 * Signing in with GitHub links it too, when WorkOS returns the token
 * ("Return GitHub OAuth tokens" with the GitHub App's credentials).
 */
export async function linkGithubFromAuth(auth: AuthResponse): Promise<void> {
  const gh = auth.oauth_tokens;
  if (gh?.provider !== "GitHubOAuth" || !gh.access_token) return;
  await saveGithubAccount(auth.user.id, {
    accessToken: gh.access_token,
    refreshToken: gh.refresh_token ?? null,
    expiresIn: gh.expires_at
      ? gh.expires_at - Math.floor(Date.now() / 1000)
      : null,
  }).catch((err) =>
    console.warn(
      "Could not link GitHub on sign-in",
      err instanceof Error ? err.message : String(err),
    ),
  );
}
