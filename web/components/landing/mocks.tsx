/**
 * Product mockups for the marketing site. They all tell one story:
 * acme/storefront#482 adds an order search endpoint and its OpenAPI spec.
 * OpenGrep flags a SQL injection the agent confirms and a path traversal it
 * dismisses, Spectral flags a DELETE with no security scheme, OSV-Scanner
 * flags a lodash advisory that predates the PR, and the agent adds an IDOR
 * it found reading the diff. Trivy, zizmor and poutine skip: the PR touches
 * no IaC, workflow or pipeline file.
 */
import type { Severity } from "@openvscan/core";
import type { ReactNode } from "react";
import { AgentLogo } from "@/components/brand/AgentLogo";
import { Mark } from "@/components/brand/Mark";
import {
  Bot,
  Chat,
  Check,
  CircleDot,
  GitPullRequest,
  Lock,
  X,
} from "@/components/icons";
import { SeverityBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Eyebrow, Sheet } from "./primitives";

type Sev = Exclude<Severity, "info">;

// Kept out of JSX attribute strings so the template braces read literally.
const Q = "$" + "{q}";
const SQL_LINE = `    \`SELECT * FROM orders WHERE note LIKE '%${Q}%'\``;
const SQL_FIX = `    'SELECT * FROM orders WHERE note LIKE ?', [\`%${Q}%\`]`;

/* -------------------------------------------------------------------------- */
/* Hero cards                                                                  */
/* -------------------------------------------------------------------------- */

/** The check run on the pull request. */
export function CheckRunCard({ className }: { className?: string }) {
  const counts: [Sev, number][] = [
    ["critical", 0],
    ["high", 2],
    ["medium", 1],
    ["low", 0],
  ];
  return (
    <Sheet className={cn("w-full overflow-hidden", className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <p className="text-[12px] text-stone">
            <GitPullRequest size={12} className="mr-1 inline -translate-y-px" />
            acme/storefront #482
          </p>
          <p className="mt-1 text-[15px] font-medium text-ink">
            OpenVScan Security Review
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-severity-critical-muted px-2 py-0.5 text-[11.5px] font-medium text-severity-critical">
          <X size={10} strokeWidth={3} />
          Failed
        </span>
      </div>
      <div className="mx-5 mt-4 grid grid-cols-4 overflow-hidden rounded-[6px] border border-rule">
        {counts.map(([s, n]) => (
          <div
            key={s}
            className="border-r border-rule px-2.5 py-2 last:border-r-0"
          >
            <SeverityBadge severity={s} className="text-[9.5px]" />
            <div className="mt-1 font-display text-[22px] leading-none text-ink tabular">
              {n}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 divide-y divide-rule border-t border-rule text-[12.5px]">
        {[
          ["SQL injection", "api/orders/search.ts", "L14"],
          ["Order lookup skips owner check", "api/orders/[id].ts", "L22"],
        ].map(([t, f, l]) => (
          <div key={f} className="flex items-center gap-3 px-5 py-2.5">
            <span className="size-[7px] shrink-0 rounded-[1.5px] bg-severity-high" />
            <span className="min-w-0 flex-1 truncate text-ink">{t}</span>
            <span className="hidden truncate font-mono text-[11.5px] text-stone sm:inline">
              {f}
            </span>
            <span className="font-mono text-[11.5px] text-pebble">{l}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-rule bg-paper/60 px-5 py-2.5 text-[12px] text-stone">
        <Chat size={13} />2 inline comments · fails on high · in the diff
      </div>
    </Sheet>
  );
}

const SUITE: {
  name: string;
  ran: boolean;
  note: string;
  tone: string;
}[] = [
  {
    name: "OpenGrep",
    ran: true,
    note: "js, python rules · 2",
    tone: "bg-[#3f8a64]",
  },
  {
    name: "OSV-Scanner",
    ran: true,
    note: "pnpm-lock.yaml · 1",
    tone: "bg-[#8fcaa4]",
  },
  { name: "Gitleaks", ran: true, note: "4 commits · 0", tone: "bg-[#d9a94e]" },
  {
    name: "Spectral",
    ran: true,
    note: "openapi.yaml · 1",
    tone: "bg-[#2c6ea8]",
  },
  { name: "Trivy", ran: false, note: "no IaC changed", tone: "" },
  { name: "zizmor", ran: false, note: "no workflow changed", tone: "" },
  { name: "poutine", ran: false, note: "no pipeline changed", tone: "" },
];

/** The scanner step of the run: which ran, which skipped and why. */
export function ScannerSuiteCard({ className }: { className?: string }) {
  return (
    <Sheet className={cn("w-full p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Eyebrow>Scanners · 3f9c2e1</Eyebrow>
        <span className="font-mono text-[11px] text-pebble">
          4 ran · 3 skipped
        </span>
      </div>
      <p className="mt-2 text-[15px] font-medium text-ink">
        Only what the change touches
      </p>
      {/* Segmented bar: one segment per scanner that ran. */}
      <div className="mt-4 flex h-2 gap-1">
        {SUITE.map((s) => (
          <span
            key={s.name}
            className={cn(
              "h-full flex-1 rounded-full",
              s.ran ? s.tone : "bg-rule",
            )}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-1.5">
        {SUITE.map((s) => (
          <li
            key={s.name}
            className={cn(
              "flex items-center gap-2.5 rounded-[6px] px-2.5 py-1.5",
              s.ran ? "bg-paper/70" : "",
            )}
          >
            <span
              className={cn(
                "grid size-4 shrink-0 place-items-center rounded-full",
                s.ran ? "bg-brand/15 text-brand" : "border border-rule-strong",
              )}
            >
              {s.ran && <Check size={9} strokeWidth={3.5} />}
            </span>
            <span
              className={cn("text-[13px]", s.ran ? "text-ink" : "text-stone")}
            >
              {s.name}
            </span>
            <span
              className={cn(
                "ml-auto truncate font-mono text-[11px]",
                s.ran ? "text-stone" : "text-pebble",
              )}
            >
              {s.ran ? s.note : `skipped · ${s.note}`}
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

const AGENT_TABS = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "cursor", label: "Cursor" },
] as const;

/** The AI review: verdicts with the reason, on your own agent. */
export function AiTriageCard({ className }: { className?: string }) {
  return (
    <Sheet className={cn("w-full p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>AI review</Eyebrow>
        <div className="flex items-center gap-1">
          {AGENT_TABS.map((a, i) => (
            <span
              key={a.id}
              title={a.label}
              className={cn(
                "grid size-6 place-items-center rounded-full border",
                i === 0 ? "border-ink/80 bg-chalk" : "border-rule opacity-60",
              )}
            >
              <AgentLogo agent={a.id} className="size-3" />
            </span>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[15px] font-medium text-ink">
        Your agent reads the code around each finding
      </p>
      <div className="mt-3 space-y-2.5">
        <TriageNote
          verdict="confirmed"
          title="SQL injection in order search"
          why="req.query.q reaches db.query; the sanitizer was removed in this PR."
        />
        <TriageNote
          verdict="false positive"
          title="Path traversal in receipt download"
          why="The file name comes from a fixed allowlist on line 31."
        />
        <TriageNote
          verdict="found by agent"
          title="Order lookup skips owner check"
          why="GET /orders/:id returns any order without comparing user_id."
        />
      </div>
    </Sheet>
  );
}

function TriageNote({
  verdict,
  title,
  why,
}: {
  verdict: Verdict;
  title: string;
  why: string;
}) {
  return (
    <div className="rounded-[6px] border border-rule bg-paper/50 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "text-[13px] leading-snug",
            verdict === "false positive"
              ? "text-pebble line-through decoration-pebble/60"
              : "text-ink",
          )}
        >
          {title}
        </span>
        <VerdictTag v={verdict} />
      </div>
      <p className="mt-1 text-[12px] leading-snug text-stone">{why}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pull request cards                                                          */
/* -------------------------------------------------------------------------- */

/** The review comment OpenVScan leaves on the offending line. */
export function InlineComment({
  compact,
  agent = "Claude Code",
}: {
  compact?: boolean;
  agent?: string;
}) {
  return (
    <div className={cn("font-sans", compact ? "mx-3 my-2" : "")}>
      <div className="rounded-[6px] border border-rule bg-chalk shadow-[0_1px_2px_rgb(18_17_15/0.05)]">
        <div className="flex items-center gap-2 border-b border-rule px-3 py-2">
          <span className="grid size-5 place-items-center rounded-[4px] bg-brand">
            <Mark className="h-2 w-2.5 text-paper" />
          </span>
          <span className="text-[13px] font-medium text-ink">openvscan</span>
          <span className="rounded-full border border-rule px-1.5 text-[10.5px] text-stone">
            bot
          </span>
          <span className="ml-auto">
            <SeverityBadge severity="high" />
          </span>
        </div>
        <div className="space-y-2 px-3 py-2.5">
          <p className="text-[13px] font-medium text-ink">
            SQL injection in order search
          </p>
          <p className="text-[12.5px] leading-relaxed text-stone">
            <code className="font-mono text-ink">req.query.q</code> reaches a
            raw SQL string. {agent} confirmed it: the sanitizer was removed in
            this PR.
          </p>
          {!compact && (
            <div className="overflow-hidden rounded-[5px] border border-rule font-mono text-[12px] leading-[1.7]">
              <div className="overflow-x-auto whitespace-pre bg-severity-critical/[0.06] px-2 text-ink-2">
                <span className="text-severity-critical">− </span>
                {SQL_LINE.trim()}
              </div>
              <div className="overflow-x-auto whitespace-pre bg-brand/[0.07] px-2 text-ink-2">
                <span className="text-brand">+ </span>
                {SQL_FIX.trim()}
              </div>
            </div>
          )}
          <p className="font-mono text-[11px] text-pebble">
            opengrep · javascript.sql.raw-query · CWE-89
          </p>
        </div>
      </div>
    </div>
  );
}

type Verdict =
  | "confirmed"
  | "false positive"
  | "found by agent"
  | "outside diff";

const TRIAGE_ROWS: {
  sev: Sev;
  title: string;
  file: string;
  verdict: Verdict;
}[] = [
  {
    sev: "high",
    title: "SQL injection in order search",
    file: "api/orders/search.ts:14",
    verdict: "confirmed",
  },
  {
    sev: "high",
    title: "Order lookup skips owner check",
    file: "api/orders/[id].ts:22",
    verdict: "found by agent",
  },
  {
    sev: "medium",
    title: "Path traversal in receipt download",
    file: "api/receipts.ts:31",
    verdict: "false positive",
  },
  {
    sev: "high",
    title: "lodash 4.17.20 command injection",
    file: "pnpm-lock.yaml",
    verdict: "outside diff",
  },
];

export function TriageCard({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <Sheet className={cn("w-full max-w-[400px] p-4", className)}>
      <div className="flex items-center justify-between">
        <Eyebrow>Triage</Eyebrow>
        <span className="font-mono text-[11px] text-pebble">claude-code</span>
      </div>
      <div className="mt-2 divide-y divide-rule">
        {TRIAGE_ROWS.slice(0, rows).map((r) => (
          <div key={r.title} className="py-2.5">
            <div className="flex items-start justify-between gap-3">
              <span
                className={cn(
                  "text-[13.5px] leading-snug",
                  r.verdict === "false positive"
                    ? "text-pebble line-through decoration-pebble/60"
                    : "text-ink",
                )}
              >
                {r.title}
              </span>
              <VerdictTag v={r.verdict} />
            </div>
            <div className="mt-1 flex items-center gap-3">
              <SeverityBadge severity={r.sev} />
              <span className="truncate font-mono text-[11.5px] text-stone">
                {r.file}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function VerdictTag({ v }: { v: Verdict }) {
  const style = {
    confirmed: "bg-severity-high/12 text-severity-high",
    "found by agent": "bg-ink text-paper",
    "false positive": "bg-paper-2 text-stone",
    "outside diff": "border border-rule text-stone",
  }[v];
  return (
    <span
      className={cn(
        "shrink-0 rounded-[3px] px-1.5 py-0.5 font-mono text-[10.5px]",
        style,
      )}
    >
      {v}
    </span>
  );
}

/** Summary comment, as posted on the pull request. */
export function SummaryCard({ className }: { className?: string }) {
  return (
    <Sheet className={cn("w-full overflow-hidden", className)}>
      <div className="flex items-center justify-between border-b border-rule px-5 py-3">
        <Eyebrow>Summary comment</Eyebrow>
        <span className="font-mono text-[11px] text-pebble">
          updated 2m ago
        </span>
      </div>
      <div className="space-y-4 px-5 py-4">
        <p className="text-[14px] leading-relaxed text-ink-2">
          This PR adds an order search endpoint. It removes input sanitization
          and builds SQL from the query string, and a new lookup route returns
          any order by id without checking who owns it. The OpenAPI spec adds a
          DELETE route with no security scheme.
        </p>
        <div className="grid grid-cols-4 overflow-hidden rounded-[6px] border border-rule">
          {(
            [
              ["critical", 0],
              ["high", 2],
              ["medium", 1],
              ["low", 0],
            ] as [Sev, number][]
          ).map(([s, n]) => (
            <div
              key={s}
              className="border-r border-rule px-3 py-2.5 last:border-r-0"
            >
              <SeverityBadge severity={s} />
              <div className="mt-1 font-display text-[24px] leading-none text-ink">
                {n}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 font-mono text-[11.5px] text-stone">
          <Bot size={13} />
          Risk: high · 1 false positive dismissed · 1 pre-existing
        </div>
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Panels for the numbered details                                             */
/* -------------------------------------------------------------------------- */

export function DiffScopePanel() {
  return (
    <Sheet className="w-full max-w-[460px] p-5">
      <Eyebrow>Blocking the check</Eyebrow>
      <div className="mt-3 space-y-2.5">
        {TRIAGE_ROWS.map((r) => {
          const blocks =
            r.verdict === "confirmed" || r.verdict === "found by agent";
          return (
            <div key={r.title} className="flex items-center gap-3">
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full",
                  blocks
                    ? "bg-severity-critical text-white dark:text-night"
                    : "bg-paper-2 text-stone",
                )}
              >
                {blocks ? (
                  <X size={11} strokeWidth={3} />
                ) : (
                  <CircleDot size={11} />
                )}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[13.5px]",
                  blocks ? "text-ink" : "text-stone",
                )}
              >
                {r.title}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-pebble">
                {blocks ? "in diff" : r.verdict}
              </span>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

export function PolicyPanel() {
  const levels = ["critical", "high", "medium", "low", "never"];
  return (
    <Sheet className="w-full max-w-[440px] p-5">
      <Eyebrow>Review policy · acme/storefront</Eyebrow>
      <div className="mt-4 space-y-3.5">
        {[
          ["Review pull requests automatically", true],
          ["Skip draft pull requests", true],
        ].map(([l, on]) => (
          <div
            key={l as string}
            className="flex items-center justify-between gap-4"
          >
            <span className="text-[13.5px] text-ink">{l}</span>
            <span
              className={cn(
                "relative h-5 w-9 rounded-full",
                on ? "bg-brand" : "bg-rule",
              )}
            >
              <span className="absolute top-0.5 right-0.5 size-4 rounded-full bg-white shadow" />
            </span>
          </div>
        ))}
        <div className="border-t border-rule pt-3.5">
          <div className="text-[13.5px] text-ink">Fail the check on</div>
          <div className="mt-2 grid grid-cols-5 gap-1 rounded-[6px] bg-paper-2 p-1">
            {levels.map((l) => (
              <span
                key={l}
                className={cn(
                  "rounded-[4px] py-1 text-center text-[12px] capitalize",
                  l === "high" ? "bg-chalk text-ink shadow-sm" : "text-stone",
                )}
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

export function CredentialPanel() {
  return (
    <div className="w-full max-w-[480px] space-y-3">
      <Sheet className="p-4">
        <Eyebrow>Inside the sandbox</Eyebrow>
        <pre className="mt-2 overflow-x-auto font-mono text-[12.5px] leading-[1.7] text-ink-2">
          {"CLAUDE_CODE_OAUTH_TOKEN="}
          <span className="text-stone">placeholder</span>
        </pre>
      </Sheet>
      <Sheet className="p-4">
        <div className="flex items-center justify-between">
          <Eyebrow>At egress</Eyebrow>
          <Lock size={13} className="text-brand" />
        </div>
        <div className="mt-2 space-y-1 font-mono text-[12.5px] leading-[1.7]">
          <div className="text-ink-2">
            POST api.anthropic.com <span className="text-brand">allowed</span>
          </div>
          <div className="text-stone">placeholder → sk-ant-oat01-••••••••</div>
          <div className="text-ink-2">
            GET github.com{" "}
            <span className="text-severity-critical">denied</span>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

export function EgressPanel() {
  const phases = [
    ["checkout", "github.com · this repo only", "read-only token"],
    ["scan", "api.osv.dev · package names", "OSV-Scanner only"],
    ["agent", "your model API", "key swapped in"],
    ["publish", "nothing", "sandbox locked"],
  ];
  return (
    <Sheet className="w-full max-w-[500px] overflow-hidden">
      <div className="border-b border-rule px-5 py-3">
        <Eyebrow>Sandbox egress by phase</Eyebrow>
      </div>
      <div className="divide-y divide-rule">
        {phases.map(([p, host, note]) => (
          <div
            key={p}
            className="grid grid-cols-[76px_1fr] items-center gap-3 px-5 py-2.5 sm:grid-cols-[76px_1fr_auto]"
          >
            <span className="font-mono text-[12.5px] text-ink">{p}</span>
            <span className="truncate text-[13px] text-ink-2">{host}</span>
            <span className="hidden font-mono text-[11px] text-pebble sm:inline">
              {note}
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/** Your coding agent, talking to OpenVScan over MCP. */
export function McpPanel() {
  return (
    <div className="w-full max-w-[500px] overflow-hidden rounded-[8px] bg-night text-day shadow-[0_18px_40px_-12px_rgb(0_0_0/0.5)]">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <AgentLogo agent="claude" className="size-3.5" />
        <span className="font-mono text-[12px] text-pebble">
          claude · ~/storefront
        </span>
      </div>
      <div className="space-y-2.5 px-5 py-4 font-mono text-[12.5px] leading-[1.6]">
        <p>
          <span className="text-pebble">&gt; </span>fix the OpenVScan findings
          on this PR
        </p>
        <McpCall name="get_review" detail="acme/storefront #482 · 2 blocking" />
        <p className="text-pebble">
          Parameterized the search query and added an owner check to the lookup
          route.
        </p>
        <McpCall name="rerun_review" detail="started · run 9f2c" />
        <p>
          <span className="text-brand-light">✓</span> Check passed
        </p>
      </div>
    </div>
  );
}

function McpCall({ name, detail }: { name: string; detail: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-[5px] border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11.5px]">
      <span className="text-brand-light">openvscan</span>
      <span className="text-day">{name}</span>
      <span className="ml-auto truncate text-pebble">{detail}</span>
    </div>
  );
}

export function DeployPanel() {
  return (
    <div className="w-full max-w-[500px] overflow-hidden rounded-[8px] bg-night text-day shadow-[0_18px_40px_-12px_rgb(0_0_0/0.5)]">
      <div className="flex gap-1.5 border-b border-white/10 px-4 py-3">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
      </div>
      <pre className="overflow-x-auto px-5 py-4 font-mono text-[12.5px] leading-[1.8]">
        <span className="text-pebble">$ </span>pnpm db:migrate{"\n"}
        <span className="text-pebble">$ </span>pnpm run deploy{"\n"}
        <span className="text-pebble"> openvscan-engine </span>
        <span className="text-brand-light">deployed</span>
        {"\n"}
        <span className="text-pebble"> openvscan-web </span>
        <span className="text-brand-light">deployed</span>
        {"\n"}
        <span className="text-pebble"> workflow, D1, R2, container </span>
        <span className="text-brand-light">ok</span>
      </pre>
    </div>
  );
}
