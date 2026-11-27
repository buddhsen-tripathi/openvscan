import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { currentSession } from "@/lib/user";

/** Whether the request is signed in. Never returns the session itself. */
export const isSignedIn = createServerFn({ method: "GET" }).handler(async () =>
  Boolean(await currentSession()),
);

/**
 * A same-origin path to return to after signing in, or null. Rejects
 * absolute and protocol-relative URLs, backslashes and control characters
 * so `?redirect=` can't send users to another site.
 */
export function safeRedirect(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1000) return null;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
  if (!value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value))
    return null;
  const url = new URL(value, "http://x");
  if (url.origin !== "http://x") return null;
  const path = `${url.pathname}${url.search}${url.hash}`;
  // "/..//evil.com" normalizes to "//evil.com", another host.
  return path.startsWith("//") ? null : path;
}

export const requireSession = createServerFn({ method: "GET" })
  .validator((data: { returnTo?: string } | undefined) => ({
    returnTo: safeRedirect(data?.returnTo),
  }))
  .handler(async ({ data }) => {
    const session = await currentSession();
    const user = session
      ? await getDb().query.user.findFirst({
          where: eq(schema.user.id, session.userId),
        })
      : null;
    if (!user) {
      throw redirect({
        to: "/signin",
        search: data.returnTo ? { redirect: data.returnTo } : {},
      });
    }

    return {
      user: {
        name: user.name,
        email: user.email,
        image: user.image ?? null,
      },
    };
  });
