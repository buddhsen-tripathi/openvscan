import { openSecret, sealSecret } from "@openvscan/core";
import {
  deleteCookie,
  getCookie,
  setCookie,
} from "@tanstack/react-start/server";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import { getDb, schema } from "@/lib/db";
import { getEnv } from "@/src/lib/env";

/**
 * Sign-in through WorkOS's HTTP API: our own email/password pages call the
 * password, email-code and password-reset endpoints, and GitHub goes
 * through WorkOS's OAuth redirect.
 *
 * The session is one cookie: the WorkOS access and refresh tokens, sealed
 * with CREDENTIALS_KEY. Each request verifies the access token (a JWT that
 * lives about five minutes) against WorkOS's keys and refreshes it when it
 * has expired, so a session revoked in WorkOS stops working within minutes.
 */

const API = "https://api.workos.com";
export const SESSION_COOKIE = "ovs_session";
const SESSION_AAD = "openvscan-session-v1";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export interface WorkosUser {
  id: string;
  email: string;
  email_verified: boolean;
  first_name: string | null;
  last_name: string | null;
  profile_picture_url: string | null;
}

export interface AuthResponse {
  user: WorkosUser;
  access_token: string;
  refresh_token: string;
  oauth_tokens?: {
    provider: string;
    access_token: string;
    refresh_token?: string | null;
    expires_at?: number | null;
  } | null;
}

interface Session {
  accessToken: string;
  refreshToken: string;
}

export function isAuthConfigured(): boolean {
  return Boolean(getEnv("WORKOS_CLIENT_ID") && getEnv("WORKOS_API_KEY"));
}

function clientId(): string {
  const id = getEnv("WORKOS_CLIENT_ID");
  if (!id) throw new Error("WORKOS_CLIENT_ID is not set");
  return id;
}

function sessionKey(): string {
  const key = getEnv("CREDENTIALS_KEY");
  if (!key) throw new Error("CREDENTIALS_KEY is not set");
  return key;
}

/** The app's public origin. */
export function appOrigin(request?: Request): string {
  const configured = getEnv("VITE_APP_URL");
  if (configured && !import.meta.env.DEV) return configured.replace(/\/$/, "");
  return request
    ? new URL(request.url).origin
    : (configured ?? "http://localhost:3000").replace(/\/$/, "");
}

/** A WorkOS API call with the secret key. */
export async function workos<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const key = getEnv("WORKOS_API_KEY");
  if (!key) throw new Error("WORKOS_API_KEY is not set");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let message = `HTTP ${res.status}`;
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text) as Record<string, unknown>;
      const m = body.error_description ?? body.message;
      if (typeof m === "string") message = m;
    } catch {}
    const code =
      typeof body.code === "string"
        ? body.code
        : typeof body.error === "string"
          ? body.error
          : null;
    throw new WorkosError(res.status, message, code, body);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

export class WorkosError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    /** WorkOS's machine-readable `code` (or OAuth `error`), if any. */
    readonly code: string | null = null,
    readonly body: Record<string, unknown> = {},
  ) {
    super(`WorkOS: ${detail}`);
  }
}

/**
 * Something safe to log for a failed call: status and code only. The error
 * body can hold pending-auth tokens and the user's profile.
 */
export function logSafe(err: unknown): string {
  if (err instanceof WorkosError)
    return `WorkOS ${err.status} ${err.code ?? "(no code)"}`;
  return err instanceof Error ? err.message : String(err);
}

/* -------------------------------- Sign-in -------------------------------- */

/** WorkOS's GitHub sign-in, coming back to our callback. */
export function githubAuthorizeUrl(opts: {
  redirectUri: string;
  state: string;
}): string {
  const q = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: opts.redirectUri,
    response_type: "code",
    state: opts.state,
    provider: "GitHubOAuth",
  });
  return `${API}/user_management/authorize?${q}`;
}

interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

function grant(
  type: string,
  fields: Record<string, unknown>,
  meta: RequestMeta,
) {
  return workos<AuthResponse>("POST", "/user_management/authenticate", {
    client_id: clientId(),
    client_secret: getEnv("WORKOS_API_KEY"),
    grant_type: type,
    ...fields,
    ...(meta.ip ? { ip_address: meta.ip } : {}),
    ...(meta.userAgent ? { user_agent: meta.userAgent.slice(0, 500) } : {}),
  });
}

export function authenticateWithPassword(
  email: string,
  password: string,
  meta: RequestMeta,
) {
  return grant("password", { email, password }, meta);
}

/** Finish a sign-in that WorkOS paused for email verification. */
export function authenticateWithEmailCode(
  code: string,
  pendingToken: string,
  meta: RequestMeta,
) {
  return grant(
    "urn:workos:oauth:grant-type:email-verification:code",
    { code, pending_authentication_token: pendingToken },
    meta,
  );
}

export function createWorkosUser(data: {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}) {
  return workos<WorkosUser>("POST", "/user_management/users", data);
}

export async function findWorkosUserByEmail(
  email: string,
): Promise<WorkosUser | null> {
  const res = await workos<{ data: WorkosUser[] }>(
    "GET",
    `/user_management/users?${new URLSearchParams({ email, limit: "1" })}`,
  );
  return res.data[0] ?? null;
}

export function sendVerificationEmail(userId: string) {
  return workos(
    "POST",
    `/user_management/users/${encodeURIComponent(userId)}/email_verification/send`,
  );
}

/** WorkOS emails the link, built from the environment's Password reset URL. */
export function createPasswordReset(email: string) {
  return workos("POST", "/user_management/password_reset", { email });
}

export function confirmPasswordReset(token: string, newPassword: string) {
  return workos<{ user: WorkosUser }>(
    "POST",
    "/user_management/password_reset/confirm",
    { token, new_password: newPassword },
  );
}

export function authenticateWithCode(code: string, meta: RequestMeta) {
  return grant("authorization_code", { code }, meta);
}

function displayName(u: WorkosUser): string {
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return name || u.email.split("@")[0] || "User";
}

/** Mirror the WorkOS profile into our `user` row (created on first sign-in). */
export async function upsertUser(u: WorkosUser): Promise<void> {
  const values = {
    name: displayName(u),
    email: u.email,
    emailVerified: u.email_verified,
    image: u.profile_picture_url,
  };
  await getDb()
    .insert(schema.user)
    .values({ id: u.id, ...values })
    .onConflictDoUpdate({ target: schema.user.id, set: values });
}

/* -------------------------------- Session -------------------------------- */

const cookieOptions = () => ({
  httpOnly: true,
  secure: !import.meta.env.DEV,
  sameSite: "lax" as const,
  path: "/",
});

export async function writeSession(s: Session): Promise<void> {
  const sealed = await sealSecret(sessionKey(), JSON.stringify(s), SESSION_AAD);
  setCookie(SESSION_COOKIE, `${sealed.iv}.${sealed.ciphertext}`, {
    ...cookieOptions(),
    maxAge: SESSION_MAX_AGE,
  });
}

/** The cookie value for a session, for routes that build their own Response. */
export async function sessionCookieHeader(s: Session): Promise<string> {
  const sealed = await sealSecret(sessionKey(), JSON.stringify(s), SESSION_AAD);
  const secure = import.meta.env.DEV ? "" : "; Secure";
  return `${SESSION_COOKIE}=${sealed.iv}.${sealed.ciphertext}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure}`;
}

export function clearSession(): void {
  deleteCookie(SESSION_COOKIE, cookieOptions());
}

/* ------------------------- Pending email verification -------------------- */

/**
 * When WorkOS asks for an email code, the pending token waits in its own
 * sealed cookie, so it never reaches page JavaScript.
 */
const PENDING_COOKIE = "ovs_pending";
const PENDING_AAD = "openvscan-pending-v1";

export interface PendingVerification {
  token: string;
  email: string;
  returnTo: string;
}

export async function writePending(p: PendingVerification): Promise<void> {
  const sealed = await sealSecret(sessionKey(), JSON.stringify(p), PENDING_AAD);
  setCookie(PENDING_COOKIE, `${sealed.iv}.${sealed.ciphertext}`, {
    ...cookieOptions(),
    maxAge: 10 * 60,
  });
}

/** The Set-Cookie value, for routes that build their own Response. */
export async function pendingCookieHeader(
  p: PendingVerification,
): Promise<string> {
  const sealed = await sealSecret(sessionKey(), JSON.stringify(p), PENDING_AAD);
  const secure = import.meta.env.DEV ? "" : "; Secure";
  return `${PENDING_COOKIE}=${sealed.iv}.${sealed.ciphertext}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
}

export async function readPending(): Promise<PendingVerification | null> {
  const raw = getCookie(PENDING_COOKIE);
  const [iv, ciphertext] = raw?.split(".") ?? [];
  if (!iv || !ciphertext) return null;
  try {
    return JSON.parse(
      await openSecret(sessionKey(), { iv, ciphertext }, PENDING_AAD),
    ) as PendingVerification;
  } catch {
    return null;
  }
}

export function clearPending(): void {
  deleteCookie(PENDING_COOKIE, cookieOptions());
}

async function readSession(): Promise<Session | null> {
  const raw = getCookie(SESSION_COOKIE);
  if (!raw) return null;
  const [iv, ciphertext] = raw.split(".");
  if (!iv || !ciphertext) return null;
  try {
    return JSON.parse(
      await openSecret(sessionKey(), { iv, ciphertext }, SESSION_AAD),
    ) as Session;
  } catch {
    return null;
  }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/** The user and session id in a valid access token, or null. */
export interface SessionInfo {
  userId: string;
  sessionId: string;
  /** When the user last actually signed in (seconds), if WorkOS says. */
  authTime: number | null;
}

async function verifyAccessToken(token: string): Promise<SessionInfo | null> {
  jwks ??= createRemoteJWKSet(new URL(`${API}/sso/jwks/${clientId()}`));
  try {
    const { payload } = await jwtVerify(token, jwks);
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string")
      return null;
    const authTime =
      typeof payload.auth_time === "number" ? payload.auth_time : null;
    return { userId: payload.sub, sessionId: payload.sid, authTime };
  } catch {
    return null;
  }
}

/** The request's signed-in user, refreshing the session cookie when needed. */
export async function currentSession(): Promise<SessionInfo | null> {
  if (!isAuthConfigured()) return null;
  const s = await readSession();
  if (!s) return null;
  const valid = await verifyAccessToken(s.accessToken);
  if (valid) return valid;
  try {
    const next = await workos<AuthResponse>(
      "POST",
      "/user_management/authenticate",
      {
        client_id: clientId(),
        client_secret: getEnv("WORKOS_API_KEY"),
        grant_type: "refresh_token",
        refresh_token: s.refreshToken,
      },
    );
    await writeSession({
      accessToken: next.access_token,
      refreshToken: next.refresh_token,
    });
    return verifyAccessToken(next.access_token);
  } catch {
    // Keep the cookie. Refresh tokens are single-use, so when two requests
    // race to refresh, one loses: clearing here would sign the user out at
    // random. A revoked session just stays signed out until the user signs
    // in again, which replaces the cookie.
    return null;
  }
}

/**
 * The WorkOS session id in the session cookie, without verifying or
 * refreshing the access token. For sign-out only: the cookie is sealed with
 * our key, so its contents can be trusted, and an expired session should
 * still be ended at WorkOS.
 */
export async function sessionIdFromCookie(): Promise<string | null> {
  const s = await readSession();
  if (!s) return null;
  try {
    const { sid } = decodeJwt(s.accessToken);
    return typeof sid === "string" ? sid : null;
  } catch {
    return null;
  }
}

/** Where to send the browser to end the WorkOS session too. */
export function signOutUrl(sessionId: string, returnTo: string): string {
  return `${API}/user_management/sessions/logout?${new URLSearchParams({ session_id: sessionId, return_to: returnTo })}`;
}

/* ------------------------------ Account API ------------------------------ */

export interface WorkosSession {
  id: string;
  ip_address: string | null;
  user_agent: string | null;
  auth_method: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export async function listUserSessions(
  userId: string,
): Promise<WorkosSession[]> {
  const res = await workos<{ data: WorkosSession[] }>(
    "GET",
    `/user_management/users/${encodeURIComponent(userId)}/sessions?limit=50`,
  );
  return res.data.filter((s) => s.status === "active");
}

export async function revokeUserSession(
  userId: string,
  sessionId: string,
  /** The user's sessions, when the caller already listed them. */
  known?: WorkosSession[],
): Promise<void> {
  const sessions = known ?? (await listUserSessions(userId));
  if (!sessions.some((s) => s.id === sessionId))
    throw new Error("Session not found");
  await workos("POST", "/user_management/sessions/revoke", {
    session_id: sessionId,
  });
}

export function updateWorkosUser(
  userId: string,
  data: { first_name?: string; last_name?: string },
) {
  return workos<WorkosUser>(
    "PUT",
    `/user_management/users/${encodeURIComponent(userId)}`,
    data,
  );
}

export function deleteWorkosUser(userId: string) {
  return workos(
    "DELETE",
    `/user_management/users/${encodeURIComponent(userId)}`,
  );
}

/* ---------------------------------- MCP ---------------------------------- */

let mcpJwks: {
  domain: string;
  set: ReturnType<typeof createRemoteJWKSet>;
} | null = null;

/** The AuthKit domain MCP clients sign in through, e.g. https://x.authkit.app. */
export function authkitDomain(): string | null {
  const d = getEnv("WORKOS_AUTHKIT_DOMAIN")?.trim().replace(/\/$/, "");
  if (!d) return null;
  return /^https?:\/\//.test(d) ? d : `https://${d}`;
}

/** The user an MCP bearer token (issued by AuthKit for `resource`) belongs to. */
export async function verifyMcpToken(
  token: string,
  resource: string,
): Promise<string | null> {
  const domain = authkitDomain();
  if (!domain) return null;
  if (mcpJwks?.domain !== domain) {
    mcpJwks = {
      domain,
      set: createRemoteJWKSet(new URL(`${domain}/oauth2/jwks`)),
    };
  }
  try {
    // AuthKit sets `aud` to the resource when the WorkOS environment has it
    // as a resource indicator, and to the environment's client id otherwise.
    // Either way the token was issued by this deployment's AuthKit.
    const { payload } = await jwtVerify(token, mcpJwks.set, {
      issuer: domain,
      audience: [resource, clientId()],
    });
    if (payload.sub_profile === "ai_agent") return null;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
