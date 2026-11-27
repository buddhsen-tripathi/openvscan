import { createFileRoute } from "@tanstack/react-router";
import {
  appOrigin,
  SESSION_COOKIE,
  sessionIdFromCookie,
  signOutUrl,
} from "@/lib/auth";
import { cookie, redirectWith } from "@/lib/http";

/**
 * End the session here and at WorkOS, then come back to the home page.
 * POST only, from the dashboard's sign-out form, and same-origin only, so
 * another site can't sign people out.
 */
export const Route = createFileRoute("/api/auth/signout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = appOrigin(request);
        const from = request.headers.get("origin");
        if (from && from !== new URL(request.url).origin && from !== origin)
          return new Response("Forbidden", { status: 403 });
        const sessionId = await sessionIdFromCookie().catch(() => null);
        const location = sessionId
          ? signOutUrl(sessionId, `${origin}/`)
          : `${origin}/`;
        return redirectWith(location, [
          cookie(SESSION_COOKIE, "", {
            maxAge: 0,
            secure: origin.startsWith("https://"),
          }),
        ]);
      },
    },
  },
});
