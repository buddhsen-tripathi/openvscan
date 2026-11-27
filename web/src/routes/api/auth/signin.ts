import { createFileRoute } from "@tanstack/react-router";
import { appOrigin, githubAuthorizeUrl, isAuthConfigured } from "@/lib/auth";
import { cookie, nonce, redirectWith } from "@/lib/http";
import { safeRedirect } from "@/src/lib/session";

export const STATE_COOKIE = "ovs_auth_state";

/**
 * Start GitHub sign-in through WorkOS: remember where to return, then
 * redirect. Email and password stay on our own pages (lib/auth-server.ts).
 *   ?redirect=/dashboard/...   page to land on afterwards
 */
export const Route = createFileRoute("/api/auth/signin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (!isAuthConfigured()) {
          return new Response(
            "Sign-in is not configured: set WORKOS_CLIENT_ID and WORKOS_API_KEY.\n",
            { status: 503 },
          );
        }
        const state = nonce();
        const returnTo =
          safeRedirect(url.searchParams.get("redirect")) ?? "/dashboard";
        const origin = appOrigin(request);
        const location = githubAuthorizeUrl({
          redirectUri: `${origin}/api/auth/callback`,
          state,
        });
        return redirectWith(location, [
          cookie(STATE_COOKIE, JSON.stringify({ state, returnTo }), {
            maxAge: 600,
            secure: origin.startsWith("https://"),
          }),
        ]);
      },
    },
  },
});
