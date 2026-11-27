import { defineConfig } from "vitest/config";

// Unit tests for the engine's pure logic (parsers, diff mapping, reporting,
// agent output validation). Modules that import `cloudflare:workers` are
// exercised end-to-end with `wrangler dev`, not here.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
