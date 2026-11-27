import { createFileRoute } from "@tanstack/react-router";
import {
  appOrigin,
  authenticateWithCode,
  logSafe,
  pendingCookieHeader,
  sessionCookieHeader,
  upsertUser,
  WorkosError,
} from "@/lib/auth";
import { linkGithubFromAuth } from "@/lib/github-account";
import { cookie, readCookie, redirectWith, sameString } from "@/lib/http";
import { safeRedirect } from "@/src/lib/session";
import { STATE_COOKIE } from "./signin";

/** WorkOS sends the browser back here (after GitHub) with a one-time code. */
export const Route = createFileRoute("/api/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = appOrigin(request);
        const secure = origin.startsWith("https://");
        const clearState = cookie(STATE_COOKIE, "", { maxAge: 0, secure });
        let saved: { state?: string; returnTo?: string } = {};
        try {
          saved = JSON.parse(readCookie(request, STATE_COOKIE) ?? "{}");
        } catch {}
        // Back to our sign-in page with a reason, keeping the destination.
        const fail = (code: string) => {
          const q = new URLSearchParams({ error: code });
          const returnTo = safeRedirect(saved.returnTo);
          if (returnTo && returnTo !== "/dashboard")
            q.set("redirect", returnTo);
          return redirectWith(`${origin}/signin?${q}`, [clearState]);
        };

        const state = url.searchParams.get("state") ?? "";
        if (!saved.state || !sameString(saved.state, state))
          return fail("state");
        const error = url.searchParams.get("error");
        if (error) {
          if (error === "access_denied") return fail("denied");
          console.warn(
            "Sign-in provider error",
            error,
            url.searchParams.get("error_description")?.slice(0, 300),
          );
          return fail("github");
        }
        const code = url.searchParams.get("code");
        if (!code) return fail("missing_code");

        let auth: Awaited<ReturnType<typeof authenticateWithCode>>;
        try {
          auth = await authenticateWithCode(code, {
            ip: request.headers.get("cf-connecting-ip"),
            userAgent: request.headers.get("user-agent"),
          });
        } catch (err) {
          // WorkOS doesn't take GitHub's word for the email address: the
          // first GitHub sign-in for an unverified email gets a code by
          // email. The sign-in page asks for it (once per account).
          const token =
            err instanceof WorkosError &&
            err.code === "email_verification_required"
              ? err.body.pending_authentication_token
              : null;
          const email = err instanceof WorkosError ? err.body.email : undefined;
          if (typeof token === "string" && typeof email === "string") {
            const q = new URLSearchParams({ verify: "1" });
            const back = safeRedirect(saved.returnTo);
            if (back && back !== "/dashboard") q.set("redirect", back);
            return redirectWith(`${origin}/signin?${q}`, [
              clearState,
              await pendingCookieHeader({
                token,
                email,
                returnTo: back ?? "/dashboard",
              }),
            ]);
          }
          console.error("WorkOS authenticate failed", logSafe(err));
          return fail("signin_failed");
        }
        await upsertUser(auth.user);
        await linkGithubFromAuth(auth);

        const returnTo = safeRedirect(saved.returnTo) ?? "/dashboard";
        return redirectWith(`${origin}${returnTo}`, [
          clearState,
          await sessionCookieHeader({
            accessToken: auth.access_token,
            refreshToken: auth.refresh_token,
          }),
        ]);
      },
    },
  },
});
