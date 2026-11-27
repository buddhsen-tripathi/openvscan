import type { AgentProvider } from "./enums";

/** When a repository's pull requests get reviewed without being asked. */
export const REVIEW_TRIGGERS = ["push", "open", "request"] as const;
export type ReviewTrigger = (typeof REVIEW_TRIGGERS)[number];

export const REVIEW_TRIGGER_INFO: Record<
  ReviewTrigger,
  { label: string; description: string }
> = {
  push: {
    label: "Every push",
    description: "When a PR opens, gets new commits, reopens or leaves draft.",
  },
  open: {
    label: "When opened",
    description:
      "Once when a PR opens or leaves draft. Ask again with a comment.",
  },
  request: {
    label: "Only on request",
    description: "Only when someone with write access comments a command.",
  },
};

/** Whether a pull_request webhook action starts a review under `trigger`. */
export function triggersReview(trigger: ReviewTrigger, action: string): boolean {
  if (trigger === "push") {
    return ["opened", "reopened", "synchronize", "ready_for_review"].includes(
      action,
    );
  }
  if (trigger === "open") {
    return ["opened", "reopened", "ready_for_review"].includes(action);
  }
  return false;
}

/**
 * Models offered per agent. `null` is the CLI's own default. Claude Code
 * aliases always point at the newest model of that tier.
 */
export const AGENT_MODELS: Record<
  AgentProvider,
  { value: string | null; label: string; hint: string }[]
> = {
  claude: [
    { value: null, label: "Default", hint: "Whatever Claude Code picks" },
    { value: "sonnet", label: "Sonnet (recommended)", hint: "Fast and thorough" },
    { value: "opus", label: "Opus", hint: "Deepest review, slower" },
    { value: "haiku", label: "Haiku", hint: "Fastest, lightest" },
  ],
  codex: [{ value: null, label: "Default", hint: "Whatever Codex picks" }],
  cursor: [{ value: null, label: "Default", hint: "Your Cursor default model" }],
};

/** Optional emphasis added to the reviewer prompt. */
export const REVIEW_FOCUS = [
  "web",
  "api",
  "infra",
  "llm",
  "secrets",
] as const;
export type ReviewFocus = (typeof REVIEW_FOCUS)[number];

export const REVIEW_FOCUS_INFO: Record<
  ReviewFocus,
  { label: string; description: string; prompt: string }
> = {
  web: {
    label: "Web app",
    description: "Auth, access control, XSS, CSRF",
    prompt:
      "Web app: check every new route and handler for authentication and an ownership check on the records it reads or writes (IDOR). Look for XSS through raw HTML rendering, CSRF on state-changing requests without a token or SameSite cookie, open session or cookie flags, and secrets or tokens sent to the client.",
  },
  api: {
    label: "API and backend",
    description: "Injection, SSRF, deserialization",
    prompt:
      "API and backend: trace request input into SQL or NoSQL queries, shell commands, file paths, templates and outbound URLs (SSRF). Check deserialization of untrusted data, mass assignment of fields the caller shouldn't set, and missing authorization on internal endpoints.",
  },
  infra: {
    label: "CI and infrastructure",
    description: "Workflows, IaC, containers",
    prompt:
      "CI and infrastructure: in GitHub Actions, look for untrusted input (PR titles, branch names, comments) interpolated into `run:` steps, `pull_request_target` checking out PR code, over-broad `permissions`, and unpinned third-party actions. In IaC and containers, look for public storage, wildcard IAM, open security groups and secrets in images.",
  },
  llm: {
    label: "LLM and agents",
    description: "Prompt injection, tool abuse",
    prompt:
      "LLM and agent code: find places where untrusted text (user input, web pages, files, tool output) reaches a model that can call tools, run code or read private data. Check that tool calls are authorized for the end user, model output is treated as untrusted before it's executed or rendered, and secrets can't leak into prompts or logs.",
  },
  secrets: {
    label: "Secrets and crypto",
    description: "Keys, tokens, randomness",
    prompt:
      "Secrets and crypto: look for credentials committed or logged, tokens with excessive scope or no expiry, weak hashing for passwords, non-constant-time secret comparison, predictable randomness for tokens or IDs, and disabled TLS verification.",
  },
};

/**
 * Whether `path` matches any glob in `patterns`. Supports `*` (within a
 * segment), `**` (across segments) and `?`; a pattern without a slash
 * matches the file name anywhere, like .gitignore.
 */
export function matchesPath(path: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => globRegex(p).test(path));
}

function globRegex(pattern: string): RegExp {
  const p = pattern.trim().replace(/^\.?\//, "");
  const anchored = p.includes("/") ? p : `**/${p}`;
  let re = "";
  for (let i = 0; i < anchored.length; i++) {
    const c = anchored[i];
    if (c === "*" && anchored[i + 1] === "*") {
      const slash = anchored[i + 2] === "/";
      re += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  // A directory pattern ("docs/") covers everything below it.
  return new RegExp(`^${re}${p.endsWith("/") ? ".*" : ""}$`);
}

/** Commands a collaborator can comment on a pull request. */
export const PR_COMMANDS = ["review", "pause", "resume", "help"] as const;
export type PrCommand = (typeof PR_COMMANDS)[number];

export const PR_COMMAND_INFO: Record<PrCommand, string> = {
  review: "Review the latest commit now",
  pause: "Stop automatic reviews on this pull request",
  resume: "Turn automatic reviews back on",
  help: "List these commands",
};

/**
 * The command in a comment that mentions the App (`@<slug> review`), or null
 * when the App isn't addressed. An unknown word after the mention is "help".
 */
export function parsePrCommand(body: string, slug: string): PrCommand | null {
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(
    `(?:^|\\s)@${escaped}(?:\\[bot\\])?(?![\\w-])\\s*(\\w+)?`,
    "im",
  ).exec(body);
  if (!m) return null;
  const word = m[1]?.toLowerCase();
  return (PR_COMMANDS as readonly string[]).includes(word ?? "")
    ? (word as PrCommand)
    : "help";
}
