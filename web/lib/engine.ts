import { env } from "cloudflare:workers";
import type { EngineRpc } from "@openvscan/core";

/**
 * Typed handle on the engine Worker's `EngineApi` RPC entrypoint (service
 * binding `ENGINE`). `wrangler types` can only type it as a bare `Service`
 * because the entrypoint lives in another Worker, so we narrow it here.
 */
export function getEngine(): EngineRpc {
  const engine = (env as unknown as { ENGINE?: EngineRpc }).ENGINE;
  if (!engine) {
    throw new Error(
      "ENGINE service binding is missing — deploy/run the openvscan-engine Worker",
    );
  }
  return engine;
}
