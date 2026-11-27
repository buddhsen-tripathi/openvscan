# Contributing to OpenVScan

Thank you for your interest in contributing to OpenVScan! We welcome contributions from the community and are grateful for your support in making vulnerability scanning more accessible and effective.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Guidelines](#coding-guidelines)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Reporting Issues](#reporting-issues)
- [Community](#community)

## Code of Conduct

This project adheres to a Code of Conduct that all contributors are expected to follow. Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before contributing.

## Getting Started

OpenVScan runs entirely on Cloudflare (Workers, Workflows, Containers, D1, R2). See [AGENTS.MD](AGENTS.MD) for an architecture overview.

### Prerequisites

- **Node.js** (v22.12 or higher)
- **pnpm** (v8 or higher) — install with `npm install -g pnpm`
- **Git**
- A **Cloudflare account** (the Workers Paid plan is required for the review container)
- **Docker** — needed to build/run the engine's container locally

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:

```bash
git clone https://github.com/YOUR-USERNAME/openvscan.git
cd openvscan
```

3. Add the upstream repository:

```bash
git remote add upstream https://github.com/Buddhsen-tripathi/openvscan.git
```

## Development Setup

### 1. Install Dependencies

OpenVScan uses pnpm workspaces for monorepo management:

```bash
pnpm install
```

### 2. Provision Cloudflare Resources

```bash
pnpm --filter openvscan-web exec wrangler login
pnpm --filter openvscan-web exec wrangler d1 create openvscan
pnpm --filter openvscan-web exec wrangler r2 bucket create openvscan-artifacts
```

Copy the printed D1 `database_id` into `web/wrangler.jsonc` and `engine/wrangler.jsonc`.

### 3. Local Secrets

Bindings live in `wrangler.jsonc`. Copy `web/.dev.vars.example` → `web/.dev.vars`
and `engine/.dev.vars.example` → `engine/.dev.vars`, then fill them in. Use the
**same** `CREDENTIALS_KEY` (`openssl rand -base64 32`) in both files.

### 4. Apply the Schema and Start

```bash
pnpm db:migrate:local   # apply migrations to local D1
pnpm dev:web            # web Worker at http://localhost:3000
```

To run reviews locally, start the engine in another terminal (requires Docker). It
shares the web app's local D1/R2 state:

```bash
pnpm dev:engine                                   # or, with the /__dev smoke routes:
pnpm --filter openvscan-engine exec wrangler dev --persist-to ../web/.wrangler/state --var DEV_ROUTES:true
```

## Project Structure

```
openvscan/
├── web/              # TanStack Start app on Cloudflare Workers
│   ├── src/routes/   # dashboard routes, api/auth/$, api/github/{webhook,setup}
│   ├── components/   # auth/, dashboard/, landing/, ui/
│   ├── lib/          # auth, db, server fns (server.ts, github-server.ts), runs.ts, engine.ts
│   └── wrangler.jsonc
├── engine/           # openvscan-engine: EngineApi RPC, ReviewWorkflow, ScanSandbox, Outbound
│   ├── src/          # workflow, sandbox, egress policy, scanners/, diff, report, agent
│   ├── container/    # Dockerfile (Trivy, Opengrep, Gitleaks, Claude Code, Codex) + task scripts
│   └── test/         # vitest + real scanner output fixtures
├── packages/
│   ├── core/         # enums, severity, agent review schema, credential crypto, EngineRpc
│   ├── db/           # Drizzle SQLite schema for D1 + migrations
│   └── github/       # GitHub App helpers (checks, reviews, comments)
└── package.json      # Root scripts
```

## Development Workflow

### Branch Naming Convention

Use descriptive branch names following this pattern:

- `feature/your-feature-name` - New features
- `fix/issue-description` - Bug fixes
- `docs/documentation-update` - Documentation changes
- `refactor/component-name` - Code refactoring
- `test/test-description` - Test additions or updates

### Making Changes

1. **Create a new branch** from `main`:

```bash
git checkout -b feature/your-feature-name
```

2. **Make your changes** following our coding guidelines

3. **Commit your changes** with clear, descriptive messages:

```bash
git commit -m "feat: add additional scanner integration"
```

Use conventional commit messages:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

4. **Keep your branch updated**:

```bash
git fetch upstream
git rebase upstream/main
```

## Coding Guidelines

### TypeScript

- Use **TypeScript** for all new code
- Use **async/await** instead of callbacks or raw promises
- Prefer **functional** patterns where appropriate
- Write **self-documenting code** with clear names

### Web & data access (`web/`)

- Server-side logic lives in **TanStack Start server functions** (`web/lib/server.ts`), not a separate API server
- Every server function must resolve the user with `requireUserId()` and **scope all queries** to that user
- Access D1 through **Drizzle** via `getDb()` (`drizzle-orm/d1`); never hardcode SQL in the web layer
- Use **TanStack Router** file routes in `web/src/routes` and **TanStack Query** hooks (`web/lib/api.ts`) for dashboard state
- Style with **Tailwind CSS** using the **semantic tokens** in `src/styles.css` (`bg-card`, `text-primary`, severity/status tokens) — never hardcode colors
- Build reusable components in `web/components`; type props with interfaces

### Engine (`engine/`)

- Pipeline steps in `workflow.ts` are retried and replayed — keep them **idempotent**
- The container has **no internet**; every new outbound need gets an explicit, phase-scoped rule in `outbound.ts`
- **Never pass secrets into the container** (env, files or DO storage); `Outbound` injects them per request
- Everything posted to GitHub goes through `sanitize()` in `report.ts`
- Scanner parsers are pure functions — add a fixture from real output under `test/fixtures` when you change one

### Code Formatting

OpenVScan uses **Biome** for linting and formatting in `web/`:

```bash
pnpm --filter openvscan-web exec biome check --write .
```

Run `wrangler types` after changing `wrangler.jsonc` bindings to refresh generated types.

## Testing

```bash
pnpm typecheck   # every package
pnpm test        # engine unit tests: scanner parsers, diff mapping, report, crypto
pnpm build       # web Worker builds cleanly (vite + tsc)
```

For workflow-level tests, prefer [`@cloudflare/vitest-pool-workers`](https://developers.cloudflare.com/workers/testing/vitest-integration/) so they run against the Workers runtime with real bindings. Write meaningful tests for business logic and critical user flows, with descriptive names.

## Submitting Changes

### Before Submitting a Pull Request

1. **Verify locally**:

```bash
pnpm typecheck
pnpm test
pnpm build
```

2. **Update documentation** if you've changed behavior or added features

3. **Add tests** where practical

### Creating a Pull Request

1. **Push your branch** to your fork:

```bash
git push origin feature/your-feature-name
```

2. **Create a Pull Request** on GitHub with:
   - **Clear title** describing the change
   - **Detailed description** of what was changed and why
   - **Screenshots or recordings** for UI changes
   - **Reference to related issues** (e.g., "Fixes #123")
   - **Testing instructions** for reviewers

### PR Template

```markdown
## Description
Brief description of the changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Related Issues
Fixes #(issue number)

## How Has This Been Tested?
Description of testing performed

## Screenshots (if applicable)
Add screenshots for UI changes

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review
- [ ] I have commented my code where necessary
- [ ] I have updated the documentation
- [ ] My changes generate no new warnings
- [ ] New and existing checks pass locally
```

### Code Review Process

- All PRs require **at least one approval** from maintainers
- Address all review comments promptly
- Keep PRs **focused and reasonably sized** (< 500 lines when possible)
- Be **responsive to feedback** and willing to iterate

## Reporting Issues

### Bug Reports

When reporting bugs, please include:

- **Clear title** and description
- **Steps to reproduce** the issue
- **Expected behavior** vs actual behavior
- **Environment details** (OS, Node version, browser, etc.)
- **Screenshots or logs** if applicable
- **Possible solution** if you have one

### Feature Requests

When suggesting features, please include:

- **Clear use case** and motivation
- **Proposed solution** or implementation ideas
- **Alternatives considered**
- **Additional context** or examples

## Community

### Getting Help

- **GitHub Discussions** - Ask questions and share ideas
- **GitHub Issues** - Report bugs and request features
- **Pull Requests** - Review and discuss code changes

### Recognition

Contributors will be recognized in:
- Release notes for significant contributions
- The project README

## License

By contributing to OpenVScan, you agree that your contributions will be licensed under the GNU Affero General Public License v3.0 only.

---

Thank you for contributing to OpenVScan! Your efforts help make security testing more accessible to everyone. 🎉
