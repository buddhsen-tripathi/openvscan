import { createFileRoute } from "@tanstack/react-router";
import { appOrigin, authkitDomain, verifyMcpToken } from "@/lib/auth";
import { handleMcp } from "@/lib/mcp";

/**
 * Remote MCP endpoint (Streamable HTTP, stateless JSON responses). Clients
 * discover AuthKit from /.well-known/oauth-protected-resource, sign the user
 * in, and send the access token as a bearer token.
 */
async function mcp(request: Request): Promise<Response> {
  if (!authkitDomain()) {
    return new Response(
      "MCP is not enabled on this deployment (set WORKOS_AUTHKIT_DOMAIN).\n",
      { status: 404 },
    );
  }
  const origin = appOrigin(request);
  const token = /^Bearer\s+(.+)$/i.exec(
    request.headers.get("authorization") ?? "",
  )?.[1];
  const userId = token ? await verifyMcpToken(token, `${origin}/mcp`) : null;
  if (!userId) {
    return new Response(
      JSON.stringify({
        error: "unauthorized",
        error_description: "Authorization needed",
      }),
      {
        status: 401,
        headers: {
          "content-type": "application/json",
          "www-authenticate": `Bearer error="unauthorized", error_description="Authorization needed", resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
        },
      },
    );
  }
  if (request.method !== "POST") {
    // Stateless server: no server-initiated stream and no session to delete.
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }
  return handleMcp(request, userId);
}

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      POST: ({ request }) => mcp(request),
      GET: ({ request }) => mcp(request),
      DELETE: ({ request }) => mcp(request),
    },
  },
});
