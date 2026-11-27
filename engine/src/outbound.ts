import type { CredentialKind } from "@openvscan/core";
import { WorkerEntrypoint } from "cloudflare:workers";

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
      secret: string;
    };

/** Hosts Trivy fetches its vulnerability DB from (OCI artifacts, GET only). */
const TRIVY_DB_HOSTS = new Set([
  "mirror.gcr.io",
  "ghcr.io",
  "pkg-containers.githubusercontent.com",
]);

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
        if (TRIVY_DB_HOSTS.has(url.hostname) && (request.method === "GET" || request.method === "HEAD")) {
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
        headers.set("authorization", `Bearer ${policy.secret}`);
        break;
      }
      default:
        return deny("unknown credential kind");
    }
    return fetch(new Request(request, { headers }));
  }
}
