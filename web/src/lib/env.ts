import { env } from "cloudflare:workers";

type WebEnv = {
  VITE_APP_URL?: string;
  /** WorkOS AuthKit: sign-in (client id + API key) and MCP (AuthKit domain). */
  WORKOS_CLIENT_ID?: string;
  WORKOS_API_KEY?: string;
  WORKOS_AUTHKIT_DOMAIN?: string;
  /** base64 AES-256 key for BYO agent credentials (shared with the engine). */
  CREDENTIALS_KEY?: string;
  // GitHub App, and its OAuth client for linking GitHub accounts.
  GITHUB_APP_ID?: string;
  GITHUB_APP_SLUG?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
};

const workerEnv = env as WebEnv;

export function getEnv(name: keyof WebEnv): string | undefined {
  return workerEnv[name] ?? process.env[name];
}

interface RateLimiter {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

/** A Workers rate-limit binding, or null when it is not bound. */
export function getRateLimiter(
  name: "AUTH_IP_LIMITER" | "AUTH_EMAIL_LIMITER",
): RateLimiter | null {
  const binding = (env as unknown as Record<string, unknown>)[name];
  return binding && typeof (binding as RateLimiter).limit === "function"
    ? (binding as RateLimiter)
    : null;
}
