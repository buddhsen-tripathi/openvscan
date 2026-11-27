import { createFileRoute } from "@tanstack/react-router";
import { appOrigin, authkitDomain } from "@/lib/auth";

/**
 * OAuth discovery for the MCP endpoint:
 * - /.well-known/oauth-protected-resource[/mcp]: points clients at AuthKit.
 * - /.well-known/oauth-authorization-server: AuthKit's metadata, for
 *   clients that look for it on the resource's own origin.
 */
export const Route = createFileRoute("/.well-known/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const domain = authkitDomain();
        const path = params._splat ?? "";
        if (!domain) return new Response("Not found\n", { status: 404 });
        const headers = {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
          "cache-control": "max-age=300",
        };
        if (
          path === "oauth-protected-resource" ||
          path === "oauth-protected-resource/mcp"
        ) {
          const origin = appOrigin(request);
          return new Response(
            JSON.stringify({
              resource: `${origin}/mcp`,
              authorization_servers: [domain],
              bearer_methods_supported: ["header"],
              resource_name: "OpenVScan",
              resource_documentation: `${origin}/docs/mcp`,
            }),
            { headers },
          );
        }
        if (path === "oauth-authorization-server") {
          const res = await fetch(
            `${domain}/.well-known/oauth-authorization-server`,
          );
          if (!res.ok)
            return new Response("Authorization server metadata unavailable\n", {
              status: 502,
            });
          return new Response(await res.text(), { headers });
        }
        return new Response("Not found\n", { status: 404 });
      },
    },
  },
});
