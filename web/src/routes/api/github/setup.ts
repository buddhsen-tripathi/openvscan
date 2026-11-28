import { createFileRoute } from "@tanstack/react-router";
import { InstallationAccessError, syncInstallation } from "@/lib/github";
import { isGithubLinkConfigured } from "@/lib/github-account";
import { requireUserId } from "@/lib/user";

/**
 * GitHub redirects here after the user installs (or reconfigures) the App.
 * We associate the installation with the signed-in user, then send them to
 * the repositories page to connect repos.
 */
export const Route = createFileRoute("/api/github/setup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const installationId = url.searchParams.get("installation_id");

        let userId: string;
        try {
          userId = await requireUserId();
        } catch {
          // Not signed in — bounce through sign-in and come back here.
          const back = encodeURIComponent(url.pathname + url.search);
          return Response.redirect(
            `${url.origin}/signin?redirect=${back}`,
            302,
          );
        }

        if (!installationId) {
          return Response.redirect(
            `${url.origin}/dashboard/repositories?error=missing_installation`,
            302,
          );
        }

        try {
          await syncInstallation(userId, installationId);
        } catch (err) {
          if (!(err instanceof InstallationAccessError)) {
            console.error("GitHub App setup failed", err);
          }
          // Installed before linking GitHub: link now, then come back here
          // once (the marker stops a loop if linking doesn't take).
          if (
            err instanceof InstallationAccessError &&
            err.code === "github_not_linked" &&
            isGithubLinkConfigured() &&
            !url.searchParams.has("linked")
          ) {
            url.searchParams.set("linked", "1");
            const back = encodeURIComponent(url.pathname + url.search);
            return Response.redirect(
              `${url.origin}/api/github/link?redirect=${back}`,
              302,
            );
          }
          const code =
            err instanceof InstallationAccessError ? err.code : "failed";
          return Response.redirect(
            `${url.origin}/dashboard/repositories?error=${code}`,
            302,
          );
        }

        return Response.redirect(
          `${url.origin}/dashboard/repositories?connected=1`,
          302,
        );
      },
    },
  },
});
