/**
 * A Codex ChatGPT login (from `codex login`), reduced to what the engine
 * needs. Stored encrypted as JSON; the refresh token rotates on every use,
 * so the engine writes the new pair back after refreshing.
 */
export interface CodexLogin {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  accountId: string;
}

const AUTH_CLAIM = "https://api.openai.com/auth";

/** The payload of a JWT, without verifying it (display and expiry only). */
export function jwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  if (!part) throw new Error("not a JWT");
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** The `https://api.openai.com/auth` claims of a ChatGPT token. */
export function chatgptClaims(jwt: string): {
  chatgpt_plan_type?: string;
  chatgpt_account_id?: string;
} {
  try {
    return (jwtPayload(jwt)[AUTH_CLAIM] as object) ?? {};
  } catch {
    return {};
  }
}

/** Seconds-since-epoch expiry of a JWT, or null when it has none. */
export function jwtExpiry(jwt: string): number | null {
  try {
    const exp = jwtPayload(jwt).exp;
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}

/** Parse the `auth.json` a user pastes. Throws a message fit for the form. */
export function parseCodexAuthFile(text: string): CodexLogin {
  let file: { tokens?: Record<string, unknown> };
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error("Paste the whole auth.json file; this isn't valid JSON");
  }
  const t = file?.tokens;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const accessToken = str(t?.access_token);
  const refreshToken = str(t?.refresh_token);
  const idToken = str(t?.id_token);
  if (!accessToken || !refreshToken || !idToken) {
    throw new Error(
      "This auth.json has no ChatGPT login. Sign in with `codex login --device-auth`, not an API key.",
    );
  }
  const accountId =
    str(t?.account_id) || chatgptClaims(idToken).chatgpt_account_id || "";
  if (!accountId) throw new Error("This auth.json has no ChatGPT account id");
  return { accessToken, refreshToken, idToken, accountId };
}

/** "Plus plan" from the login's id token, for display. */
export function codexPlanLabel(login: CodexLogin): string {
  const plan = chatgptClaims(login.idToken).chatgpt_plan_type;
  return plan ? `${plan[0].toUpperCase()}${plan.slice(1)} plan` : "ChatGPT plan";
}
