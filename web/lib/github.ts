import {
  appOctokit,
  getInstallationAccount,
  type InstallationAccount,
  type InstallationRepo,
  installationOctokit,
  listInstallationRepos,
  normalizePrivateKey,
} from "@openvscan/github";
import { and, eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getEnv } from "@/src/lib/env";

/**
 * Server-side GitHub App glue shared by the webhook/setup routes and the
 * dashboard server functions. Wraps the helpers in `@openvscan/github` with
 * OpenVScan's env + D1 persistence.
 */

export function isGithubConfigured(): boolean {
  return Boolean(getEnv("GITHUB_APP_ID") && getEnv("GITHUB_APP_PRIVATE_KEY"));
}

export function getAppCreds() {
  const appId = getEnv("GITHUB_APP_ID");
  const rawKey = getEnv("GITHUB_APP_PRIVATE_KEY");
  if (!appId || !rawKey) {
    throw new Error("GitHub App is not configured");
  }
  return { appId, privateKey: normalizePrivateKey(rawKey) };
}

/** Public install URL for the GitHub App (or null when the slug is unset). */
export function installUrl(): string | null {
  const slug = getEnv("GITHUB_APP_SLUG");
  return slug ? `https://github.com/apps/${slug}/installations/new` : null;
}

/** Why an installation can't be connected; the code is shown on the page. */
export class InstallationAccessError extends Error {
  constructor(
    readonly code: "invalid" | "github_not_linked" | "not_admin" | "taken",
  ) {
    super(code);
  }
}

/** The signed-in user's GitHub token (decrypted and refreshed by Better Auth). */
export async function githubUserToken(userId: string): Promise<string | null> {
  try {
    const { accessToken } = await getAuth().api.getAccessToken({
      body: { providerId: "github", userId },
    });
    return accessToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Prove the signed-in user administers the installation's account before we
 * bind it to them. The setup redirect's `installation_id` is user-controlled,
 * so without this anyone could claim someone else's installation.
 *  - Personal account: the user's linked GitHub account must be that account.
 *  - Organization: the user must be an active org admin (needs the App's
 *    "Members: read" organization permission).
 */
async function verifyInstallationAdmin(
  userId: string,
  account: InstallationAccount,
) {
  const githubAccount = await getDb().query.account.findFirst({
    where: and(
      eq(schema.account.userId, userId),
      eq(schema.account.providerId, "github"),
    ),
    columns: { accountId: true },
  });
  if (!githubAccount) throw new InstallationAccessError("github_not_linked");
  if (account.type === "User") {
    if (githubAccount.accountId === account.id) return;
    throw new InstallationAccessError("not_admin");
  }

  const token = await githubUserToken(userId);
  if (!token) throw new InstallationAccessError("github_not_linked");
  const res = await fetch(
    `https://api.github.com/user/memberships/orgs/${encodeURIComponent(account.login)}`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "openvscan",
      },
    },
  );
  const membership = res.ok
    ? ((await res.json()) as { role?: string; state?: string })
    : null;
  if (membership?.role === "admin" && membership.state === "active") return;
  throw new InstallationAccessError("not_admin");
}

/**
 * Bind `installationId` to the user who just installed the App, after
 * verifying they administer it. An installation stays with the user who
 * connected it first; nobody else can take it (or its repositories) over.
 */
export async function syncInstallation(userId: string, installationId: string) {
  if (!/^\d{1,20}$/.test(installationId))
    throw new InstallationAccessError("invalid");
  const account = await getInstallationAccount(
    appOctokit(getAppCreds()),
    installationId,
  );
  await verifyInstallationAdmin(userId, account);

  const db = getDb();
  const existing = await db.query.githubInstallation.findFirst({
    where: eq(schema.githubInstallation.installationId, installationId),
  });
  if (existing && existing.userId !== userId)
    throw new InstallationAccessError("taken");

  const values = { accountLogin: account.login, accountType: account.type };
  if (existing) {
    await db
      .update(schema.githubInstallation)
      .set(values)
      .where(eq(schema.githubInstallation.id, existing.id));
  } else {
    await db
      .insert(schema.githubInstallation)
      .values({ id: crypto.randomUUID(), userId, installationId, ...values });
  }
}

/** Octokit scoped to a stored installation row. */
export function octokitForInstallation(installationId: string) {
  return installationOctokit({ ...getAppCreds(), installationId });
}

/** List every repo the installation can access (live from GitHub). */
export function accessibleRepos(
  installationId: string,
): Promise<InstallationRepo[]> {
  return listInstallationRepos(octokitForInstallation(installationId));
}
