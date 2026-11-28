/** Lifecycle of a review run (one execution of the pipeline for a commit). */
export const RUN_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** Statuses of a run that hasn't finished yet. */
export const ACTIVE_RUN_STATUSES = ["queued", "running"] as const;

export function isActiveRun(status: string): boolean {
  return (ACTIVE_RUN_STATUSES as readonly string[]).includes(status);
}

/** Pipeline phase shown live in the dashboard while a run is in progress. */
export const RUN_PHASES = [
  "queued",
  "checkout",
  "scanning",
  "ai_review",
  "publishing",
  "done",
] as const;

/** Outcome of a completed run, mirrored to the GitHub Check Run conclusion. */
export const CONCLUSIONS = ["pass", "fail", "neutral"] as const;
export type Conclusion = (typeof CONCLUSIONS)[number];

export const RUN_TRIGGERS = ["pull_request", "manual", "command"] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * Open-source scanners baked into the engine image. Each one is a separate,
 * independently-retried step in the review workflow, run in this order.
 */
export const SCANNERS = ["opengrep", "osv", "gitleaks", "trivy", "zizmor"] as const;
export type Scanner = (typeof SCANNERS)[number];

/** Per-scanner outcome of one run, stored on `run.scanner_stats`. */
export interface ScannerStat {
  status: "ok" | "failed" | "skipped";
  findings: number;
  durationMs?: number;
  error?: string;
  /** Why a scanner was skipped, e.g. the PR changed nothing it reads. */
  reason?: string;
}

export const SCANNER_CATEGORIES = ["code", "dependencies", "secrets", "infrastructure", "ci"] as const;
export type ScannerCategory = (typeof SCANNER_CATEGORIES)[number];

export interface ScannerInfo {
  label: string;
  category: ScannerCategory;
  /** One line for the settings page. */
  description: string;
  /** Why this tool, over the alternatives (docs and settings tooltip). */
  why: string;
  /**
   * On a pull request, run only when a changed file matches one of these
   * globs (same syntax as ignore paths). null = every pull request. Branch
   * runs always run every enabled scanner.
   */
  triggers: readonly string[] | null;
}

export const SCANNER_INFO: Record<Scanner, ScannerInfo> = {
  opengrep: {
    label: "OpenGrep",
    category: "code",
    description: "Static analysis with taint tracking: injection, XSS, SSRF, unsafe deserialization",
    why: "The open-source fork of Semgrep's engine, with cross-function taint analysis. Runs about 850 vetted rules from five open-source packs (OpenGrep, GitLab, Trail of Bits, 0xdea), keeping vulnerability rules and dropping audit-only and low-confidence ones.",
    triggers: null,
  },
  osv: {
    label: "OSV-Scanner",
    category: "dependencies",
    description: "Known-vulnerable and malicious packages in lockfiles, across 11 ecosystems",
    why: "Google's scanner for OSV.dev, which merges GitHub advisories, PyPA, RustSec, Go and others, and is the only open database of malicious packages (MAL- entries) from the OpenSSF. Only package names and versions leave the sandbox.",
    triggers: [
      "package-lock.json",
      "npm-shrinkwrap.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "bun.lock",
      "deno.lock",
      "requirements*.txt",
      "poetry.lock",
      "Pipfile.lock",
      "pdm.lock",
      "uv.lock",
      "pylock.toml",
      "go.mod",
      "Cargo.lock",
      "Gemfile.lock",
      "gems.locked",
      "composer.lock",
      "pom.xml",
      "gradle.lockfile",
      "buildscript-gradle.lockfile",
      "packages.lock.json",
      "mix.lock",
      "pubspec.lock",
      "renv.lock",
      "Package.resolved",
      "conan.lock",
    ],
  },
  gitleaks: {
    label: "Gitleaks",
    category: "secrets",
    description: "Hard-coded API keys, tokens and private keys",
    why: "The most widely used open-source secret scanner, with about 200 provider-specific rules. It runs with its own default config, so a config file in the pull request can't turn rules off.",
    triggers: null,
  },
  trivy: {
    label: "Trivy",
    category: "infrastructure",
    description: "Misconfigured Dockerfiles, Kubernetes, Terraform, CloudFormation and Helm",
    why: "Aqua's scanner, used here only for infrastructure-as-code checks, which run fully offline from the checks bundled in the pinned binary.",
    triggers: [
      "Dockerfile",
      "*.Dockerfile",
      "*.dockerfile",
      "Containerfile",
      "*.tf",
      "*.tfvars",
      "*.hcl",
      "*.yaml",
      "*.yml",
      "*.json",
      "*.bicep",
    ],
  },
  zizmor: {
    label: "zizmor",
    category: "ci",
    description: "GitHub Actions: script injection, dangerous triggers, leaked tokens, unpinned actions",
    why: "Workflows run with the repository's secrets, and attacks like pull_request_target checkouts and ${{ }} injection are among the most exploited bugs on GitHub. zizmor runs offline with its low-noise persona.",
    triggers: [".github/workflows/", ".github/actions/", "action.yml", "action.yaml", ".github/dependabot.yml"],
  },
};

/** Scanners a newly connected repository starts with. */
export const DEFAULT_SCANNERS: Scanner[] = [...SCANNERS];

/** Where a finding came from: one of the scanners, or the AI reviewer. */
export const FINDING_SOURCES = [...SCANNERS, "ai"] as const;
export type FindingSource = (typeof FINDING_SOURCES)[number];

/** The AI's verdict on a scanner finding after reading the code. */
export const AI_VERDICTS = ["confirmed", "false_positive", "needs_review"] as const;
export type AiVerdict = (typeof AI_VERDICTS)[number];

/** Headless coding agents the engine can drive. */
export const AGENT_PROVIDERS = ["claude", "codex", "cursor"] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];

export const AGENT_INFO: Record<
  AgentProvider,
  { label: string; cmd: string; blurb: string }
> = {
  claude: {
    label: "Claude Code",
    cmd: "claude -p",
    blurb: "Your Claude Pro or Max subscription, or an Anthropic API key.",
  },
  codex: {
    label: "Codex",
    cmd: "codex exec",
    blurb: "Your ChatGPT plan, a Business or Enterprise access token, or an OpenAI API key.",
  },
  cursor: {
    label: "Cursor",
    cmd: "cursor-agent -p",
    blurb: "Your Cursor plan, through a user API key.",
  },
};

/**
 * Kinds of bring-your-own credential. Each maps to exactly one agent and one
 * upstream API host; the engine injects it at the sandbox egress so the
 * secret never enters the sandbox.
 */
export const CREDENTIAL_KINDS = [
  "claude_oauth_token",
  "anthropic_api_key",
  "codex_chatgpt_login",
  "codex_access_token",
  "openai_api_key",
  "cursor_api_key",
] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export const CREDENTIAL_INFO: Record<
  CredentialKind,
  {
    provider: AgentProvider;
    label: string;
    hint: string;
    prefix?: string;
    /** Pasted as a file (multi-line JSON), not a single-line token. */
    file?: boolean;
  }
> = {
  claude_oauth_token: {
    provider: "claude",
    label: "Claude subscription token",
    hint: "Run `claude setup-token` and paste the token (uses your Pro/Max plan).",
    prefix: "sk-ant-oat",
  },
  anthropic_api_key: {
    provider: "claude",
    label: "Anthropic API key",
    hint: "An API key from console.anthropic.com (usage-based billing).",
    prefix: "sk-ant-api",
  },
  openai_api_key: {
    provider: "codex",
    label: "OpenAI API key",
    hint: "An API key from platform.openai.com (usage-based billing).",
    prefix: "sk-",
  },
  codex_chatgpt_login: {
    provider: "codex",
    label: "ChatGPT login",
    hint: "Sign in with `codex login --device-auth` in a fresh CODEX_HOME and paste its auth.json (uses your Plus/Pro plan).",
    file: true,
  },
  codex_access_token: {
    provider: "codex",
    label: "Codex access token",
    hint: "A ChatGPT Business or Enterprise access token for Codex automation.",
    prefix: "at-",
  },
  cursor_api_key: {
    provider: "cursor",
    label: "Cursor API key",
    hint: "Create a user API key under Cursor Dashboard → API Keys. Usage counts against your Cursor plan.",
  },
};

/** Minimum severity that fails the GitHub check. `never` = advisory only. */
export const FAIL_THRESHOLDS = ["critical", "high", "medium", "low", "never"] as const;
export type FailThreshold = (typeof FAIL_THRESHOLDS)[number];
