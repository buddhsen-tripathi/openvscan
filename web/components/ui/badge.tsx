import { isActiveRun, type Severity } from "@openvscan/core";
import type * as React from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  type IconProps,
  Minus,
  Spinner,
  X,
} from "@/components/icons";
import { cn } from "@/lib/utils";

/* ---- Pill ---- */

const pillTones = {
  muted: "bg-muted text-muted-foreground",
  outline: "border border-border text-muted-foreground",
  inverse: "bg-primary text-primary-foreground",
  success: "bg-status-completed-muted font-medium text-status-completed",
  warning: "bg-status-pending-muted text-status-pending",
  danger: "bg-status-failed-muted text-status-failed",
  high: "bg-severity-high-muted text-severity-high",
} as const;

/** Small inline label: "draft", "This device", counts, sources, verdicts. */
export function Pill({
  tone = "muted",
  className,
  ...props
}: { tone?: keyof typeof pillTones } & React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[4px] px-1.5 py-px text-[11px]",
        pillTones[tone],
        className,
      )}
      {...props}
    />
  );
}

/* ---- Severity ---- */

/** Tailwind classes per severity, written out so Tailwind can see them. */
export const SEVERITY_CLASS: Record<
  Severity,
  { text: string; bg: string; muted: string; stripe: string }
> = {
  critical: {
    text: "text-severity-critical",
    bg: "bg-severity-critical",
    muted: "bg-severity-critical-muted",
    stripe: "before:bg-severity-critical",
  },
  high: {
    text: "text-severity-high",
    bg: "bg-severity-high",
    muted: "bg-severity-high-muted",
    stripe: "before:bg-severity-high",
  },
  medium: {
    text: "text-severity-medium",
    bg: "bg-severity-medium",
    muted: "bg-severity-medium-muted",
    stripe: "before:bg-severity-medium",
  },
  low: {
    text: "text-severity-low",
    bg: "bg-severity-low",
    muted: "bg-severity-low-muted",
    stripe: "before:bg-severity-low",
  },
  info: {
    text: "text-severity-info",
    bg: "bg-severity-info",
    muted: "bg-severity-info-muted",
    stripe: "before:bg-severity-info",
  },
};

export function severityKey(s: string | null | undefined): Severity {
  const k = (s ?? "info").toLowerCase();
  return k in SEVERITY_CLASS ? (k as Severity) : "info";
}

/** Square swatch + label, the same marker used on the marketing site. */
export function SeverityBadge({
  severity,
  className,
  solid,
  ...props
}: { severity: string; solid?: boolean } & React.ComponentProps<"span">) {
  const c = SEVERITY_CLASS[severityKey(severity)];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.06em]",
        c.text,
        solid && cn("rounded-[4px] px-1.5 py-0.5", c.muted),
        className,
      )}
      {...props}
    >
      <span className={cn("size-[7px] shrink-0 rounded-[1.5px]", c.bg)} />
      {severityKey(severity)}
    </span>
  );
}

export function SeverityDot({
  severity,
  className,
}: {
  severity: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-[2px]",
        SEVERITY_CLASS[severityKey(severity)].bg,
        className,
      )}
    />
  );
}

/* ---- Run outcome (the GitHub check result once the run completes) ---- */

type RunOutcome =
  | "pass"
  | "fail"
  | "neutral"
  | "running"
  | "queued"
  | "cancelled"
  | "errored";

const SOLID = "text-white dark:text-background";

const RUN_OUTCOME: Record<
  RunOutcome,
  {
    label: string;
    icon: (p: IconProps) => React.JSX.Element;
    glyph: string;
    /** Filled circle with a bold icon (a finished check). */
    solid?: boolean;
    spin?: boolean;
  }
> = {
  pass: {
    label: "Passed",
    icon: Check,
    glyph: cn("bg-status-completed", SOLID),
    solid: true,
  },
  fail: {
    label: "Failed",
    icon: X,
    glyph: cn("bg-status-failed", SOLID),
    solid: true,
  },
  neutral: {
    label: "Advisory",
    icon: Minus,
    glyph: cn("bg-status-cancelled", SOLID),
    solid: true,
  },
  running: {
    label: "Running",
    icon: Spinner,
    glyph: "border border-status-running/40 text-status-running",
    spin: true,
  },
  queued: {
    label: "Queued",
    icon: Spinner,
    glyph: "border border-status-running/40 text-status-running",
    spin: true,
  },
  cancelled: {
    label: "Cancelled",
    icon: Ban,
    glyph: "border border-border text-muted-foreground",
  },
  errored: {
    label: "Errored",
    icon: AlertTriangle,
    glyph: "bg-status-pending-muted text-status-pending",
  },
};

function runOutcome(status: string, conclusion: string | null): RunOutcome {
  if (status === "completed") {
    return conclusion === "fail" || conclusion === "pass"
      ? conclusion
      : "neutral";
  }
  if (isActiveRun(status) || status === "cancelled") {
    return status as RunOutcome;
  }
  return "errored";
}

export function runOutcomeLabel(status: string, conclusion: string | null) {
  return RUN_OUTCOME[runOutcome(status, conclusion)].label;
}

/** Round glyph for a run's state: the check result once it has one. */
export function RunGlyph({
  status,
  conclusion,
  className,
}: {
  status: string;
  conclusion: string | null;
  className?: string;
}) {
  const o = RUN_OUTCOME[runOutcome(status, conclusion)];
  const Icon = o.icon;
  return (
    <span
      title={o.label}
      className={cn(
        "grid size-[22px] shrink-0 place-items-center rounded-full",
        o.glyph,
        className,
      )}
    >
      <Icon
        size={12}
        strokeWidth={o.solid ? 3 : undefined}
        className={o.spin ? "animate-spin" : undefined}
      />
    </span>
  );
}

/** Pill with the run's glyph and label. */
export function RunOutcomeBadge({
  status,
  conclusion,
}: {
  status: string;
  conclusion: string | null;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-0.5 pr-2.5 pl-1 text-xs font-medium text-foreground">
      <RunGlyph
        status={status}
        conclusion={conclusion}
        className="size-4 [&_svg]:size-[10px]"
      />
      {runOutcomeLabel(status, conclusion)}
    </span>
  );
}

/* ---- Finding source & AI verdict ---- */

const sourceLabels: Record<string, string> = {
  trivy: "trivy",
  opengrep: "opengrep",
  gitleaks: "gitleaks",
  ai: "agent",
};

export function SourceBadge({ source }: { source: string }) {
  return (
    <Pill tone={source === "ai" ? "inverse" : "muted"} className="font-mono">
      {sourceLabels[source] ?? source}
    </Pill>
  );
}

const verdictStyles: Record<
  string,
  { label: string; tone: keyof typeof pillTones; className?: string }
> = {
  confirmed: { label: "confirmed", tone: "high" },
  false_positive: {
    label: "false positive",
    tone: "muted",
    className: "line-through decoration-1",
  },
  needs_review: { label: "needs review", tone: "warning" },
};

export function VerdictBadge({
  verdict,
}: {
  verdict: string | null | undefined;
}) {
  const v = verdict ? verdictStyles[verdict] : undefined;
  if (!v) return null;
  return (
    <Pill tone={v.tone} className={cn("font-mono", v.className)}>
      {v.label}
    </Pill>
  );
}
