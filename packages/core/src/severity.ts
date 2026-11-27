import { type AiVerdict, type FailThreshold, SEVERITIES, type Severity } from "./enums";

/** 0 = critical … 4 = info. Lower is more severe. */
export function severityRank(s: Severity): number {
  return SEVERITIES.indexOf(s);
}

/** Does a finding of severity `s` trip the given fail threshold? */
export function meetsThreshold(s: Severity, threshold: FailThreshold): boolean {
  if (threshold === "never") return false;
  return severityRank(s) <= severityRank(threshold);
}

/** The fields that decide whether a finding gates a run. */
export interface GateFinding {
  severity: Severity;
  inDiff: boolean;
  aiVerdict: AiVerdict | null;
}

/** A finding counts unless the AI dismissed it; on a PR it must also be in the diff. */
export function isRelevant(f: GateFinding, isPr: boolean): boolean {
  return f.aiVerdict !== "false_positive" && (!isPr || f.inDiff);
}

/** Does this finding fail the run? The same rule decides the GitHub check. */
export function isBlocking(f: GateFinding, ctx: { isPr: boolean; failOn: FailThreshold }): boolean {
  return isRelevant(f, ctx.isPr) && meetsThreshold(f.severity, ctx.failOn);
}

/** Normalise a scanner's free-form severity string. */
export function normalizeSeverity(raw: unknown): Severity {
  const v = String(raw ?? "").toLowerCase();
  switch (v) {
    case "critical":
      return "critical";
    case "high":
    case "error":
      return "high";
    case "medium":
    case "moderate":
    case "warning":
      return "medium";
    case "low":
    case "note":
      return "low";
    default:
      return "info";
  }
}

export type SeverityCounts = Record<Severity, number>;

export function emptyCounts(): SeverityCounts {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

export function countBySeverity(items: { severity: Severity }[]): SeverityCounts {
  const c = emptyCounts();
  for (const i of items) c[i.severity]++;
  return c;
}
