/**
 * Endpoints the agent may call with the owner's credential swapped in.
 * The agent reads attacker-controlled code, so a prompt injection could make
 * it call anything it can reach and copy the answer into the public review.
 * On the public APIs (`/v1/…`) that means only model calls: no stored files,
 * batches, stored responses, skills or admin endpoints, which hold the
 * owner's other data.
 */
export function anthropicAllowed(method: string, path: string): boolean {
  if (path.startsWith("/v1/")) {
    if (method === "POST") return path === "/v1/messages" || path === "/v1/messages/count_tokens";
    if (method === "GET") return path === "/v1/models" || /^\/v1\/models\/[\w.-]+$/.test(path);
    return false;
  }
  // Claude Code's own account lookups (e.g. the OAuth profile it reads at
  // start): read-only, and nothing that mints or hands out a key or token
  // (POST /api/oauth/claude_cli/create_api_key would turn the OAuth token
  // into an API key the sandbox could read).
  return method === "GET" && path.startsWith("/api/") && !/key|token|secret/i.test(path);
}

export function openaiAllowed(method: string, path: string): boolean {
  // `/v1/responses` itself (POST, or GET to open Codex's WebSocket) creates a
  // response; `/v1/responses/{id}` reads back a stored one, so it's refused.
  if (path === "/v1/responses") return method === "POST" || method === "GET";
  if (path === "/v1/responses/compact") return method === "POST";
  if (path === "/v1/chat/completions") return method === "POST";
  if (method === "GET") return path === "/v1/models" || /^\/v1\/models\/[\w.:-]+$/.test(path);
  return false;
}

/**
 * While scanning: OSV-Scanner's lookups on api.osv.dev, nothing else. The
 * scanners read attacker-controlled files but don't run them, and this host
 * returns public advisories only.
 */
export function scanAllowed(method: string, host: string, path: string): boolean {
  if (host !== "api.osv.dev") return false;
  // determineversion: hashes of the files in a vendored C/C++ library
  // (third_party/zlib, say), to tell which release it is. No code is sent.
  if (method === "POST") {
    return path === "/v1/querybatch" || path === "/v1/query" || path === "/v1experimental/determineversion";
  }
  if (method === "GET") return /^\/v1\/vulns\/[\w.:-]+$/.test(path);
  return false;
}
