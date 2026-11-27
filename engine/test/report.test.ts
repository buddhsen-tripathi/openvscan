import { isBlocking } from "@openvscan/core";
import { describe, expect, it } from "vitest";
import { buildDiffMap } from "../src/diff";
import {
  buildAnnotations,
  buildInlineComments,
  buildSummaryComment,
  decideConclusion,
  type ReportContext,
  type ReportFinding,
  sanitize,
} from "../src/report";

const base: ReportFinding = {
  id: "f1",
  source: "opengrep",
  ruleId: "python.flask.security.injection.tainted-sql-string",
  title: "Tainted sql string (CWE-89)",
  description: "User input flows into a SQL query.",
  severity: "high",
  filePath: "app/db.py",
  startLine: 9,
  endLine: 9,
  inDiff: true,
  cwe: "CWE-89",
  remediation: "Use parameterised queries.",
  suggestion: null,
  fingerprint: "fp1",
  aiVerdict: null,
  aiReasoning: null,
};
const f = (o: Partial<ReportFinding>): ReportFinding => ({ ...base, ...o });

const ctx: ReportContext = {
  isPr: true,
  failOn: "high",
  runUrl: "https://openvscan.example/dashboard/runs/run-1",
  repoFullName: "acme/app",
  headSha: "0123456789abcdef",
  agent: "claude",
  aiSummary: "The change introduces a SQL injection.",
  aiRisk: "high",
  aiError: null,
  scannerErrors: [],
};

describe("decideConclusion", () => {
  it("fails on an in-diff finding at or above the threshold", () => {
    expect(decideConclusion([f({})], ctx)).toBe("fail");
  });
  it("ignores findings outside the PR diff", () => {
    expect(decideConclusion([f({ inDiff: false })], ctx)).toBe("pass");
  });
  it("counts findings outside a diff for branch runs", () => {
    expect(decideConclusion([f({ inDiff: false })], { ...ctx, isPr: false })).toBe("fail");
  });
  it("ignores AI-dismissed false positives", () => {
    expect(decideConclusion([f({ aiVerdict: "false_positive" })], ctx)).toBe("pass");
  });
  it("respects the threshold and advisory mode", () => {
    expect(decideConclusion([f({ severity: "medium" })], ctx)).toBe("pass");
    expect(decideConclusion([f({ severity: "medium" })], { ...ctx, failOn: "medium" })).toBe("fail");
    expect(decideConclusion([f({ severity: "critical" })], { ...ctx, failOn: "never" })).toBe("neutral");
  });
  it("lists exactly the blocking findings", () => {
    const fs = [f({ id: "a" }), f({ id: "b", severity: "low" }), f({ id: "c", inDiff: false })];
    expect(fs.filter((x) => isBlocking(x, ctx)).map((x) => x.id)).toEqual(["a"]);
  });
});

describe("sanitize", () => {
  it("neutralises mentions, HTML and our hidden marker", () => {
    const out = sanitize("ping @octocat <img src=x onerror=alert(1)> <!-- openvscan:summary -->");
    expect(out).not.toMatch(/@octocat/);
    expect(out).toContain("@​octocat");
    expect(out).not.toMatch(/<img|<!--/);
  });
});

describe("buildSummaryComment", () => {
  it("summarises blocking issues, AI review, dismissals and pre-existing findings", () => {
    const body = buildSummaryComment(
      [f({}), f({ id: "x", aiVerdict: "false_positive", fingerprint: "x" }), f({ id: "y", inDiff: false, fingerprint: "y" })],
      "fail",
      ctx,
    );
    expect(body).toContain("1 blocking issue");
    expect(body).toContain("AI review");
    expect(body).toContain("dismissed by the AI");
    expect(body).toContain("pre-existing finding");
    expect(body).toContain("https://openvscan.example/dashboard/runs/run-1");
    expect(body).toContain("`app/db.py:9`");
  });
  it("is positive when nothing relevant was found", () => {
    expect(buildSummaryComment([], "pass", ctx)).toContain("No security issues found");
  });
});

describe("buildInlineComments", () => {
  const diff = buildDiffMap([
    { filename: "app/db.py", status: "modified", patch: "@@ -8,2 +8,3 @@\n name = 1\n+cur = q(name)\n return" },
  ]);
  it("comments on commentable in-diff lines and skips already-posted fingerprints", () => {
    const res = buildInlineComments([f({ startLine: 9, endLine: 9 })], diff, new Set());
    expect(res.comments).toHaveLength(1);
    expect(res.comments[0]).toMatchObject({ path: "app/db.py", line: 9 });
    expect(res.comments[0].body).toContain("Use parameterised queries.");
    expect(buildInlineComments([f({})], diff, new Set(["fp1"])).comments).toHaveLength(0);
  });
  it("adds a one-click suggestion only for an exact range", () => {
    const res = buildInlineComments(
      [f({ source: "ai", suggestion: "cur = conn.execute(SQL, (name,))", aiVerdict: "confirmed" })],
      diff,
      new Set(),
    );
    expect(res.comments[0].body).toContain("```suggestion");
  });
  it("never comments on dismissed findings or lines outside the diff", () => {
    expect(buildInlineComments([f({ aiVerdict: "false_positive" })], diff, new Set()).comments).toHaveLength(0);
    expect(buildInlineComments([f({ startLine: 40, endLine: 40 })], diff, new Set()).comments).toHaveLength(0);
  });
});

describe("buildAnnotations", () => {
  it("marks blocking findings as failures", () => {
    const [a] = buildAnnotations([f({})], ctx);
    expect(a).toMatchObject({ path: "app/db.py", start_line: 9, end_line: 9, annotation_level: "failure" });
  });
});
