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
  it("does not pass a run on an AI dismissal of a blocking finding", () => {
    // Would block without the dismissal: neutral, so a person looks.
    expect(decideConclusion([f({ aiVerdict: "false_positive" })], ctx)).toBe("neutral");
    // Below the threshold or outside the diff, a dismissal is just noise removed.
    expect(decideConclusion([f({ aiVerdict: "false_positive", severity: "low" })], ctx)).toBe("pass");
    expect(decideConclusion([f({ aiVerdict: "false_positive", inDiff: false })], ctx)).toBe("pass");
  });
  it("never lets the AI dismiss a committed secret", () => {
    const secret = f({ source: "gitleaks", aiVerdict: "false_positive", aiReasoning: "test fixture" });
    expect(decideConclusion([secret], ctx)).toBe("fail");
    expect(buildSummaryComment([secret], "fail", ctx)).not.toContain("dismissed by the AI");
  });
  it("lists overruled findings in the summary", () => {
    const body = buildSummaryComment([f({ aiVerdict: "false_positive" })], "neutral", ctx);
    expect(body).toContain("would otherwise block");
    expect(body).toContain("Tainted sql string");
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

  it("leaves no images, links, bare URLs or issue references", () => {
    const out = sanitize(
      "see ![x](https://evil.test/?d=secret) and [click](http://evil.test) [r]: https://evil.test www.evil.test fixes #12, owner/repo#3, GH-4",
    );
    // Brackets are escaped, so neither the image nor the link renders.
    expect(out).not.toMatch(/(^|[^\\])!\[/);
    expect(out).not.toMatch(/(^|[^\\])\]\(/);
    expect(out).not.toMatch(/https?:\/\//);
    expect(out).not.toMatch(/www\./);
    expect(out).not.toMatch(/#\d|GH-\d/);
    // Still readable: only zero-width spaces and backslashes were added.
    expect(out.replace(/[\u200b\\]/g, "")).toContain("fixes #12, owner/repo#3, GH-4");
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

  it("lists the scanners that ran, not a fixed set", () => {
    const body = buildSummaryComment([], "pass", { ...ctx, scannersRan: ["opengrep", "osv", "spectral"], scannersSkipped: 3 });
    expect(body).toContain("Scanners: OpenGrep · OSV-Scanner · Spectral (OWASP API) (3 skipped: no relevant files changed) · AI: Claude Code");
    expect(body).not.toContain("Trivy");
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
