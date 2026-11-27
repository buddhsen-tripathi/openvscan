import { AsyncLocalStorage } from "node:async_hooks";
import { currentSession } from "@/lib/auth";

/**
 * Who a server function acts for: the signed-in browser session, or the user
 * an MCP request authenticated as (set with `runAsUser`, only by /mcp after
 * verifying its bearer token).
 */
const actingUser = new AsyncLocalStorage<string>();

export function runAsUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return actingUser.run(userId, fn);
}

export { currentSession };

/** Resolve the signed-in user id, or throw (server functions surface it as an error). */
export async function requireUserId(): Promise<string> {
  const acting = actingUser.getStore();
  if (acting) return acting;
  const session = await currentSession();
  if (!session) throw new Error("Unauthorized");
  return session.userId;
}
