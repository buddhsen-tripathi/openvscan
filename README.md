# OpenVScan

Open-source security review for GitHub pull requests. On every PR, OpenVScan
checks out the code in an isolated container, runs open-source scanners
(Trivy, Opengrep, Gitleaks), then has a coding agent (Claude Code, Codex or Cursor,
running on **your own** subscription or API key) triage those findings and
review the diff. Results land on the PR as a check run, inline review comments
and a summary comment, and in the dashboard.

It runs on Cloudflare: Workers, Workflows, Containers, D1 and R2. Sandboxes
can run on your own [Daytona](https://www.daytona.io) account instead of
Cloudflare Containers. Self-host it on your own account, or use the hosted
version.

## What a review does

1. A PR is opened or pushed to. The GitHub App webhook reaches the web Worker,
   which records a `run` and hands it to the engine.
2. The engine's **Workflow** opens an "OpenVScan Security Review" check run,
   fetches the PR diff, and starts a **sandbox container** for the run.
3. The container clones the PR head and runs the scanners you enabled:

   | Scanner | Finds |
   |---------|-------|
   | [Trivy](https://github.com/aquasecurity/trivy) | Vulnerable dependencies, IaC misconfigurations |
   | [Opengrep](https://github.com/opengrep/opengrep) + [opengrep-rules](https://github.com/opengrep/opengrep-rules) | Code-level issues: injection, XSS, SSRF, path traversal… |
   | [Gitleaks](https://github.com/gitleaks/gitleaks) | Hard-coded secrets (redacted, never stored) |

4. If an agent is configured, it reads the diff and the scanner findings. It
   marks each finding as confirmed, false positive or needs review, and adds
   issues the scanners missed.
5. The engine publishes the results:
   - The check run concludes pass, fail or neutral, with annotations.
   - Inline comments are posted on changed lines, with suggested fixes where
     the agent gave an exact one.
   - A single summary comment is posted and kept up to date.

A run **fails** only for a finding that meets all three conditions:
- it is at or above the repository's `fail on` severity,
- it is in the lines the PR changed,
- the agent did not mark it a false positive.

Pre-existing issues elsewhere in the repo are reported but never block a PR.

## Architecture

```
GitHub ──webhook──► web Worker (TanStack Start)          D1: users, repos, PRs, runs, findings
                     ├─ dashboard, WorkOS sign-in, MCP     R2: raw scanner output, diffs
                     └─ ENGINE.startRun(runId)  ──RPC──► engine Worker
                                                          └─ ReviewWorkflow (durable steps)
                                                              └─ ScanSandbox (Durable Object + Container)
                                                                   └─ all egress ─► Outbound (policy proxy)
```

| Part | Path | Notes |
|------|------|-------|
| Web Worker | `web/` | UI, sign-in (WorkOS AuthKit), GitHub webhook and install callback, credential storage, MCP server at `/mcp`. Calls the engine over a service binding. |
| Engine Worker | `engine/` | `EngineApi` (RPC), `ReviewWorkflow`, `ScanSandbox` container, `Outbound` egress proxy. |
| Container image | `engine/container/` | Debian + Trivy (DB baked in), Opengrep and its rules, Gitleaks, Claude Code, Codex, Cursor CLI. |
| Shared | `packages/core`, `packages/db`, `packages/github` | Enums, zod schemas, crypto; Drizzle schema and migrations; GitHub App helpers (check runs, reviews, comments). |

### Sandbox security model

The agent reads attacker-controlled input: the PR's code, its description and
its comments. The design assumes a prompt injection will eventually succeed,
and limits what a compromised agent can do:

- The container starts with **no internet access**. Every HTTP(S) request is
  intercepted by the `Outbound` Worker entrypoint, which allows traffic per
  phase. Each phase allows only the hosts listed here:

  | Phase | Allowed |
  |-------|---------|
  | checkout | `git fetch` of the one repository under review |
  | scan | GET from the Trivy DB mirrors |
  | agent | `api.anthropic.com`, `api.openai.com`, the Codex backend on `chatgpt.com`, or `*.cursor.sh` only |
  | otherwise | nothing |

- **Secrets never enter the container.**
  - The container holds placeholder credentials; `Outbound` adds the real
    GitHub token or model key to the outgoing request.
  - The GitHub token used for checkout is read-only and scoped to the single
    repository.
  - The agent runs with no GitHub token at all.
- The agent runs outside the checkout, so the repository's own agent config
  (`CLAUDE.md`, `AGENTS.md`, `.claude/` hooks, `.mcp.json`) is never loaded.
  Gitleaks runs with its pinned default config, not the repository's.
- The agent can only write a JSON report. The engine validates it with zod
  and posts it; the agent has no route to GitHub.
- PR text is placed in the prompt inside a delimited block marked as
  untrusted, and is sanitized again before anything is posted back to GitHub.

### Agent credentials (bring your own)

In **Settings → AI agents**, each user saves one of these:

| Credential | Agent | How to get it |
|------------|-------|---------------|
| Claude subscription token | Claude Code | `claude setup-token` |
| Anthropic API key | Claude Code | console.anthropic.com |
| ChatGPT login | Codex | `codex login --device-auth`, paste `auth.json` |
| Codex access token | Codex | ChatGPT Business/Enterprise admin |
| OpenAI API key | Codex | platform.openai.com |
| Cursor API key | Cursor | Cursor Dashboard → API Keys (bills your Cursor plan) |

Credentials are encrypted at rest with AES-256-GCM using `CREDENTIALS_KEY`, and
the row id is bound in as additional data. Only the engine decrypts them, at
the moment a review starts. A repository's reviews use its owner's credential.

> **Hosted deployments:** check your model provider's terms before letting
> users connect *subscription* tokens to a service you operate. API keys are
> the safe default for a multi-tenant cloud. Self-hosters using their own
> subscription for their own repositories are the intended case.

## Self-hosting

Requires the Workers Paid plan ($5/mo) for Containers. Docker is needed
locally to build the container image.

### 1. Provision

```bash
git clone https://github.com/Buddhsen-tripathi/openvscan.git
cd openvscan && pnpm install

pnpm --filter openvscan-web exec wrangler login
pnpm --filter openvscan-web exec wrangler d1 create openvscan
pnpm --filter openvscan-web exec wrangler r2 bucket create openvscan-artifacts
# Put the D1 database_id in web/wrangler.jsonc and engine/wrangler.jsonc
```

### 2. Register a GitHub App

Go to GitHub → Settings → Developer settings → GitHub Apps → New.

| Setting | Value |
|---------|-------|
| Webhook URL | `https://<web-origin>/api/github/webhook` |
| Setup URL | `https://<web-origin>/api/github/setup` (enable "Redirect on update") |
| Webhook secret | random string → `GITHUB_WEBHOOK_SECRET` |
| Repository permissions | **Checks**: read & write · **Pull requests**: read & write · **Contents**: read · **Issues**: read · **Metadata**: read |
| Organization permissions | **Members**: read (lets org admins connect an org installation) |
| Account permissions | **Email addresses**: read (WorkOS reads it on GitHub sign-in) |
| Events | **Pull request**, **Issue comment**, **Check run**, **Repository** (installation events are sent automatically) |

Generate a private key (`.pem`) and a client secret. Users link their GitHub
account through the App's own OAuth client, which is how OpenVScan verifies
who may connect an installation, so set its callback URL to
`https://<web-origin>/api/github/link/callback`. If users sign in with GitHub
through WorkOS, give WorkOS's GitHub connection this App's client ID/secret,
enable "Return GitHub OAuth tokens", and add the WorkOS GitHub redirect URI as
a second callback URL; GitHub is then linked at sign-in.

### 3. Set up WorkOS AuthKit

Sign-in uses OpenVScan's own pages on top of WorkOS user management (WorkOS
keeps the passwords and sends the verification and reset emails; OpenVScan
sends no email). In the WorkOS dashboard:

- add `https://<web-origin>/api/auth/callback` as a redirect URI and
  `https://<web-origin>/` as the default Sign-out URI, and
  `https://<web-origin>/signin` as the Initiate login URI,
- enable Email + Password with email verification, and set the Password reset
  URL to `https://<web-origin>/reset-password`,
- for the MCP server: enable CIMD and/or DCR for MCP clients (adding
  `https://<web-origin>/mcp` as a resource indicator is optional).

Set the client ID as the `WORKOS_CLIENT_ID` secret and, for MCP, the AuthKit
domain in the `WORKOS_AUTHKIT_DOMAIN` var in `web/wrangler.jsonc`.

### 4. Secrets

Generate one encryption key and give the **same value** to both Workers:

```bash
openssl rand -base64 32
```

| Worker | Secrets |
|--------|---------|
| web (`openvscan-web`) | `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `CREDENTIALS_KEY`, `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (and set the `VITE_APP_URL` and `WORKOS_AUTHKIT_DOMAIN` vars in `web/wrangler.jsonc`) |
| engine (`openvscan-engine`) | `CREDENTIALS_KEY`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (and set the `APP_URL` var in `engine/wrangler.jsonc`) |

```bash
pnpm --filter openvscan-engine exec wrangler secret put CREDENTIALS_KEY
pnpm --filter openvscan-web exec wrangler secret put CREDENTIALS_KEY
# …and the rest from the table
```

`CREDENTIALS_KEY` also seals the session cookie and linked GitHub tokens, so
rotating it signs everyone out.

### 5. Deploy

```bash
pnpm db:migrate   # apply D1 migrations (remote)
pnpm run deploy   # engine first (builds + pushes the image), then web
```

The web Worker's `ENGINE` service binding requires the engine to exist, so
deploy the engine first.

> **Upgrading from Better Auth:** migration `0006_workos_auth` deletes every
> user (and, by cascade, their installations, repositories, reviews and
> credentials) and drops the old auth tables. Everyone signs up again through
> WorkOS. See [Upgrading](https://openvscan.com/docs/upgrading).

> **Upgrading from the old scanner (pre-PR-review versions):** migration
> `0002_pr_review_pipeline` drops the old `project`, `scan`, `finding` and
> `scan_log` tables (connected repositories are kept). Export anything you
> need first. The old `openvscan-scanner` Worker and `openvscan-scans` queue
> are no longer used and can be deleted.

## Development

```bash
cp web/.dev.vars.example web/.dev.vars          # same CREDENTIALS_KEY in both; WorkOS staging keys
cp engine/.dev.vars.example engine/.dev.vars
pnpm db:migrate:local
pnpm dev:engine      # http://localhost:8787 (needs Docker)
pnpm dev:web         # http://localhost:3000, binds to the local engine
```

Both Workers share the local D1/R2 state in `web/.wrangler/state`. Sign-in
needs `WORKOS_CLIENT_ID` and `WORKOS_API_KEY` from a WorkOS staging environment
in `web/.dev.vars`, with `http://localhost:3000/api/auth/callback` registered
as a redirect URI there.

To receive real webhooks locally, expose port 3000 with a tunnel such as
`cloudflared tunnel --url http://localhost:3000` and point the App's webhook
URL at it.

The engine has dev-only routes for exercising the sandbox without GitHub.
They are enabled with `--var DEV_ROUTES:true`:

```bash
# clone a public repo through the egress proxy and run every scanner
curl -X POST localhost:8787/__dev/scan  -d '{"repo":"OWASP/NodeGoat"}'
# start an agent with a credential and report how it exited
curl -X POST localhost:8787/__dev/agent -d '{"kind":"anthropic_api_key","secret":"sk-ant-…"}'
```

| Command | |
|---------|--|
| `pnpm typecheck` | all packages |
| `pnpm test` | engine unit tests (scanner parsers, diff mapping, report, crypto) |
| `pnpm lint` | Biome (web) |
| `pnpm db:generate` | Drizzle migration from schema changes |

## Use it from your coding agent

OpenVScan is also an MCP server (Streamable HTTP, OAuth through AuthKit). Your
agent can list reviews, read findings and fixes, start or re-run reviews and
change repository settings, as you:

```bash
claude mcp add --transport http openvscan https://openvscan.com/mcp
codex mcp add openvscan --url https://openvscan.com/mcp && codex mcp login openvscan
```

Self-hosted deployments use `https://<web-origin>/mcp`. See
[MCP server](https://openvscan.com/docs/mcp).

## Licensing notes

OpenVScan is AGPL-3.0-only. The container bundles third-party tools under
their own licenses: Trivy (Apache-2.0), Gitleaks (MIT), Opengrep
(LGPL-2.1), and Claude Code, Codex and the Cursor CLI (under their vendors' terms).

The bundled rules have their own terms:
- **opengrep-rules** is LGPL-2.1 with the Commons Clause. Review that before
  selling a hosted service built on it.
- **Semgrep's registry rules** do not permit this kind of use, so they are
  not included.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and
[AGENTS.MD](AGENTS.MD) for architecture notes.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](LICENSE).

---

**Made by [Buddhsen Tripathi](https://github.com/Buddhsen-tripathi)** · [Open an issue](https://github.com/Buddhsen-tripathi/openvscan/issues)
