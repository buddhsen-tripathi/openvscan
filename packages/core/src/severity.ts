import { type AiVerdict, type FailThreshold, type FindingSource, SEVERITIES, type Severity } from "./enums";

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
  source: FindingSource;
  ruleId?: string | null;
  severity: Severity;
  inDiff: boolean;
  aiVerdict: AiVerdict | null;
}

/**
 * Can the AI's "false positive" verdict take this finding out of the gate?
 * Not for committed secrets or known-malicious packages: the AI reads
 * attacker-controlled code, and a comment like "test fixture" must not be
 * enough to wave a live key or a backdoored dependency through. Its
 * reasoning is still shown.
 */
export function aiMayDismiss(f: Pick<GateFinding, "source"> & { ruleId?: string | null }): boolean {
  if (f.source === "gitleaks") return false;
  if (f.source === "osv" && f.ruleId?.startsWith("MAL-")) return false;
  return true;
}

/** Dismissed by the AI, and the dismissal counts. */
export function isDismissed(f: Pick<GateFinding, "source" | "aiVerdict"> & { ruleId?: string | null }): boolean {
  return f.aiVerdict === "false_positive" && aiMayDismiss(f);
}

/** A finding counts unless the AI dismissed it; on a PR it must also be in the diff. */
export function isRelevant(f: GateFinding, isPr: boolean): boolean {
  return !isDismissed(f) && (!isPr || f.inDiff);
}

/** Does this finding fail the run? The same rule decides the GitHub check. */
export function isBlocking(f: GateFinding, ctx: { isPr: boolean; failOn: FailThreshold }): boolean {
  return isRelevant(f, ctx.isPr) && meetsThreshold(f.severity, ctx.failOn);
}

/**
 * Would this finding block, had the AI not dismissed it? Such a run is
 * reported as neutral, not pass, so a person looks before merging: a
 * prompt-injected agent must not be able to turn the check green.
 */
export function isOverruled(f: GateFinding, ctx: { isPr: boolean; failOn: FailThreshold }): boolean {
  return (
    isDismissed(f) &&
    f.source !== "ai" &&
    (!ctx.isPr || f.inDiff) &&
    meetsThreshold(f.severity, ctx.failOn)
  );
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
