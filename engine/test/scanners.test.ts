import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { capFindings, MAX_FINDINGS_PER_SCANNER, parseGitleaks, parseOpengrep, parseTrivy } from "../src/scanners";

// Fixtures are real outputs from the engine image run against a deliberately
// vulnerable sample repo (Flask SQLi + command injection, Express XSS/eval,
// hard-coded AWS/Stripe keys, old lodash/minimist, root Dockerfile).
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("parseTrivy", () => {
  const findings = parseTrivy(fixture("trivy.json"));

  it("maps dependency vulnerabilities to the lockfile with upgrade advice", () => {
    const deps = findings.filter((f) => f.metadata.kind === "dependency");
    expect(deps.length).toBe(8);
    for (const f of deps) {
      expect(f.filePath).toBe("package-lock.json");
      expect(f.startLine).toBeNull();
      expect(f.title).toMatch(/^(lodash|minimist)@/);
      expect(f.remediation).toMatch(/Upgrade|No fixed version/);
    }
    expect(deps.some((f) => f.severity === "critical")).toBe(true);
  });

  it("maps Dockerfile misconfigurations with line numbers", () => {
    const mis = findings.filter((f) => f.metadata.kind === "misconfiguration");
    expect(mis.length).toBe(4);
    expect(mis.every((f) => f.filePath === "Dockerfile")).toBe(true);
  });

  it("produces stable, line-independent fingerprint keys", () => {
    const keys = new Set(findings.map((f) => f.fingerprintKey));
    expect(keys.size).toBe(findings.length);
    expect([...keys].every((k) => !/:\d+$/.test(k))).toBe(true);
  });
});

describe("parseGitleaks", () => {
  const findings = parseGitleaks(fixture("gitleaks.json"));
  it("reports redacted secrets with repo-relative paths", () => {
    expect(findings.map((f) => [f.ruleId, f.filePath, f.startLine])).toEqual([
      ["aws-access-token", "app/config.js", 1],
      ["stripe-access-token", "app/config.js", 3],
    ]);
    expect(findings.every((f) => f.severity === "high" && f.cwe === "CWE-798")).toBe(true);
    expect(JSON.stringify(findings)).not.toMatch(/AKIA|sk_live/);
  });
  it("handles an empty report", () => {
    expect(parseGitleaks("[]")).toEqual([]);
    expect(parseGitleaks("null")).toEqual([]);
  });
});

describe("parseOpengrep", () => {
  const findings = parseOpengrep(fixture("opengrep.json"));

  it("keeps security rules only and drops the bundled gitleaks ports", () => {
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => !f.ruleId?.startsWith("generic.secrets.gitleaks"))).toBe(true);
    expect(findings.every((f) => !f.ruleId?.includes("best-practice"))).toBe(true);
  });

  it("strips the rules-directory prefix from rule ids and paths", () => {
    for (const f of findings) {
      expect(f.ruleId).not.toMatch(/opengrep-rules/);
      expect(f.filePath).not.toMatch(/^\/workspace/);
    }
  });

  it("collapses several rules firing on the same line into one finding", () => {
    const sqli = findings.filter((f) => f.filePath === "app/db.py" && f.startLine === 9);
    expect(sqli.length).toBe(1);
    expect((sqli[0].metadata.rules as string[]).length).toBeGreaterThan(1);
    expect(sqli[0].cwe).toBe("CWE-89");
    const cmd = findings.filter((f) => f.filePath === "app/db.py" && f.startLine === 15);
    expect(cmd.length).toBeGreaterThanOrEqual(1);
    expect(cmd[0].severity === "high" || cmd[0].severity === "critical").toBe(true);
  });
});

describe("capFindings", () => {
  it("keeps the most severe findings", () => {
    const many = Array.from({ length: MAX_FINDINGS_PER_SCANNER + 10 }, (_, i) => ({
      ...parseGitleaks(fixture("gitleaks.json"))[0],
      severity: (i < 5 ? "critical" : "low") as "critical" | "low",
    }));
    const capped = capFindings(many);
    expect(capped.length).toBe(MAX_FINDINGS_PER_SCANNER);
    expect(capped.filter((f) => f.severity === "critical").length).toBe(5);
  });
});
