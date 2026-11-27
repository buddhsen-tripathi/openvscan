import { createFileRoute } from "@tanstack/react-router";
import { appOrigin } from "@/lib/auth";
import {
  exchangeGithubCode,
  GithubAccountTaken,
  saveGithubAccount,
} from "@/lib/github-account";
import { cookie, readCookie, redirectWith, sameString } from "@/lib/http";
import { requireUserId } from "@/lib/user";
import { safeRedirect } from "@/src/lib/session";
import { LINK_STATE_COOKIE } from "../link";

export const Route = createFileRoute("/api/github/link/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = appOrigin(request);
        const clear = cookie(LINK_STATE_COOKIE, "", {
          maxAge: 0,
          secure: origin.startsWith("https://"),
        });
        let saved: { state?: string; returnTo?: string } = {};
        try {
          saved = JSON.parse(readCookie(request, LINK_STATE_COOKIE) ?? "{}");
        } catch {}
        const returnTo = safeRedirect(saved.returnTo) ?? "/dashboard/settings";
        const back = (result: string) => {
          const target = new URL(returnTo, origin);
          target.searchParams.set("github", result);
          return redirectWith(`${target.pathname}${target.search}`, [clear]);
        };

        let userId: string;
        try {
          userId = await requireUserId();
        } catch {
          return redirectWith(`${origin}/signin`, [clear]);
        }
        const state = url.searchParams.get("state") ?? "";
        if (!saved.state || !sameString(saved.state, state))
          return back("state");
        const code = url.searchParams.get("code");
        if (!code) return back("denied");
        try {
          const tokens = await exchangeGithubCode(
            code,
            `${origin}/api/github/link/callback`,
          );
          await saveGithubAccount(userId, tokens);
        } catch (err) {
          if (err instanceof GithubAccountTaken) return back("taken");
          console.error("GitHub link failed", err);
          return back("failed");
        }
        return back("linked");
      },
    },
  },
});
