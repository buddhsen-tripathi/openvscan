import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
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
  return url.origin === "http://x"
    ? `${url.pathname}${url.search}${url.hash}`
    : null;
}

export const requireSession = createServerFn({ method: "GET" })
  .validator((data: { returnTo?: string } | undefined) => ({
    returnTo: safeRedirect(data?.returnTo),
  }))
  .handler(async ({ data }) => {
    const session = await currentSession();
    if (!session) {
      throw redirect({
        to: "/signin",
        search: data.returnTo ? { redirect: data.returnTo } : {},
      });
    }

    return {
      user: {
        name: session.user.name,
        email: session.user.email,
        image: session.user.image ?? null,
      },
    };
  });
