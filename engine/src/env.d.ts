// Optional secrets, which `wrangler types` only emits when required.
interface Env {
  /** Daytona API key; when set (and SANDBOX_PROVIDER is empty) sandboxes run on Daytona. */
  DAYTONA_API_KEY?: string;
}
declare namespace Cloudflare {
  interface Env {
    DAYTONA_API_KEY?: string;
  }
}
