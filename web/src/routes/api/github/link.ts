import { createFileRoute } from "@tanstack/react-router";
import { appOrigin } from "@/lib/auth";
import {
  githubAuthorizeUrl,
  isGithubLinkConfigured,
} from "@/lib/github-account";
import { cookie, nonce, redirectWith } from "@/lib/http";
import { requireUserId } from "@/lib/user";
import { safeRedirect } from "@/src/lib/session";

export const LINK_STATE_COOKIE = "ovs_github_link";

/**
 * Link a GitHub account through the GitHub App's OAuth client, for users who
 * signed in another way. GitHub signs the user in if needed and asks for
 * consent once.
 */
export const Route = createFileRoute("/api/github/link")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = appOrigin(request);
        const returnTo =
          safeRedirect(url.searchParams.get("redirect")) ??
          "/dashboard/settings";
        try {
          await requireUserId();
        } catch {
          const back = encodeURIComponent(url.pathname + url.search);
          return redirectWith(`${origin}/signin?redirect=${back}`);
        }
        if (!isGithubLinkConfigured()) {
          return new Response(
            "GitHub linking is not configured: set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.\n",
            {
              status: 503,
            },
          );
        }
        const state = nonce();
        return redirectWith(
          githubAuthorizeUrl(`${origin}/api/github/link/callback`, state),
          [
            cookie(LINK_STATE_COOKIE, JSON.stringify({ state, returnTo }), {
              maxAge: 600,
              secure: origin.startsWith("https://"),
            }),
          ],
        );
      },
    },
  },
});
