# OpenVScan — AI Agent Context Guide

## What it is

OpenVScan is an open-source **security review for GitHub pull requests**. It is
not a general CI system. On each PR it:
1. runs open-source scanners in a Cloudflare container,
2. has a headless coding agent triage the findings and review the diff, using
   the repo owner's own Claude Code or Codex credential,
3. publishes a check run, inline review comments and a sticky summary comment
   to the PR, and shows everything in the dashboard.

It is self-hostable and also offered as a hosted cloud, like PostHog. Scope is
**GitHub PRs only**: the old ad-hoc "projects" feature was removed.

- Repository: https://github.com/Buddhsen-tripathi/openvscan
- License: AGPL-3.0-only

## Architecture (all Cloudflare)

| Part | Path | Responsibility |
|------|------|----------------|
| Web Worker `openvscan-web` | `web/` | TanStack Start UI, Better Auth, server functions, GitHub webhook + install callback, encrypted credential storage. Inserts `run` rows and calls the engine. |
| Engine Worker `openvscan-engine` | `engine/` | `EngineApi` RPC entrypoint, `ReviewWorkflow` (Cloudflare Workflow), `ScanSandbox` (Durable Object + Container), `Outbound` (egress policy proxy). Owns every write to a run after creation. |
| `@openvscan/core` | `packages/core` | Enums (statuses, phases, severities, scanners, credential kinds), severity helpers, agent review zod schema, AES-GCM `sealSecret`/`openSecret`, `EngineRpc` interface. |
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
  → ai:start (decrypt credential, write PROMPT.md + findings, egress = agent,
              start agent as a detached task)
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
- `ai_verdict` is not `false_positive`.

Otherwise the conclusion is **pass**. If `fail_on = "never"` it is always
**neutral**.

### Sandbox egress model (`engine/src/outbound.ts`, `engine/src/sandbox.ts`)

- The container starts with `enableInternet: false`. All HTTP(S) traffic is
  intercepted and handled by `Outbound`, a `WorkerEntrypoint` whose `props`
  carry the current `EgressPolicy`.
- Phases:
  - `locked`: nothing.
  - `checkout`: git-upload-pack for one repo; adds a read-only token scoped to
    that single repo.
  - `scan`: GET to the Trivy DB hosts.
  - `agent`: `api.anthropic.com` or `api.openai.com` only; swaps the
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

### Data model (`packages/db/src/schema`)

- `github.ts`:
  - `github_installation`
  - `repository`: per-repo policy (`auto_review`, `skip_drafts`, `scanners`,
    `agent`, `agent_model`, `instructions`, `fail_on`)
  - `agent_credential`: one per (user, provider). Holds the ciphertext and IV;
    the row id is used as AAD.
- `review.ts`:
  - `pull_request`
  - `run`: status, phase, conclusion, a policy snapshot, AI summary and risk,
    counts, and GitHub ids
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
  Set a placeholder `OPENAI_API_KEY`. Its chatgpt.com calls are denied by
  egress; this is harmless.
- The agent runs with cwd `/workspace/.openvscan`, outside the checkout at
  `/workspace/repo`, so the PR's `CLAUDE.md`, `AGENTS.md`, `.claude/` hooks
  and `.mcp.json` are never loaded.
- The prompt fences PR title, body and file list as untrusted. The agent's only output is
  `/workspace/.openvscan/review.json`, validated against `AgentReviewSchema`.
  Triage verdicts are accepted only for finding ids that were given to the
  agent.

## Key files

| File | Purpose |
|------|---------|
| `web/lib/runs.ts` | `createAndStartRun`, `requestCancel`, cancel helpers |
| `web/lib/server.ts` | overview, runs, rerun/cancel, credentials, profile server fns |
| `web/lib/github-server.ts` | connect/list/configure repositories, manual run |
| `web/src/routes/api/github/webhook.ts` | `pull_request`, `check_run` (re-run), installation events |
| `web/src/routes/api/github/setup.ts` | install callback (`syncInstallation`: personal owner or org admin only; first owner keeps it) |
| `engine/src/workflow.ts` | the pipeline |
| `engine/src/scanners/index.ts` | scanner argv + output parsers (normalize, group, cap 500/scanner) |
| `engine/src/diff.ts` | PR patch → commentable lines, `in_diff`, unified diff for the agent |
| `engine/src/report.ts` | conclusion, check output, annotations, inline comments, summary markdown (sanitized) |
| `engine/src/dev.ts` | `/__dev/scan`, `/__dev/agent`, `/__dev/destroy` (only with `DEV_ROUTES=true`) |
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
- **Secrets, web only:** `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `VITE_APP_URL`, `GITHUB_APP_SLUG`, `GITHUB_WEBHOOK_SECRET`,
  `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.
- **Web email:** `send_email` binding `EMAIL` + var `EMAIL_FROM` (Cloudflare
  Email Service) for verification and password reset. Without it, reset is
  unavailable in production.
- **Engine vars** (`engine/wrangler.jsonc`): `APP_URL`, `SANDBOX_INSTANCE`
  (default `standard-2`), `DEV_ROUTES`.
- **GitHub App:**
  - Permissions: Checks rw, Pull requests rw, Contents r, Metadata r;
    org Members r (org-admin check on install); account Email addresses r.
  - Events: Pull request, Check run, Repository (Installation and Installation repositories are sent automatically).

## Conventions and gotchas

- Do not add scanners or features that need open internet from the container
  without adding an explicit, phase-scoped rule in `Outbound`.
- Anything posted to GitHub goes through `sanitize()` in `report.ts`, which
  strips HTML and comments and neutralizes `@mentions`.
- Workflow steps must be idempotent: they are retried and replayed. Delete
  and re-insert by `run_id` + source. Reuse saved GitHub ids
  (`check_run_id`, `review_id`, `summary_comment_id`).
- Do not include Semgrep registry rules; their license forbids this use.
- The bundled opengrep-rules are LGPL-2.1 with the Commons Clause.
- AI review uses the **repo owner's** credential. Fork PRs therefore spend the
  owner's quota.
