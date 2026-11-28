import { describe, expect, it } from "vitest";
import { anthropicAllowed, openaiAllowed, scanAllowed } from "../src/egress-rules";

describe("agent egress endpoints", () => {
  it("lets Claude Code call the model and nothing that holds the owner's data", () => {
    expect(anthropicAllowed("POST", "/v1/messages")).toBe(true);
    expect(anthropicAllowed("POST", "/v1/messages/count_tokens")).toBe(true);
    expect(anthropicAllowed("GET", "/v1/models")).toBe(true);
    expect(anthropicAllowed("GET", "/api/oauth/profile")).toBe(true);

    expect(anthropicAllowed("GET", "/v1/files")).toBe(false);
    expect(anthropicAllowed("GET", "/v1/files/file_1/content")).toBe(false);
    expect(anthropicAllowed("GET", "/v1/messages/batches/b1/results")).toBe(false);
    expect(anthropicAllowed("POST", "/v1/messages/batches")).toBe(false);
    expect(anthropicAllowed("GET", "/v1/organizations/api_keys")).toBe(false);
    expect(anthropicAllowed("DELETE", "/v1/files/file_1")).toBe(false);
    expect(anthropicAllowed("POST", "/api/oauth/claude_cli/create_api_key")).toBe(false);
    expect(anthropicAllowed("GET", "/api/oauth/claude_cli/create_api_key")).toBe(false);
  });

  it("lets Codex create responses but not read stored ones", () => {
    expect(openaiAllowed("POST", "/v1/responses")).toBe(true);
    expect(openaiAllowed("GET", "/v1/responses")).toBe(true); // WebSocket upgrade
    expect(openaiAllowed("POST", "/v1/responses/compact")).toBe(true);
    expect(openaiAllowed("POST", "/v1/chat/completions")).toBe(true);
    expect(openaiAllowed("GET", "/v1/models/gpt-5")).toBe(true);

    expect(openaiAllowed("GET", "/v1/responses/resp_1")).toBe(false);
    expect(openaiAllowed("GET", "/v1/chat/completions")).toBe(false);
    expect(openaiAllowed("GET", "/v1/files/file-1/content")).toBe(false);
    expect(openaiAllowed("GET", "/v1/batches")).toBe(false);
    expect(openaiAllowed("POST", "/v1/fine_tuning/jobs")).toBe(false);
    expect(openaiAllowed("DELETE", "/v1/vector_stores/vs_1")).toBe(false);
  });
});

describe("scan egress", () => {
  it("lets OSV-Scanner query advisories and nothing else", () => {
    expect(scanAllowed("POST", "api.osv.dev", "/v1/querybatch")).toBe(true);
    expect(scanAllowed("GET", "api.osv.dev", "/v1/vulns/GHSA-29mw-wpgm-hmr9")).toBe(true);
    expect(scanAllowed("GET", "api.osv.dev", "/v1/vulns/MAL-2025-1234")).toBe(true);
    expect(scanAllowed("POST", "api.osv.dev", "/v1experimental/determineversion")).toBe(true);
    expect(scanAllowed("POST", "api.osv.dev", "/v1experimental/other")).toBe(false);

    expect(scanAllowed("PUT", "api.osv.dev", "/v1/querybatch")).toBe(false);
    expect(scanAllowed("GET", "api.osv.dev", "/v1/vulns/../../x")).toBe(false);
    expect(scanAllowed("POST", "api.deps.dev", "/v3/query")).toBe(false);
    expect(scanAllowed("GET", "osv.dev.attacker.example", "/v1/vulns/x")).toBe(false);
  });
});
