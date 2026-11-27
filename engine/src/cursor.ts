import { jwtExpiry, jwtPayload } from "@openvscan/core";

/**
 * Cursor auth. The CLI trades a user API key for an access token (and a
 * refresh token) at startup, which would put live tokens in the sandbox. So
 * the engine does that trade itself, the sandbox gets an unsigned placeholder
 * as CURSOR_AUTH_TOKEN, and the egress proxy puts the real access token on
 * requests to Cursor's API. The key never rotates, so each run trades afresh.
 */

const API_URL = "https://api2.cursor.sh";

/** Cursor refused the API key: the user has to create a new one. */
export class CursorKeyRejected extends Error {
  constructor(status: number) {
    super(
      `Cursor rejected the API key (HTTP ${status}). Create a new user API key under Cursor Dashboard → API Keys and save it in Settings → AI agents.`,
    );
  }
}

/** An access token for `apiKey`, the same way `cursor-agent` gets one. */
export async function cursorAccessToken(apiKey: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/exchange_user_api_key`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: "{}",
  });
  if (res.status === 401 || res.status === 403 || res.status === 404) throw new CursorKeyRejected(res.status);
  // Anything else is transient: the workflow step retries.
  if (!res.ok) throw new Error(`Cursor API key exchange failed with HTTP ${res.status}`);
  const body = (await res.json()) as { accessToken?: string };
  if (!body.accessToken) throw new Error("Cursor API key exchange returned no access token");
  return body.accessToken;
}

const b64url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/**
 * The CURSOR_AUTH_TOKEN the sandbox sees: the real token's claims (minus any
 * email) with a week-long expiry, so the CLI never tries to refresh, and no
 * valid signature, so it's useless outside this run's egress proxy.
 */
export function sandboxCursorToken(accessToken: string, now = Date.now()): string {
  let claims: Record<string, unknown> = {};
  try {
    claims = jwtPayload(accessToken);
  } catch {}
  delete claims.email;
  const exp = Math.max(jwtExpiry(accessToken) ?? 0, Math.floor(now / 1000) + 7 * 24 * 3600);
  return `${b64url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${b64url(JSON.stringify({ ...claims, exp }))}.openvscan`;
}
