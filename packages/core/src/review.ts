import { z } from "zod";
import { AI_VERDICTS, SEVERITIES } from "./enums";

/**
 * Contract between the engine and the headless coding agent. The agent writes
 * a JSON file matching `AgentReviewSchema`; the engine validates it with zod
 * before trusting any of it (the agent read attacker-controlled PR content,
 * so its output is untrusted input too).
 */

const shortText = (max: number) => z.string().trim().min(1).max(max);

const AgentTriageSchema = z.object({
  /** `id` of the scanner finding from the findings file the agent was given. */
  id: z.string().min(1).max(64),
  verdict: z.enum(AI_VERDICTS),
  reasoning: shortText(2000),
  /** The agent may re-rate severity after reading the code. */
  severity: z.enum(SEVERITIES).optional(),
});

const AgentFindingSchema = z.object({
  title: shortText(200),
  severity: z.enum(SEVERITIES),
  /** Repo-relative path. */
  file: shortText(500),
  line: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  /** CWE id like "CWE-89", if known. */
  cwe: z
    .string()
    .regex(/^CWE-\d{1,5}$/)
    .optional(),
  description: shortText(4000),
  /** One sentence: who sends what input, and what they gain. */
  exploit: z.string().trim().max(1000).optional(),
  /** 0–1; the engine drops findings below MIN_AI_CONFIDENCE. */
  confidence: z.number().min(0).max(1).optional(),
  remediation: z.string().trim().max(4000).optional(),
  /** Optional replacement snippet for a GitHub suggestion block. */
  suggestion: z.string().max(4000).optional(),
});

export const AgentReviewSchema = z.object({
  /** 1–3 short paragraphs summarising the security posture of the change. */
  summary: shortText(4000),
  /** Overall risk of the change as the agent sees it. */
  risk: z.enum(["none", "low", "medium", "high", "critical"]),
  triage: z.array(AgentTriageSchema).max(500).default([]),
  findings: z.array(AgentFindingSchema).max(100).default([]),
});

export type AgentReview = z.infer<typeof AgentReviewSchema>;

/** AI findings below this confidence are discarded by the engine. */
export const MIN_AI_CONFIDENCE = 0.8;

/** JSON shape embedded in the agent prompt. */
export const AGENT_REVIEW_FORMAT = `{
  "summary": string,       // 2-4 sentences: what the change does, security-wise
  "risk": "none" | "low" | "medium" | "high" | "critical",
  "triage": [              // exactly one per scanner finding
    { "id": string, "verdict": "confirmed" | "false_positive" | "needs_review",
      "reasoning": string, // one or two sentences citing file:line
      "severity"?: "critical" | "high" | "medium" | "low" | "info" }
  ],
  "findings": [            // new issues only; [] is a good answer
    { "title": string,     // <= 80 chars
      "severity": "critical" | "high" | "medium" | "low",
      "confidence": number, // 0-1
      "file": string, "line": number, "endLine"?: number,
      "cwe"?: "CWE-<n>",
      "description": string, // one paragraph: the flaw and where input comes from
      "exploit": string,     // one sentence: attacker, input, impact
      "remediation": string,
      "suggestion"?: string } // replaces exactly lines line..endLine
  ]
}`;
