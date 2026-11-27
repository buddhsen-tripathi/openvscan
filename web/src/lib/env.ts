import { env } from "cloudflare:workers";

type WebEnv = {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  VITE_APP_URL?: string;
  /** base64 AES-256 key for BYO agent credentials (shared with the engine). */
  CREDENTIALS_KEY?: string;
  // GitHub App + OAuth (see README "GitHub integration").
  GITHUB_APP_ID?: string;
  GITHUB_APP_SLUG?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  /** Sender for verification/reset email; needs the EMAIL send_email binding. */
  EMAIL_FROM?: string;
};

const workerEnv = env as WebEnv;

export function getEnv(name: keyof WebEnv): string | undefined {
  return workerEnv[name] ?? process.env[name];
}
