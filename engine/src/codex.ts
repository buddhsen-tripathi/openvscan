import {
  type CodexLogin,
  chatgptClaims,
  codexPlanLabel,
  jwtExpiry,
  openSecret,
  sealSecret,
} from "@openvscan/core";
import { and, eq } from "drizzle-orm";
import { type Db, schema } from "./db";

/**
 * ChatGPT-plan auth for Codex. The real tokens stay in the engine: the
 * sandbox gets an auth.json with unsigned placeholder tokens that Codex
 * accepts (it only reads their claims), and the egress proxy puts the real
 * access token on requests to the Codex backend.
 *
 * The engine refreshes the login itself, before the agent starts, so Codex
 * never tries to. Refresh tokens are single-use, so the rotated pair is
 * written back with a compare-and-swap on the ciphertext.
 */

const REFRESH_URL = "https://auth.openai.com/oauth/token";
/** Codex CLI's public OAuth client id. */
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
/** Refresh below this much lifetime, so the token outlasts the longest review. */
const MIN_LIFETIME_SEC = 60 * 60;

/** The login can't be refreshed any more: the user has to sign in again. */
export class CodexLoginRejected extends Error {
  constructor(reason: string) {
    super(
      `Your ChatGPT login for Codex no longer works (${reason}). Sign in again with \`codex login --device-auth\` and paste the new auth.json in Settings → AI agents.`,
    );
  }
}

type CredentialRow = typeof schema.agentCredential.$inferSelect;

/** A login with at least an hour left, refreshing and saving it if needed. */
export async function usableCodexLogin(db: Db, key: string, cred: CredentialRow): Promise<CodexLogin> {
  let row = cred;
  for (let attempt = 0; ; attempt++) {
    const login = JSON.parse(await openSecret(key, row, row.id)) as CodexLogin;
    const exp = jwtExpiry(login.accessToken);
    if (exp !== null && exp - Date.now() / 1000 > MIN_LIFETIME_SEC) return login;
    try {
      const next = await refresh(login);
      const sealed = await sealSecret(key, JSON.stringify(next), row.id);
      // Only replace what we read: if the user saved a new login meanwhile,
      // keep theirs (ours is still valid for this run).
      await db
        .update(schema.agentCredential)
        .set({ ...sealed, hint: codexPlanLabel(next) })
        .where(and(eq(schema.agentCredential.id, row.id), eq(schema.agentCredential.ciphertext, row.ciphertext)));
      return next;
    } catch (err) {
      if (!(err instanceof CodexLoginRejected) || attempt > 0) throw err;
      // A concurrent run may have rotated the token first; use what it saved.
      const latest = await db.query.agentCredential.findFirst({
        where: eq(schema.agentCredential.id, row.id),
      });
      if (!latest || latest.ciphertext === row.ciphertext) throw err;
      row = latest;
    }
  }
}

async function refresh(login: CodexLogin): Promise<CodexLogin> {
  const res = await fetch(REFRESH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, grant_type: "refresh_token", refresh_token: login.refreshToken }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 400 || res.status === 401) {
      let code = "refresh rejected";
      try {
        const e = JSON.parse(body).error;
        code = (typeof e === "string" ? e : e?.code) ?? code;
      } catch {}
      throw new CodexLoginRejected(code.replace(/_/g, " "));
    }
    // Anything else is transient: the workflow step retries.
    throw new Error(`ChatGPT token refresh failed with HTTP ${res.status}`);
  }
  const t = (await res.json()) as { access_token?: string; refresh_token?: string; id_token?: string };
  if (!t.access_token) throw new Error("ChatGPT token refresh returned no access token");
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? login.refreshToken,
    idToken: t.id_token ?? login.idToken,
    accountId: login.accountId,
  };
}

const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** An unsigned JWT: Codex decodes claims without verifying them. */
function placeholderJwt(claims: object): string {
  return `${b64url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}.openvscan`;
}

/**
 * The auth.json written into the sandbox. It carries no secret and no email:
 * only the plan type (Codex picks models by it), the workspace account id
 * (Codex checks its routing lookup against it) and an expiry far enough out
 * that Codex never tries to refresh.
 */
export function sandboxAuthFile(login: CodexLogin, now = Date.now(), accessToken?: string): string {
  const plan = chatgptClaims(login.idToken).chatgpt_plan_type;
  const jwt = placeholderJwt({
    exp: Math.floor(now / 1000) + 7 * 24 * 3600,
    "https://api.openai.com/auth": { chatgpt_plan_type: plan, chatgpt_account_id: login.accountId },
  });
  return JSON.stringify({
    auth_mode: "chatgpt",
    OPENAI_API_KEY: null,
    tokens: {
      id_token: jwt,
      // A backend's own stand-in when it swaps the token itself (Daytona).
      access_token: accessToken ?? jwt,
      refresh_token: "openvscan-placeholder",
      account_id: login.accountId,
    },
    last_refresh: new Date(now).toISOString(),
  });
}
