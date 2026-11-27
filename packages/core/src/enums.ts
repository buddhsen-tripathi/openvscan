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

export const RUN_TRIGGERS = ["pull_request", "manual"] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * Open-source scanners baked into the engine image. Each one is a separate,
 * independently-retried step in the review workflow.
 */
export const SCANNERS = ["trivy", "opengrep", "gitleaks"] as const;
export type Scanner = (typeof SCANNERS)[number];

/** Per-scanner outcome of one run, stored on `run.scanner_stats`. */
export interface ScannerStat {
  status: "ok" | "failed" | "skipped";
  findings: number;
  durationMs?: number;
  error?: string;
}

export const SCANNER_INFO: Record<
  Scanner,
  { label: string; description: string }
> = {
  trivy: {
    label: "Trivy",
    description: "Vulnerable dependencies, IaC misconfigurations",
  },
  opengrep: {
    label: "Opengrep",
    description: "Semgrep-compatible static analysis: injection, XSS, insecure APIs",
  },
  gitleaks: {
    label: "Gitleaks",
    description: "Hard-coded secrets and credentials",
  },
};

/** Where a finding came from: one of the scanners, or the AI reviewer. */
export const FINDING_SOURCES = [...SCANNERS, "ai"] as const;
export type FindingSource = (typeof FINDING_SOURCES)[number];

/** The AI's verdict on a scanner finding after reading the code. */
export const AI_VERDICTS = ["confirmed", "false_positive", "needs_review"] as const;
export type AiVerdict = (typeof AI_VERDICTS)[number];

/** Headless coding agents the engine can drive. */
export const AGENT_PROVIDERS = ["claude", "codex"] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];

export const AGENT_INFO: Record<
  AgentProvider,
  { label: string; short: string; cmd: string; blurb: string }
> = {
  claude: {
    label: "Claude Code",
    short: "CC",
    cmd: "claude -p",
    blurb: "Your Claude Pro or Max subscription, or an Anthropic API key.",
  },
  codex: {
    label: "Codex",
    short: "CX",
    cmd: "codex exec",
    blurb: "An OpenAI API key.",
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
  "openai_api_key",
] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export const CREDENTIAL_INFO: Record<
  CredentialKind,
  { provider: AgentProvider; label: string; hint: string; prefix?: string }
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
    hint: "An API key from platform.openai.com, used by the Codex CLI.",
    prefix: "sk-",
  },
};

/** Minimum severity that fails the GitHub check. `never` = advisory only. */
export const FAIL_THRESHOLDS = ["critical", "high", "medium", "low", "never"] as const;
export type FailThreshold = (typeof FAIL_THRESHOLDS)[number];
