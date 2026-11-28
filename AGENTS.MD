# OpenVScan — AI Agent Context Guide

## What it is

OpenVScan is an open-source **security review for GitHub pull requests**. It is
not a general CI system. On each PR it:
1. runs open-source scanners in a sandbox (a Cloudflare container, or a
   Daytona sandbox when the deployment has a Daytona key),
2. has a headless coding agent triage the findings and review the diff, using
   the repo owner's own Claude Code, Codex or Cursor credential,
3. publishes a check run, inline review comments and a sticky summary comment
   to the PR, and shows everything in the dashboard.

It is self-hostable and also offered as a hosted cloud, like PostHog. Scope is
**GitHub PRs only**: the old ad-hoc "projects" feature was removed.

- Repository: https://github.com/Buddhsen-tripathi/openvscan
- License: AGPL-3.0-only

## Architecture (all Cloudflare)

| Part | Path | Responsibility |
|------|------|----------------|
| Web Worker `openvscan-web` | `web/` | TanStack Start UI, sign-in pages over the WorkOS API (plain fetch, no SDK), server functions, GitHub account linking, GitHub webhook + install callback, encrypted credential storage, remote MCP server (`/mcp`). Inserts `run` rows and calls the engine. |
| Engine Worker `openvscan-engine` | `engine/` | `EngineApi` RPC entrypoint, `ReviewWorkflow` (Cloudflare Workflow), `ScanSandbox` (Durable Object + Container), `Outbound` (egress policy proxy). Owns every write to a run after creation. |
| `@openvscan/core` | `packages/core` | Enums (statuses, phases, severities, scanners, credential kinds), review policy (`policy.ts`: triggers, models, focus presets, path globs, PR commands), severity helpers, agent review zod schema, AES-GCM `sealSecret`/`openSecret`, Codex `auth.json` parsing (`codex.ts`), review skills (`skills.ts` normalisation/frontmatter/URL rules, `skill-import.ts`, `builtin-skills.ts`), `EngineRpc` interface. |
| `@openvscan/db` | `packages/db` | Drizzle `sqlite-core` schema + D1 migrations (shared by both Workers). |
| `@openvscan/github` | `packages/github` | Octokit App auth, webhook verify, scoped read-only tokens, check runs, reviews, summary comment upsert. Only this package imports octokit. |

All packages are **source-only** (exports point at `src/index.ts`); there is no
package build step.

### Run lifecycle

```
pull_request webhook ─► web: upsert pull_request, dedupe by head sha,
                        cancel superseded runs, insert run (policy snapshot),
                        ENGINE.startRun(runId)
engine ReviewWorkflow (id = runId), each step durable + retried:
  load → github:check-run → github:diff (PR files → R2 diff.json / pr.diff)
  → sandbox:checkout (git fetch head sha, egress = checkout)
  → scan:<trivy|opengrep|gitleaks> (egress = scan; raw → R2; parsed → finding)
  → ai:start (decrypt credential, write PROMPT.md + findings + review
              skills, egress = agent, start agent as a detached task)
  → ai:wait:i / ai:poll:i (sleep 30s, poll, honour cancel)  ×≤50
  → ai:collect (lock egress, validate review.json, apply triage, add AI findings)
    (an AI error → ai:failed: lock egress, record ai_error, keep going)
  → publish (check run + annotations, inline review, summary comment, conclusion)
  → cleanup (destroy sandbox)
  on any error → fail step: run failed, check neutral, sandbox destroyed
```

Cancellation: web sets `run.cancel_requested` and calls
`ENGINE.cancelRun(runId)`. That terminates the workflow instance, destroys the
sandbox and marks the check cancelled. The workflow also re-checks the flag
between phases.

Conclusion (`isBlocking` in `packages/core/src/severity.ts`, shared by the
engine and the dashboard): **fail** when any finding meets all of:
- severity is at or above `run.fail_on`,
- on a PR, it is in the diff (`in_diff`); manual branch runs count everything,
- `ai_verdict` is not `false_positive`, except that the AI can't dismiss a
  Gitleaks secret (`aiMayDismiss`).

Otherwise the conclusion is **pass**, unless a finding would have blocked but
for an AI dismissal (`isOverruled`): then **neutral**, and the summary lists
it. The AI also can't lower a finding's severity across `fail_on`
(`ai:collect`). If `fail_on = "never"` it is always **neutral**.

PRs from authors without write access (`outsiderNote` in the webhook: not
OWNER/MEMBER/COLLABORATOR with push, or a bot) get scanners only, with
`run.ai_skipped` set; a writer's `@<app> review` runs the AI.

### Sandbox egress model (`engine/src/outbound.ts`, `engine/src/sandbox.ts`)

- The container starts with `enableInternet: false`. All HTTP(S) traffic is
  intercepted and handled by `Outbound`, a `WorkerEntrypoint` whose `props`
  carry the current `EgressPolicy`.
- Phases:
  - `locked`: nothing.
  - `checkout`: git-upload-pack for one repo; adds a read-only token scoped to
    that single repo.
  - `scan`: GET to the Trivy DB hosts.
  - `agent`: model calls only (`egress-rules.ts`: no files, batches,
    stored responses or key minting) on `api.anthropic.com`,
    `api.openai.com`, or `chatgpt.com`
    `/backend-api/codex/*` (plus the account lookup and, for access tokens,
    `auth.openai.com` whoami), or `*.cursor.sh` except `/auth` and `/oauth`
    only; swaps the
    placeholder credential for the real one.
- **Never put secrets in the container env or in DO storage.** Policies exist
  only in memory, for the container's lifetime. The agent gets placeholder
  keys.
- The CA for interception is at
  `/etc/cloudflare/certs/cloudflare-containers-ca.crt` (see `TRUST_ENV`).
- Long commands (the agent) run through `container/scripts/task.sh`, which
  detaches the command and returns once its pid file exists, so a launch
  failure throws. `taskState()` reads
  `pid` / `exit-code` / `stdout.log` / `stderr.log` in the task dir.

### Sandbox backends (`engine/src/box.ts`, `engine/src/daytona.ts`)

- The workflow talks to `Box`; `runBoxes(env, runId)` (in `sandbox.ts`)
  returns `{ scan, agent, all }`. `cloudflareBox` wraps the `ScanSandbox`
  stub; `DaytonaBox` drives Daytona's REST + toolbox APIs with `fetch` (no
  SDK).
- Choice (`sandboxConfig`): `SANDBOX_PROVIDER` = `cloudflare` | `daytona`;
  empty means Daytona iff the `DAYTONA_API_KEY` secret is set.
  `DAYTONA_MODE`:
  - `hybrid` (default, any Daytona tier): checkout + scanners on Daytona, AI
    step on Cloudflare (`scan` and `agent` boxes differ; the Daytona sandbox
    is destroyed in `scan:stats`). No secrets on Daytona; network is the
    tier's fixed allowlist, `setEgress` is a no-op and throws for `agent`.
  - `full` (Tier 3+): everything on Daytona. `setEgress` maps phases to
    `network-settings` (`networkFor`); the credential becomes a per-run
    Daytona secret (`credentialStandIn`: `splitCredential` keeps only a key
    prefix or JWT header+claims visible), attached for the agent step and
    deleted by `lockEgress`. Sandboxes are created with an inert secret so
    attaching later needs no restart.
- Daytona checkout is a codeload tarball URL from `repoTarballUrl` (no token
  in the sandbox, no `.git`). Checkout writes `CHECKOUT_MARKER`;
  `ensureRepo` re-checks out when it is missing.
- Daytona commands go through `process/execute` as base64 (`wrapCommand`);
  anything over 60s runs detached via `task.sh` and is polled.
- Snapshot: `engine/scripts/daytona-snapshot.sh` (same Dockerfile). Docs:
  `web/content/docs/daytona.mdx`.

### Auth and MCP (`web/lib/auth.ts`, `web/lib/github-account.ts`, `web/lib/mcp.ts`)

- Sign-in pages are ours (`components/auth/AuthShell.tsx`): `/signin`,
  `/signup`, `/forgot-password`, `/reset-password?token=`. Server fns in
  `web/lib/auth-server.ts` call WorkOS's password grant, user create,
  email-verification code grant and password reset; results are returned
  (not thrown) as `{ok, redirect} | {error} | {verify, email}`. On
  `email_verification_required` the pending token goes in the sealed
  `ovs_pending` cookie (10 min) and the page shows a code step. Rate limits:
  `AUTH_IP_LIMITER` (20/min) and `AUTH_EMAIL_LIMITER` (5/min) bindings.
  Forgot password always reports success. The WorkOS env's Password reset URL
  must be `<origin>/reset-password`.
- GitHub sign-in: `/api/auth/signin?redirect=` → WorkOS
  `user_management/authorize` → `/api/auth/callback` (state cookie, code
  exchange, `upsertUser`); failures go to `/signin?error=<code>`. Sign-out
  is POST `/api/auth/signout` → WorkOS logout, `return_to` = origin.
- Session: cookie `ovs_session` = WorkOS access + refresh token, sealed with
  `CREDENTIALS_KEY`. Access JWT (~5 min) verified against WorkOS JWKS per
  request, refreshed when expired. No session table. Sessions list/revoke,
  profile update and account delete (needs `auth_time` within 24h) call the
  WorkOS API (`web/lib/account-server.ts`).
- Redirect URIs use `VITE_APP_URL` in production and the request origin in
  dev (`appOrigin`), so dev is pinned to port 3000.
- GitHub link is separate from sign-in: the GitHub App's own OAuth client,
  `/api/github/link` → `/api/github/link/callback`. GitHub App user tokens
  (8h, refreshed) are sealed in `github_account`; `verifyInstallationAdmin`
  (`web/lib/github.ts`) uses them. Signing in with GitHub links it too when
  WorkOS's GitHub connection uses the App's client and returns OAuth tokens.
- MCP: POST `/mcp` (Streamable HTTP, stateless JSON). Off (404) without
  `WORKOS_AUTHKIT_DOMAIN`. Bearer JWT verified against
  `<authkit>/oauth2/jwks`, issuer = AuthKit domain, audience = `<origin>/mcp` or
  `WORKOS_CLIENT_ID` (AuthKit's default without a resource indicator);
  `sub_profile: ai_agent` is refused. 401 points at
  `/.well-known/oauth-protected-resource` (`web/src/routes/[.]well-known/$.ts`,
  which also proxies AuthKit's `oauth-authorization-server`). Tools run as
  the user via `runAsUser` and the same server fns as the dashboard.
  Docs: `web/content/docs/mcp.mdx`.

### Data model (`packages/db/src/schema`)

- `auth.ts`:
  - `user`: `id` is the WorkOS user id; mirrors the WorkOS profile.
  - `github_account`: one per user and per GitHub id. Sealed
    `{ accessToken, refreshToken }`, AAD = row id, plus `expires_at`.
- `github.ts`:
  - `github_installation`
  - `repository`: per-repo policy (`review_trigger`, `skip_drafts`,
    `base_branches`, `ignore_paths`, `focus`, `skills`, `scanners`,
    `agent`, `agent_model`, `instructions`, `fail_on`). `skills` is a JSON
    array of skill ids in selection order: the owner's `review_skill` ids
    or `builtin:<slug>`.
  - `agent_credential`: one per (user, provider). Holds the ciphertext and IV;
    the row id is used as AAD.
- `skills.ts`:
  - `review_skill`: one user's skill (`name` unique per user,
    `description`, `body` without frontmatter, `source` paste/upload/url,
    `source_url`, `sha256` of the body). A normalised snapshot: imports are
    never re-fetched. Deleting one removes its id from the user's
    repositories (`deleteSkill`).
- `review.ts`:
  - `pull_request`: `paused` is set by the `pause` comment command
  - `run`: status, phase, conclusion, a policy snapshot (including
    `skills`), AI summary and risk, counts, and GitHub ids
  - `finding`: `source` is a scanner or `ai`. Also `in_diff`, `fingerprint`,
    `ai_verdict` and `ai_reasoning`.
  - `run_log`
- `integer({ mode: "timestamp" })` stores epoch **seconds**.
- D1 allows 100 bound params per statement, so multi-row inserts and large
  `IN` lists are chunked (`chunk()` from `@openvscan/db`; `batchAll()` in
  `engine/src/db.ts` runs statements in batches of 50).
- `finding.commented` marks findings posted as inline comments; later runs on
  the same PR skip those fingerprints.

### Agents (`engine/src/agent.ts`)

- **Claude Code:**
  ```
  claude --print --output-format stream-json --verbose \
    --dangerously-skip-permissions --no-session-persistence
  ```
  Set `IS_SANDBOX=1`, plus a placeholder `CLAUDE_CODE_OAUTH_TOKEN` or
  `ANTHROPIC_API_KEY`.
- **Codex:**
  ```
  codex exec --json --ephemeral --skip-git-repo-check \
    --dangerously-bypass-approvals-and-sandbox
  ```
  `CODEX_HOME=/workspace/.codex`, plus a placeholder `OPENAI_API_KEY`
  (API key), `CODEX_ACCESS_TOKEN=at-…` (Business/Enterprise) or a
  placeholder `auth.json` (ChatGPT login: unsigned JWTs with a far-future
  exp, so Codex never refreshes). `engine/src/codex.ts` refreshes the real
  ChatGPT login before the agent starts and saves the rotated tokens with
  compare-and-swap on the ciphertext (refresh tokens are single-use).
- **Cursor:**
  ```
  cursor-agent --print --output-format stream-json --force \
    --sandbox disabled --trust --workspace /workspace/.openvscan
  ```
  The CLI would trade `CURSOR_API_KEY` for live access and refresh tokens,
  so `engine/src/cursor.ts` does the trade per run and the sandbox gets an
  unsigned placeholder `CURSOR_AUTH_TOKEN` (far-future exp). `Outbound`
  replaces it wherever it appears in a request header.
- The agent runs with cwd `/workspace/.openvscan`, outside the checkout at
  `/workspace/repo`, so the PR's `CLAUDE.md`, `AGENTS.md`, `.claude/` hooks
  and `.mcp.json` are never loaded.
- Review skills (`web/content/docs/review-skills.mdx`): at `ai:start`
  `loadRunSkills` (workflow.ts) loads the run's `skills` snapshot, built-ins
  from core and user skills by id AND repository owner, keeps them within
  `SKILL_LIMITS.runBudget` (120 KB, selection order) and logs loaded,
  skipped and missing ones. `planSkillFiles` (agent.ts) writes
  `/workspace/.openvscan/skills/<slug>/SKILL.md`, plus
  `.claude/skills/<slug>/SKILL.md` for Claude Code's native loading, and
  PROMPT.md gets a "Review skills (trusted, from the repository owner)"
  section. Skill text is normalised on save (`normalizeSkill`: invisible,
  bidi and tag characters stripped, CRLF, caps). URL import
  (`previewSkillUrl` → `importSkillFromUrl`) is server-side: https,
  allowlisted hosts (GitHub, raw, gists, skills.sh), manual redirects to
  allowlisted hosts only, 10s, 64 KB, text only; skills.sh pages map to the
  repo's SKILL.md with that frontmatter name.
- The prompt fences PR title, body and file list as untrusted. The agent's only output is
  `/workspace/.openvscan/review.json`, validated against `AgentReviewSchema`.
  Triage verdicts are accepted only for finding ids that were given to the
  agent.

## Key files

| File | Purpose |
|------|---------|
| `web/lib/auth.ts` | WorkOS API, authorize URL, session cookie seal/verify/refresh, MCP token verify |
| `web/lib/github-account.ts` | GitHub link: OAuth code exchange, sealed token storage and refresh |
| `web/lib/mcp.ts` | MCP server and its tools |
| `web/lib/runs.ts` | `createAndStartRun`, `requestCancel`, cancel helpers |
| `web/lib/server.ts` | overview, runs, rerun/cancel, credentials server fns |
| `web/lib/account-server.ts` | account page: profile, GitHub link/unlink, WorkOS sessions, delete account |
| `web/lib/github-server.ts` | connect/list/configure repositories, manual run |
| `web/lib/skills-server.ts` | review skills: list/get/save/delete, URL preview, repository selection checks |
| `web/src/routes/api/github/webhook.ts` | `pull_request` (per-repo `review_trigger`), `issue_comment` (`@<app> review/pause/resume/help`, write access only), `check_run` (re-run), installation events |
| `web/src/routes/api/github/setup.ts` | install callback (`syncInstallation`: personal owner or org admin only; first owner keeps it) |
| `engine/src/workflow.ts` | the pipeline |
| `engine/src/scanners/index.ts` | scanner argv + output parsers (normalize, group, cap 500/scanner) |
| `engine/src/diff.ts` | PR patch → commentable lines, `in_diff`, unified diff for the agent |
| `engine/src/report.ts` | conclusion, check output, annotations, inline comments, summary markdown (sanitized) |
| `engine/src/dev.ts` | `/__dev/scan`, `/__dev/agent`, `/__dev/daytona`, `/__dev/destroy` (only with `DEV_ROUTES=true`) |
| `engine/container/Dockerfile` | scanners + agents image (Trivy DB baked in) |

## Commands

```bash
pnpm install
pnpm typecheck            # all packages
pnpm test                 # engine vitest
pnpm lint                 # biome (web)
pnpm db:generate          # drizzle-kit → packages/db/migrations
pnpm db:migrate:local     # apply to local D1 (web/.wrangler/state, shared with engine dev)
pnpm dev:engine           # wrangler dev, needs Docker; add --var DEV_ROUTES:true for /__dev
pnpm dev:web              # vite + cloudflare plugin
pnpm run deploy           # engine, then web (`pnpm deploy` alone is a pnpm built-in)
```

## Configuration

- **Secrets, both Workers:** `CREDENTIALS_KEY` must be identical in both (32
  random bytes, base64). Both also need `GITHUB_APP_ID` and
  `GITHUB_APP_PRIVATE_KEY`.
  On the web Worker `CREDENTIALS_KEY` also seals the session cookie and
  `github_account` tokens; rotating it signs everyone out.
- **Secrets, web only:** `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `GITHUB_APP_SLUG`,
  `GITHUB_WEBHOOK_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.
- **Web vars** (`web/wrangler.jsonc`): `VITE_APP_URL` (public origin),
  `WORKOS_AUTHKIT_DOMAIN` (MCP only; empty turns `/mcp`
  off).
- **WorkOS dashboard** (per application, Redirects tab): redirect URI
  `<origin>/api/auth/callback`, default Sign-out URI `<origin>/`, Password
  reset URL `<origin>/reset-password`, Initiate login URI `<origin>/signin`.
  Only redirect URIs have a REST API; the rest are dashboard settings. Email
  verification is always on in WorkOS (GitHub sign-ins included), so the
  callback hands `email_verification_required` to the `/signin?verify=1`
  code step; for MCP, CIMD and/or DCR enabled (`<origin>/mcp` as a
  resource indicator is optional). Migration `0006_workos_auth` deleted all users
  (fresh start).
- **Engine vars** (`engine/wrangler.jsonc`): `APP_URL`, `SANDBOX_INSTANCE`
  (default `standard-2`), `DEV_ROUTES`, `SANDBOX_PROVIDER`, `DAYTONA_MODE`,
  `DAYTONA_SNAPSHOT`, `DAYTONA_API_URL`, `DAYTONA_TARGET`. Optional secret
  `DAYTONA_API_KEY` (typed in `engine/src/env.d.ts`).
- **GitHub App:**
  - Permissions: Checks rw, Pull requests rw, Contents r, Issues r (for the
    Issue comment event), Metadata r;
    org Members r (org-admin check on install); account Email addresses r
    (WorkOS reads it on GitHub sign-in).
  - Callback URLs: `<origin>/api/github/link/callback`, plus WorkOS's GitHub
    redirect URI when GitHub sign-in uses the App's client.
  - Events: Pull request, Issue comment, Check run, Repository (Installation and Installation repositories are sent automatically).

## Conventions and gotchas

- Do not add scanners or features that need open internet from the container
  without adding an explicit, phase-scoped rule in `Outbound`.
- Anything posted to GitHub goes through `sanitize()` in `report.ts`, which
  strips HTML and comments, neutralizes `@mentions`, escapes `[`/`]` (no
  images or links: GitHub fetches image URLs, which would leak private code)
  and breaks bare URLs and `#123` / `owner/repo#123` references.
- Workflow steps must be idempotent: they are retried and replayed. Delete
  and re-insert by `run_id` + source. Reuse saved GitHub ids
  (`check_run_id`, `review_id`, `summary_comment_id`).
- Do not include Semgrep registry rules; their license forbids this use.
- The bundled opengrep-rules are LGPL-2.1 with the Commons Clause.
- AI review uses the **repo owner's** credential. So it starts on its own
  only for PR authors with write access; anyone else's PR (forks, bots) gets
  scanners only until a writer comments `@<app> review`.
