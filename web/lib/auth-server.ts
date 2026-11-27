import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import {
  type AuthResponse,
  authenticateWithEmailCode,
  authenticateWithPassword,
  clearPending,
  confirmPasswordReset,
  createPasswordReset,
  createWorkosUser,
  findWorkosUserByEmail,
  isAuthConfigured,
  logSafe,
  readPending,
  sendVerificationEmail,
  upsertUser,
  WorkosError,
  writePending,
  writeSession,
} from "@/lib/auth";
import { linkGithubFromAuth } from "@/lib/github-account";
import { getRateLimiter } from "@/src/lib/env";
import { safeRedirect } from "@/src/lib/session";

/**
 * The email and password forms on /signin, /signup, /forgot-password and
 * /reset-password. Each call goes to WorkOS's API; WorkOS keeps the
 * passwords, sends the emails and has the final say on password strength.
 *
 * Results are returned, not thrown, so the page can show a plain message.
 */

export type AuthResult =
  | { ok: true; redirect: string }
  | { ok: false; error: string }
  /** WorkOS emailed a code; the page asks for it. */
  | { ok: false; verify: true; email: string };

const NOT_CONFIGURED =
  "Sign-in is not configured on this deployment. Set WORKOS_CLIENT_ID and WORKOS_API_KEY.";
const TOO_MANY = "Too many attempts. Wait a minute and try again.";
const GENERIC = "Something went wrong. Please try again.";

function meta() {
  return {
    ip: getRequestHeader("cf-connecting-ip") ?? getRequestIP() ?? null,
    userAgent: getRequestHeader("user-agent") ?? null,
  };
}

type Action = "signin" | "signup" | "verify" | "resend" | "forgot" | "reset";

/**
 * False when the client IP or the email has used up its attempts. Each
 * action has its own email bucket, so failed sign-ins can't block a
 * password reset for the same address.
 */
async function allowed(action: Action, email?: string): Promise<boolean> {
  const ip = meta().ip;
  const checks: Promise<{ success: boolean }>[] = [];
  const byIp = getRateLimiter("AUTH_IP_LIMITER");
  if (byIp && ip) checks.push(byIp.limit({ key: `ip:${ip}` }));
  const byEmail = getRateLimiter("AUTH_EMAIL_LIMITER");
  if (byEmail && email)
    checks.push(byEmail.limit({ key: `${action}:${email}` }));
  const results = await Promise.all(checks);
  return results.every((r) => r.success);
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new Error("Email is required");
  const email = value.trim().toLowerCase();
  if (!email || email.length > 320 || !email.includes("@"))
    throw new Error("Enter a valid email address");
  return email;
}

function password(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 1000)
    throw new Error("Password is required");
  return value;
}

/** The first message in WorkOS's `errors[]`, e.g. a password rule. */
function firstDetail(err: WorkosError): string | null {
  const errors = err.body.errors;
  if (!Array.isArray(errors)) return null;
  for (const e of errors) {
    const m = (e as { message?: unknown })?.message;
    if (typeof m === "string" && m) return m;
  }
  return null;
}

function workosCode(err: unknown): string | null {
  return err instanceof WorkosError ? err.code : null;
}

async function signedIn(
  auth: AuthResponse,
  returnTo: string,
): Promise<AuthResult> {
  await upsertUser(auth.user);
  await linkGithubFromAuth(auth);
  await writeSession({
    accessToken: auth.access_token,
    refreshToken: auth.refresh_token,
  });
  clearPending();
  return { ok: true, redirect: returnTo };
}

/**
 * The outcome of a password sign-in: a session, a code step when WorkOS
 * wants the email verified, or a message.
 */
async function passwordSignIn(
  email: string,
  pass: string,
  returnTo: string,
): Promise<AuthResult> {
  try {
    return await signedIn(
      await authenticateWithPassword(email, pass, meta()),
      returnTo,
    );
  } catch (err) {
    const code = workosCode(err);
    if (code === "email_verification_required" && err instanceof WorkosError) {
      const token = err.body.pending_authentication_token;
      if (typeof token !== "string") return { ok: false, error: GENERIC };
      await writePending({ token, email, returnTo });
      return { ok: false, verify: true, email };
    }
    if (code === "invalid_credentials")
      return { ok: false, error: "Incorrect email or password." };
    if (code === "sso_required" || code === "organization_selection_required")
      return {
        ok: false,
        error:
          "This account signs in through your organization. Contact your admin.",
      };
    console.error("Password sign-in failed", logSafe(err));
    return { ok: false, error: GENERIC };
  }
}

export const signInWithPassword = createServerFn({ method: "POST" })
  .validator((d: { email: string; password: string; redirect?: string }) => ({
    email: normalizeEmail(d?.email),
    password: password(d?.password),
    returnTo: safeRedirect(d?.redirect) ?? "/dashboard",
  }))
  .handler(async ({ data }): Promise<AuthResult> => {
    if (!isAuthConfigured()) return { ok: false, error: NOT_CONFIGURED };
    if (!(await allowed("signin", data.email)))
      return { ok: false, error: TOO_MANY };
    return passwordSignIn(data.email, data.password, data.returnTo);
  });

export const signUpWithPassword = createServerFn({ method: "POST" })
  .validator(
    (d: {
      name: string;
      email: string;
      password: string;
      redirect?: string;
    }) => {
      const name =
        typeof d?.name === "string" ? d.name.trim().slice(0, 200) : "";
      if (!name) throw new Error("Name is required");
      return {
        name,
        email: normalizeEmail(d?.email),
        password: password(d?.password),
        returnTo: safeRedirect(d?.redirect) ?? "/dashboard",
      };
    },
  )
  .handler(async ({ data }): Promise<AuthResult> => {
    if (!isAuthConfigured()) return { ok: false, error: NOT_CONFIGURED };
    if (!(await allowed("signup", data.email)))
      return { ok: false, error: TOO_MANY };
    const [first, ...rest] = data.name.split(/\s+/);
    try {
      await createWorkosUser({
        email: data.email,
        password: data.password,
        first_name: first,
        ...(rest.length ? { last_name: rest.join(" ") } : {}),
      });
    } catch (err) {
      const code = workosCode(err);
      if (code === "password_strength_error" && err instanceof WorkosError)
        return {
          ok: false,
          error: firstDetail(err) ?? "Choose a stronger password.",
        };
      if (
        err instanceof WorkosError &&
        err.body.errors &&
        JSON.stringify(err.body.errors).includes("email_not_available")
      )
        return {
          ok: false,
          error: "An account already uses this email. Sign in instead.",
        };
      if (err instanceof WorkosError && err.status === 422)
        return {
          ok: false,
          error: firstDetail(err) ?? "Check your name, email and password.",
        };
      console.error("Sign-up failed", logSafe(err));
      return { ok: false, error: GENERIC };
    }
    // Usually WorkOS now asks for the emailed code.
    return passwordSignIn(data.email, data.password, data.returnTo);
  });

export const verifyEmailCode = createServerFn({ method: "POST" })
  .validator((d: { code: string }) => {
    const code = typeof d?.code === "string" ? d.code.replace(/\s/g, "") : "";
    if (!/^\d{6}$/.test(code)) throw new Error("Enter the 6-digit code");
    return { code };
  })
  .handler(async ({ data }): Promise<AuthResult> => {
    if (!isAuthConfigured()) return { ok: false, error: NOT_CONFIGURED };
    const pending = await readPending();
    if (!pending)
      return {
        ok: false,
        error: "This code has expired. Sign in again to get a new one.",
      };
    if (!(await allowed("verify", pending.email)))
      return { ok: false, error: TOO_MANY };
    try {
      return await signedIn(
        await authenticateWithEmailCode(data.code, pending.token, meta()),
        pending.returnTo,
      );
    } catch (err) {
      const code = workosCode(err);
      if (code === "invalid_one_time_code")
        return {
          ok: false,
          error: "That code is not right. Check it and try again.",
        };
      if (code === "invalid_pending_authentication_token") {
        clearPending();
        return {
          ok: false,
          error: "This code has expired. Sign in again to get a new one.",
        };
      }
      console.error("Email verification failed", logSafe(err));
      return { ok: false, error: GENERIC };
    }
  });

export const resendEmailCode = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: boolean; error?: string }> => {
    if (!isAuthConfigured()) return { ok: false, error: NOT_CONFIGURED };
    const pending = await readPending();
    if (!pending)
      return { ok: false, error: "Sign in again to get a new code." };
    if (!(await allowed("resend", pending.email)))
      return { ok: false, error: TOO_MANY };
    try {
      const user = await findWorkosUserByEmail(pending.email);
      if (user && !user.email_verified) await sendVerificationEmail(user.id);
      return { ok: true };
    } catch (err) {
      if (workosCode(err) === "email_already_verified") return { ok: true };
      console.error("Resending the verification code failed", logSafe(err));
      return { ok: false, error: GENERIC };
    }
  },
);

/** Always reports success, so the form can't tell who has an account. */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator((d: { email: string }) => ({ email: normalizeEmail(d?.email) }))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    if (!isAuthConfigured()) return { ok: false, error: NOT_CONFIGURED };
    if (!(await allowed("forgot", data.email)))
      return { ok: false, error: TOO_MANY };
    try {
      await createPasswordReset(data.email);
    } catch (err) {
      // Unknown emails land here too; say nothing different.
      if (!(err instanceof WorkosError && err.status < 500))
        console.error("Password reset request failed", logSafe(err));
    }
    return { ok: true };
  });

/** Set the new password, then sign straight in with it. */
export const resetPassword = createServerFn({ method: "POST" })
  .validator((d: { token: string; password: string }) => {
    const token = typeof d?.token === "string" ? d.token.trim() : "";
    if (!token || token.length > 500) throw new Error("Missing reset token");
    return { token, password: password(d?.password) };
  })
  .handler(
    async ({
      data,
    }): Promise<
      AuthResult | { ok: false; error: string; invalidLink: true }
    > => {
      if (!isAuthConfigured()) return { ok: false, error: NOT_CONFIGURED };
      if (!(await allowed("reset"))) return { ok: false, error: TOO_MANY };
      let email: string;
      try {
        ({
          user: { email },
        } = await confirmPasswordReset(data.token, data.password));
      } catch (err) {
        const code = workosCode(err);
        if (code === "password_reset_error" && err instanceof WorkosError)
          return {
            ok: false,
            error: firstDetail(err) ?? "Choose a stronger password.",
          };
        if (err instanceof WorkosError && err.status < 500)
          return {
            ok: false,
            invalidLink: true,
            error:
              "This reset link is invalid or has expired. Request a new one.",
          };
        console.error("Password reset failed", logSafe(err));
        return { ok: false, error: GENERIC };
      }
      const result = await passwordSignIn(email, data.password, "/dashboard");
      // Could not sign in (MFA, SSO…): the password is still changed.
      return result.ok || "verify" in result
        ? result
        : { ok: true, redirect: "/signin?reset=1" };
    },
  );

/** The address a pending sign-in is waiting on a code for, if any. */
export const pendingVerificationEmail = createServerFn({
  method: "GET",
}).handler(async (): Promise<string | null> => {
  const pending = await readPending();
  return pending?.email ?? null;
});
