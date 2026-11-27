import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { sendActionEmail } from "@/lib/mail";
import { releaseRepositories } from "@/lib/runs";
import { getEnv } from "@/src/lib/env";

const DAY = 60 * 60 * 24;

function createAuth() {
  const appUrl =
    getEnv("BETTER_AUTH_URL") ??
    getEnv("VITE_APP_URL") ??
    "http://localhost:3000";

  const secret = getEnv("BETTER_AUTH_SECRET");
  if (!secret && !import.meta.env.DEV) {
    throw new Error("BETTER_AUTH_SECRET is not set");
  }
  const db = getDb();

  // GitHub sign-in is enabled only when OAuth credentials are configured. Use
  // the GitHub App's own client id/secret so the token can list the user's
  // App installations and org memberships (see lib/github.ts).
  const githubClientId = getEnv("GITHUB_CLIENT_ID");
  const githubClientSecret = getEnv("GITHUB_CLIENT_SECRET");
  const socialProviders =
    githubClientId && githubClientSecret
      ? {
          github: {
            clientId: githubClientId,
            clientSecret: githubClientSecret,
          },
        }
      : undefined;

  return betterAuth({
    appName: "OpenVScan",
    baseURL: appUrl,
    secret,
    // Dev servers move ports; production trusts only the app's own origin.
    trustedOrigins: import.meta.env.DEV
      ? [appUrl, "http://localhost:*", "http://127.0.0.1:*"]
      : [appUrl],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      // A reset ends every other session, so a leaked password stops working.
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user: u, url }) {
        await sendActionEmail({
          to: u.email,
          subject: "Reset your OpenVScan password",
          intro:
            "Someone asked to reset the password for your OpenVScan account.",
          action: "Choose a new password",
          url,
          outro:
            "The link expires in one hour. If you didn't ask for this, ignore this email; your password stays the same.",
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      async sendVerificationEmail({ user: u, url }) {
        await sendActionEmail({
          to: u.email,
          subject: "Verify your email for OpenVScan",
          intro: "Confirm this address to finish setting up OpenVScan.",
          action: "Verify email",
          url,
          outro: "If you didn't create an account, ignore this email.",
        });
      },
    },
    socialProviders,
    account: {
      // GitHub tokens are stored encrypted with the auth secret.
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        // Signing in with GitHub joins an existing account only when both
        // sides have verified the same email, which blocks takeover through a
        // pre-registered address.
        // Explicit linking from Settings may use a different GitHub email.
        allowDifferentEmails: true,
      },
    },
    session: {
      expiresIn: 30 * DAY,
      updateAge: DAY,
    },
    user: {
      deleteUser: {
        enabled: true,
        // Stop running reviews and remove stored artifacts; the rows cascade.
        async beforeDelete(u) {
          const repos = await db
            .select({ id: schema.repository.id })
            .from(schema.repository)
            .where(eq(schema.repository.userId, u.id));
          await releaseRepositories(
            repos.map((r) => r.id),
            "Account deleted",
          );
        },
      },
    },
    rateLimit: {
      enabled: true,
      // Counters in D1 so limits hold across Worker isolates.
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 300, max: 3 },
        "/send-verification-email": { window: 300, max: 3 },
        "/change-password": { window: 60, max: 5 },
        "/delete-user": { window: 60, max: 3 },
        "/unlink-account": { window: 60, max: 5 },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    plugins: [tanstackStartCookies()],
  });
}

// Lazily constructed so the D1 binding (env.DB) is resolved at request time,
// not at module-evaluation time (when Worker bindings are not yet populated).
let cached: ReturnType<typeof createAuth> | null = null;

export function getAuth() {
  cached ??= createAuth();
  return cached;
}
