import type { CredentialKind } from "@openvscan/core";
import { WorkerEntrypoint } from "cloudflare:workers";
import { TRIVY_DB_HOSTS } from "./box";
import { anthropicAllowed, openaiAllowed } from "./egress-rules";

/**
 * Egress policy for a review sandbox, passed as trusted `props` when the
 * ScanSandbox registers this entrypoint as its outbound interceptor. The
 * sandbox starts with `enableInternet: false`, so every HTTP(S) request it
 * makes lands here; anything not explicitly allowed for the current phase
 * is refused. Secrets live only in these props — never in the container.
 *
 * Phases are deliberately disjoint: while the agent runs (and reads
 * attacker-controllable PR content), the only reachable host is the model
 * API — it can't reach GitHub, package registries, or anything else to
 * exfiltrate code or tokens.
 */
export type EgressPolicy =
  | { phase: "locked" }
  | {
      phase: "checkout";
      /** "owner/repo" — the only repository git may fetch. */
      repo: string;
      /** Short-lived, read-only installation token scoped to `repo`. */
      githubToken: string;
    }
  | { phase: "scan" }
  | {
      phase: "agent";
      kind: CredentialKind;
      /** API key or bearer access token. */
      secret: string;
      /** ChatGPT workspace the access token belongs to (ChatGPT login only). */
      accountId?: string;
      /** The stand-in token the sandbox holds, swapped wherever it appears (Cursor only). */
      placeholder?: string;
    };

const TRIVY_DB = new Set(TRIVY_DB_HOSTS);

const deny = (why: string) => {
  // Visible in Workers observability: what a sandbox tried and was refused.
  console.warn(`[egress] denied: ${why}`);
  return new Response(`${why}\n`, { status: 403 });
};

export class Outbound extends WorkerEntrypoint<Env, EgressPolicy> {
  async fetch(request: Request): Promise<Response> {
    const policy = this.ctx.props;
    const url = new URL(request.url);

    // The Worker re-issues the request with the scheme the container used;
    // never let a credential travel over plain HTTP.
    if (url.protocol !== "https:") return deny(`${url.host}: HTTPS only`);

    switch (policy?.phase) {
      case "checkout":
        return this.checkout(request, url, policy);
      case "scan":
        if (TRIVY_DB.has(url.hostname) && (request.method === "GET" || request.method === "HEAD")) {
          return fetch(request);
        }
        return deny(`${url.hostname} is not reachable while scanning`);
      case "agent":
        return this.agent(request, url, policy);
      default:
        return deny(`${url.hostname} is not reachable from this sandbox`);
    }
  }

  /** Only the smart-HTTP *fetch* endpoints of one repo: no push, no other repos. */
  private checkout(
    request: Request,
    url: URL,
    policy: Extract<EgressPolicy, { phase: "checkout" }>,
  ): Promise<Response> | Response {
    if (url.hostname !== "github.com") return deny(`${url.hostname} blocked during checkout`);
    const base = `/${policy.repo}.git`;
    const isFetch =
      (request.method === "GET" &&
        url.pathname === `${base}/info/refs` &&
        url.search === "?service=git-upload-pack") ||
      (request.method === "POST" && url.pathname === `${base}/git-upload-pack`);
    if (!isFetch) return deny("only git fetch of the reviewed repository is allowed");

    const headers = new Headers(request.headers);
    // An empty token means a public repository (local dev smoke test).
    if (policy.githubToken) {
      headers.set("Authorization", `Basic ${btoa(`x-access-token:${policy.githubToken}`)}`);
    }
    return fetch(new Request(request, { headers }));
  }

  /** Model API only, with the user's credential swapped in for the placeholder. */
  private agent(
    request: Request,
    url: URL,
    policy: Extract<EgressPolicy, { phase: "agent" }>,
  ): Promise<Response> | Response {
    const headers = new Headers(request.headers);
    switch (policy.kind) {
      case "claude_oauth_token":
      case "anthropic_api_key": {
        if (url.hostname !== "api.anthropic.com") {
          return deny(`${url.hostname} is not reachable during the AI review`);
        }
        if (!anthropicAllowed(request.method, url.pathname)) {
          return deny(`${request.method} ${url.pathname} is not needed for a review`);
        }
        headers.delete("authorization");
        headers.delete("x-api-key");
        if (policy.kind === "claude_oauth_token") {
          headers.set("authorization", `Bearer ${policy.secret}`);
        } else {
          headers.set("x-api-key", policy.secret);
        }
        break;
      }
      case "openai_api_key": {
        if (url.hostname !== "api.openai.com") {
          return deny(`${url.hostname} is not reachable during the AI review`);
        }
        if (!openaiAllowed(request.method, url.pathname)) {
          return deny(`${request.method} ${url.pathname} is not needed for a review`);
        }
        // The key decides the org and project, not the sandbox.
        headers.delete("openai-organization");
        headers.delete("openai-project");
        headers.set("authorization", `Bearer ${policy.secret}`);
        break;
      }
      case "codex_chatgpt_login":
      case "codex_access_token": {
        // ChatGPT-plan Codex talks to the Codex backend on chatgpt.com, after
        // one account lookup that picks the workspace to route to. An access
        // token is first resolved to its account via whoami. Token refresh
        // (auth.openai.com/oauth) is left to the engine, so it's denied.
        const backend =
          url.hostname === "chatgpt.com" &&
          (url.pathname.startsWith("/backend-api/codex/") ||
            (request.method === "GET" && url.pathname === "/backend-api/wham/accounts/check"));
        const whoami =
          policy.kind === "codex_access_token" &&
          url.hostname === "auth.openai.com" &&
          request.method === "GET" &&
          url.pathname === "/api/accounts/v1/user-auth-credential/whoami";
        if (!backend && !whoami) {
          // Codex falls back to the plain API when whoami rejects the token.
          if (policy.kind === "codex_access_token" && url.hostname === "api.openai.com") {
            return deny("OpenAI did not accept the Codex access token");
          }
          return deny(`${url.hostname}${url.pathname} is not reachable during the AI review`);
        }
        headers.set("authorization", `Bearer ${policy.secret}`);
        if (policy.accountId) headers.set("chatgpt-account-id", policy.accountId);
        break;
      }
      case "cursor_api_key": {
        // Cursor's API lives on *.cursor.sh. Its token endpoints are denied:
        // with the real token swapped in they'd hand a fresh one to the sandbox.
        const host = url.hostname;
        if (host !== "cursor.sh" && !host.endsWith(".cursor.sh")) {
          return deny(`${host} is not reachable during the AI review`);
        }
        if (/^\/(auth|oauth)\//.test(url.pathname)) {
          return deny(`${host}${url.pathname}: token endpoints are handled by the engine`);
        }
        if (!policy.placeholder) return deny("missing Cursor placeholder");
        for (const [name, value] of request.headers) {
          if (value.includes(policy.placeholder)) headers.set(name, value.replaceAll(policy.placeholder, policy.secret));
        }
        break;
      }
      default:
        return deny("unknown credential kind");
    }
    return fetch(new Request(request, { headers }));
  }
}
