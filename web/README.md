# OpenVScan Web

The `openvscan-web` Worker: the dashboard, home and docs pages, sign-in,
the GitHub webhook and install callback, encrypted agent credential storage and
the MCP server. It is a TanStack Start app (React 19, TanStack Router and
Query, Tailwind CSS) deployed to Cloudflare Workers. It creates `run` rows and
hands them to the engine Worker over the `ENGINE` service binding.

Sign-in uses our own pages over WorkOS's HTTP API (no SDK), rate limited by
the `AUTH_IP_LIMITER` and `AUTH_EMAIL_LIMITER` bindings. The
session is one `httpOnly` cookie, `ovs_session`, holding the WorkOS tokens
sealed with `CREDENTIALS_KEY`.

## Getting started

From the repository root:

```bash
cp web/.dev.vars.example web/.dev.vars   # then fill it in
pnpm db:migrate:local
pnpm dev:web
```

Open [http://localhost:3000](http://localhost:3000). The port is pinned so the
WorkOS redirect URI `http://localhost:3000/api/auth/callback` matches.

`web/.dev.vars` needs at least `WORKOS_CLIENT_ID` and `WORKOS_API_KEY` (a WorkOS
staging environment), `CREDENTIALS_KEY` and `VITE_APP_URL=http://localhost:3000`.
See `web/content/docs/local-development.mdx` for the GitHub App values and the
rest.

## Layout

| Path | Contents |
|------|----------|
| `src/routes` | Pages and server routes (`api/auth/*`, `api/github/*`, `mcp.ts`, `[.]well-known/$.ts`) |
| `lib` | Server functions and helpers: `auth.ts` (WorkOS), `github-account.ts`, `mcp.ts`, `server.ts`, `runs.ts` |
| `components` | Shared UI, dashboard and docs components |
| `content/docs` | Documentation pages (MDX), registered in `components/docs/pages.ts` |

## Commands

```bash
pnpm dev        # Vite dev server on :3000
pnpm build      # Vite build + TypeScript check
pnpm preview    # Vite preview
pnpm deploy     # Build and deploy with Wrangler
pnpm cf-typegen # Generate Cloudflare Worker env types
pnpm lint       # Biome
```

Deployment is configured in `wrangler.jsonc`. Deploy the engine Worker first.
