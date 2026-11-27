/**
 * Product mockups for the marketing site. They all tell one story:
 * acme/storefront#482 adds an order search endpoint. Opengrep flags a SQL
 * injection the agent confirms, Gitleaks flags a test key the agent dismisses,
 * Trivy flags a lodash CVE that predates the PR, and the agent adds an IDOR it
 * found reading the diff.
 */
import type { Severity } from "@openvscan/core";
import { useReducedMotion } from "framer-motion";
import { type ReactNode, useEffect, useState } from "react";
import { Mark } from "@/components/brand/Mark";
import {
  Bot,
  Chat,
  Check,
  CircleDot,
  ClaudeMark,
  Code,
  GitPullRequest,
  Key,
  Lock,
  OpenAIMark,
  Refresh,
  ShieldCheck,
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
/* Hero: the pull request on the left, the run on the right.                  */
/* -------------------------------------------------------------------------- */

const AGENTS = {
  claude: {
    tab: "Claude Code",
    bin: "claude-code",
    model: "claude-sonnet-5-5",
    Mark: ClaudeMark,
    tint: "text-[#D97757]",
  },
  codex: {
    tab: "Codex",
    bin: "codex",
    model: "default model",
    Mark: OpenAIMark,
    tint: "",
  },
} as const;
type AgentKey = keyof typeof AGENTS;

const RUN_STEPS = [
  {
    name: "checkout",
    detail: "git fetch 3f9c2e1 · 214 files",
    time: "1.4s",
    icon: GitPullRequest,
  },
  {
    name: "trivy",
    detail: "1 vulnerable package",
    time: "8.2s",
    icon: ShieldCheck,
  },
  { name: "opengrep", detail: "2 findings", time: "11.6s", icon: Code },
  { name: "gitleaks", detail: "1 secret", time: "0.9s", icon: Key },
  {
    name: "agent",
    detail: "triaged 4 · found 1 · reviewed diff",
    time: "1m 14s",
    icon: Bot,
  },
  {
    name: "publish",
    detail: "check run · 2 inline comments",
    time: "1.1s",
    icon: Chat,
  },
] as const;

export function HeroDemo() {
  const reduce = useReducedMotion();
  const [agent, setAgent] = useState<AgentKey>("claude");
  const [step, setStep] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const done = step >= RUN_STEPS.length;

  useEffect(() => {
    if (reduce) {
      setStep(RUN_STEPS.length);
      return;
    }
    setStep(0);
    let i = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const tick = () => {
      i += 1;
      setStep(i);
      if (i < RUN_STEPS.length)
        timers.push(setTimeout(tick, i === 4 ? 1900 : 850));
    };
    timers.push(setTimeout(tick, 700));
    return () => timers.forEach(clearTimeout);
  }, [runKey, agent, reduce]);

  const a = AGENTS[agent];

  return (
    <div className="overflow-hidden rounded-[10px] bg-chalk shadow-[0_1px_2px_rgb(18_17_15/0.08),0_30px_60px_-20px_rgb(18_17_15/0.35)]">
      {/* Window bar */}
      <div className="flex items-center gap-3 border-b border-rule px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Mark className="h-3 w-4 text-brand" />
          <span className="truncate font-mono text-[13px] text-ink">
            acme/storefront <span className="text-stone">#482</span>
          </span>
        </div>
        <div className="ml-2 hidden items-center gap-1 sm:flex">
          {(Object.keys(AGENTS) as AgentKey[]).map((k) => {
            const { Mark: AgentMark, tint } = AGENTS[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => setAgent(k)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors",
                  agent === k
                    ? "border-ink bg-ink text-paper"
                    : "border-rule text-ink-2 hover:border-rule-strong",
                )}
              >
                <AgentMark size={13} className={tint} />
                {AGENTS[k].tab}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setRunKey((n) => n + 1)}
          className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-stone transition-colors hover:text-ink"
        >
          <Refresh size={13} />
          Replay
        </button>
      </div>

      <div className="grid md:grid-cols-[1.08fr_1fr]">
        {/* Pull request diff */}
        <div className="min-w-0 border-b border-rule md:border-r md:border-b-0">
          <div className="flex items-center justify-between border-b border-rule/70 bg-paper/60 px-4 py-2 font-mono text-[12px]">
            <span className="truncate text-ink">api/orders/search.ts</span>
            <span className="shrink-0">
              <span className="text-brand">+14</span>{" "}
              <span className="text-severity-critical">−3</span>
            </span>
          </div>
          <div className="overflow-x-auto py-2 font-mono text-[12.5px] leading-[1.75]">
            <DiffLine n={11} text="export async function searchOrders(req) {" />
            <DiffLine
              n={12}
              kind="del"
              text="  const q = sanitize(req.query.q);"
            />
            <DiffLine n={12} kind="add" text="  const q = req.query.q;" />
            <DiffLine n={13} kind="add" text="  const rows = await db.query(" />
            <DiffLine n={14} kind="add" text={SQL_LINE} flagged={done} />
            <div
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-500",
                done
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <InlineComment compact agent={a.tab} />
              </div>
            </div>
            <DiffLine n={15} kind="add" text="  );" />
            <DiffLine
              n={16}
              kind="add"
              text="  return rows.filter((o) => o.id);"
            />
            <DiffLine n={17} text="}" />
          </div>
        </div>

        {/* Run */}
        <div className="flex min-w-0 flex-col bg-night text-day">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <span className="eyebrow text-pebble">Run</span>
            <span className="flex items-center gap-2 font-mono text-[12px] text-pebble">
              {done ? (
                <>
                  <span className="size-1.5 rounded-full bg-severity-critical" />
                  Check failed
                </>
              ) : (
                <>
                  <span className="size-1.5 animate-pulse rounded-full bg-brand-light" />
                  Running
                </>
              )}
              <span className="text-white/25">·</span>
              {done ? "1m 38s" : `${step}/${RUN_STEPS.length}`}
            </span>
          </div>
          <div className="space-y-1 px-3 py-3">
            {RUN_STEPS.map((s, i) => {
              const state =
                i < step ? "done" : i === step ? "active" : "waiting";
              const Icon = s.name === "agent" ? a.Mark : s.icon;
              return (
                <div
                  key={s.name}
                  className={cn(
                    "rounded-[6px] px-2.5 py-2 transition-colors",
                    state === "active" && "bg-white/[0.05]",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 grid size-6 shrink-0 place-items-center rounded-[5px] border",
                        state === "waiting"
                          ? "border-white/10 text-white/30"
                          : "border-white/20 text-day",
                      )}
                    >
                      <Icon size={13} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span
                          className={cn(
                            "font-mono text-[13px]",
                            state === "waiting" ? "text-white/35" : "text-day",
                          )}
                        >
                          {s.name === "agent" ? a.bin : s.name}
                          {s.name === "agent" && (
                            <span className="ml-2 text-[11.5px] text-pebble">
                              {a.model}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-mono text-[12px] text-pebble">
                          {state === "done" ? s.time : ""}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "truncate text-[12.5px]",
                          state === "waiting" ? "text-white/25" : "text-pebble",
                        )}
                      >
                        {s.detail}
                      </div>
                      <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/[0.07]">
                        <div
                          className={cn(
                            "h-full origin-left rounded-full",
                            state === "done" && "bg-brand-light/80",
                            state === "active" &&
                              "ov-anim bg-brand-light/80 [animation:ov-progress_0.9s_ease-out_forwards]",
                            state === "waiting" && "scale-x-0",
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-auto border-t border-white/10 px-5 py-3.5">
            <div className="flex items-center justify-between font-mono text-[12px] text-pebble">
              <span>5 findings · 1 dismissed · 2 in diff</span>
              <span
                className={cn(
                  "transition-opacity",
                  done ? "opacity-100" : "opacity-0",
                )}
              >
                fail_on: high
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiffLine({
  n,
  text,
  kind,
  flagged,
}: {
  n: number;
  text: string;
  kind?: "add" | "del";
  flagged?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex whitespace-pre pr-4 transition-colors duration-500",
        kind === "add" && "bg-brand/[0.07]",
        kind === "del" && "bg-severity-critical/[0.06]",
        flagged && "bg-severity-high/[0.14]",
      )}
    >
      <span className="w-10 shrink-0 select-none pr-3 text-right text-pebble">
        {n}
      </span>
      <span
        className={cn(
          "w-4 shrink-0 select-none",
          kind === "add" && "text-brand",
          kind === "del" && "text-severity-critical",
        )}
      >
        {kind === "add" ? "+" : kind === "del" ? "−" : " "}
      </span>
      <span className="text-ink-2">{text}</span>
    </div>
  );
}

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
              <div className="whitespace-pre bg-severity-critical/[0.06] px-2 text-ink-2">
                <span className="text-severity-critical">− </span>
                {SQL_LINE.trim()}
              </div>
              <div className="whitespace-pre bg-brand/[0.07] px-2 text-ink-2">
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

/* -------------------------------------------------------------------------- */
/* Feature cards                                                              */
/* -------------------------------------------------------------------------- */

export function ScannersCard() {
  const rows = [
    { name: "Trivy", what: "dependencies, IaC", n: 1 },
    { name: "Opengrep", what: "code patterns", n: 2 },
    { name: "Gitleaks", what: "secrets", n: 1 },
  ];
  return (
    <Sheet className="w-full max-w-[340px] p-4">
      <Eyebrow>Scanners · 3f9c2e1</Eyebrow>
      <div className="mt-3 divide-y divide-rule">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-3 py-2.5">
            <span className="grid size-5 place-items-center rounded-full bg-brand/12 text-brand">
              <Check size={11} strokeWidth={3} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] text-ink">{r.name}</div>
              <div className="text-[12px] text-stone">{r.what}</div>
            </div>
            <span className="font-mono text-[12px] text-stone">
              {r.n} finding{r.n === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

const TRIAGE_ROWS: {
  sev: Sev;
  title: string;
  file: string;
  verdict: "confirmed" | "false positive" | "found by agent" | "outside diff";
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
    title: "AWS access key in fixture",
    file: "test/fixtures/aws.json:3",
    verdict: "false positive",
  },
  {
    sev: "medium",
    title: "lodash 4.17.20 prototype pollution",
    file: "package-lock.json",
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
              <Verdict v={r.verdict} />
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

function Verdict({ v }: { v: (typeof TRIAGE_ROWS)[number]["verdict"] }) {
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

export function CheckCard({ className }: { className?: string }) {
  return (
    <Sheet className={cn("w-full max-w-[380px] overflow-hidden", className)}>
      <div className="flex items-center gap-2.5 border-b border-rule px-4 py-3">
        <span className="grid size-5 place-items-center rounded-full bg-severity-critical text-white dark:text-night">
          <X size={12} strokeWidth={3} />
        </span>
        <span className="text-[13.5px] font-medium text-ink">OpenVScan</span>
        <span className="text-[12.5px] text-stone">1 blocking finding</span>
      </div>
      <div className="divide-y divide-rule text-[12.5px]">
        {[
          ["api/orders/search.ts", "L14", "high"],
          ["api/orders/[id].ts", "L22", "high"],
        ].map(([f, l, s]) => (
          <div key={f} className="flex items-center gap-3 px-4 py-2.5">
            <SeverityBadge severity={s} />
            <span className="min-w-0 flex-1 truncate font-mono text-ink-2">
              {f}
            </span>
            <span className="font-mono text-stone">{l}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-rule bg-paper/60 px-4 py-2.5 text-[12px] text-stone">
        <Chat size={13} />2 inline comments · summary updated
      </div>
    </Sheet>
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
          any order by id without checking who owns it.
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
/* Panels for the numbered feature list                                       */
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
        <pre className="mt-2 font-mono text-[12.5px] leading-[1.7] text-ink-2">
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
    ["scan", "Trivy DB mirrors", "GET only"],
    ["agent", "api.anthropic.com", "key swapped in"],
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
            className="grid grid-cols-[84px_1fr_auto] items-center gap-3 px-5 py-2.5"
          >
            <span className="font-mono text-[12.5px] text-ink">{p}</span>
            <span className="truncate text-[13px] text-ink-2">{host}</span>
            <span className="font-mono text-[11px] text-pebble">{note}</span>
          </div>
        ))}
      </div>
    </Sheet>
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
        <span className="text-pebble">$ </span>pnpm db:migrate:remote{"\n"}
        <span className="text-pebble">$ </span>pnpm deploy{"\n"}
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
