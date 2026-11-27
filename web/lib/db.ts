import { env } from "cloudflare:workers";
import * as schema from "@openvscan/db";
import { drizzle } from "drizzle-orm/d1";

/** Drizzle client bound to the D1 binding, with full schema + relations. */
export function getDb() {
  return drizzle(env.DB, { schema });
}

export { schema };
