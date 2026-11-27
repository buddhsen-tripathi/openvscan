import { getRequestHeaders } from "@tanstack/react-start/server";
import { getAuth } from "@/lib/auth";

/** The current request's session (server only). */
export function currentSession() {
  return getAuth().api.getSession({ headers: getRequestHeaders() });
}

/** Resolve the signed-in user id, or throw (server functions surface it as an error). */
export async function requireUserId(): Promise<string> {
  const session = await currentSession();
  if (!session) throw new Error("Unauthorized");
  return session.user.id;
}
