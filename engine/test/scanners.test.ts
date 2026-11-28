import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aiMayDismiss } from "@openvscan/core";
import {
  capFindings,
  MAX_FINDINGS_PER_SCANNER,
  parseGitleaks,
  parseOpengrep,
  parseOsv,
  parsePoutine,
  parseSpectral,
  parseTrivy,
  parseZizmor,
  SCANNER_SPECS,
  skipReason,
} from "../src/scanners";

// Fixtures are real outputs from the engine image run against a deliberately
// vulnerable sample repo (Flask SQLi + command injection, Express XSS/eval,
// hard-coded AWS/Stripe keys, old lodash/minimist, root Dockerfile).
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("parseTrivy", () => {
  const findings = parseTrivy(fixture("trivy.json"));

  it("keeps misconfigurations only; dependencies are OSV-Scanner's", () => {
    expect(findings.length).toBe(4);
    expect(findings.every((f) => f.metadata.kind === "misconfiguration")).toBe(true);
    expect(findings.every((f) => f.filePath === "Dockerfile")).toBe(true);
  });

  it("produces stable, line-independent fingerprint keys", () => {
    const keys = new Set(findings.map((f) => f.fingerprintKey));
    expect(keys.size).toBe(findings.length);
    expect([...keys].every((k) => !/:\d+$/.test(k))).toBe(true);
  });
});

// osv.json / zizmor.json: the pinned releases run against a sample with old
// django/requests pins, lodash 4.17.15, the malicious flatmap-stream 0.1.1,
// and a pull_request_target workflow that echoes the PR title.
describe("parseOsv", () => {
  const findings = parseOsv(fixture("osv.json"));

  it("makes one finding per advisory group, on the lockfile", () => {
    const lodash = findings.filter((f) => f.metadata.package === "lodash");
    expect(lodash.length).toBe(5);
    expect(new Set(findings.map((f) => f.fingerprintKey)).size).toBe(findings.length);
    for (const f of findings) {
      expect(f.source).toBe("osv");
      expect(f.metadata.kind).toBe("dependency");
      expect(["package-lock.json", "app/requirements.txt"]).toContain(f.filePath);
    }
  });

  it("picks the nearest fixed version above the installed one", () => {
    const f = findings.find((x) => x.metadata.package === "lodash" && x.ruleId === "GHSA-35jh-r3h4-6jhm");
    expect(f?.metadata.fixedVersion).toBe("4.17.21");
    expect(f?.remediation).toBe("Upgrade lodash to 4.17.21 or later.");
    expect(f?.severity).toBe("high");
  });

  it("reports a malicious package as critical, and the AI can't dismiss it", () => {
    const mal = findings.find((f) => f.ruleId?.startsWith("MAL-"));
    expect(mal?.title).toBe("Malicious package: flatmap-stream@0.1.1");
    expect(mal?.severity).toBe("critical");
    expect(mal?.metadata.malicious).toBe(true);
    expect(aiMayDismiss({ source: "osv", ruleId: mal?.ruleId })).toBe(false);
    expect(aiMayDismiss({ source: "osv", ruleId: "GHSA-35jh-r3h4-6jhm" })).toBe(true);
  });

  it("reports a vendored C/C++ library by its directory", () => {
    const [f] = parseOsv(
      JSON.stringify({
        results: [
          {
            source: { path: "/workspace/repo/third_party/zlib" },
            packages: [
              {
                package: { name: "", version: "", ecosystem: "GIT", commit: "cacf7f1d4e3d44d871b605da3b647f07d718623f" },
                vulnerabilities: [{ id: "CVE-2022-37434", summary: "inflate heap overflow", affected: [] }],
                groups: [{ ids: ["CVE-2022-37434"], max_severity: "9.8" }],
              },
            ],
          },
        ],
      }),
    );
    expect(f.title).toBe("zlib@cacf7f1d4e3d: inflate heap overflow");
    expect(f.severity).toBe("critical");
    expect(f.metadata.kind).toBe("vendored");
    expect(f.metadata.fixedVersion).toBeNull();
    expect(f.remediation).toMatch(/vendored copy of zlib in third_party\/zlib/);
  });

  it("handles a run with no lockfiles", () => {
    expect(parseOsv("{}")).toEqual([]);
    expect(parseOsv('{"results":[]}')).toEqual([]);
  });
});

describe("parseZizmor", () => {
  const findings = parseZizmor(fixture("zizmor.json"));

  it("maps workflow findings to the file and 1-based line", () => {
    const inj = findings.find((f) => f.ruleId === "template-injection");
    expect(inj).toBeDefined();
    expect(inj?.filePath).toBe(".github/workflows/ci.yml");
    expect(inj?.startLine).toBe(10);
    expect(inj?.severity).toBe("high");
    expect(findings.find((f) => f.ruleId === "dangerous-triggers")?.startLine).toBe(2);
  });

  it("caps low-confidence findings at low severity", () => {
    const art = findings.find((f) => f.ruleId === "artipacked");
    expect(art?.metadata.confidence).toBe("Low");
    expect(art?.severity).toBe("low");
  });

  it("handles the no-workflows case", () => {
    expect(parseZizmor("[]")).toEqual([]);
  });
});

describe("scanner specs", () => {
  it("turn off the repository's own suppressions", () => {
    const argv = (n: keyof typeof SCANNER_SPECS) => SCANNER_SPECS[n].argv.join(" ");
    expect(argv("opengrep")).toContain("--disable-nosem");
    expect(argv("opengrep")).toContain("--x-ignore-semgrepignore-files");
    expect(argv("gitleaks")).toContain("--ignore-gitleaks-allow");
    expect(argv("zizmor")).toContain("--no-ignores");
    expect(argv("osv")).toContain("--config /opt/openvscan/osv-scanner.toml");
    expect(argv("osv")).toContain("--no-ignore");
    expect(argv("zizmor")).toContain("--collect=all");
    expect(argv("poutine")).toContain("--config /opt/openvscan/poutine.yml");
    expect(argv("spectral")).toContain("--ruleset /opt/spectral/ruleset.mjs");
    expect(SCANNER_SPECS.trivy.argv).toEqual(expect.arrayContaining(["--ignorefile", ""]));
  });

  it("give only OSV-Scanner network", () => {
    for (const [name, spec] of Object.entries(SCANNER_SPECS)) {
      expect(spec.egress).toBe(name === "osv" ? "scan" : "locked");
    }
  });
});

describe("skipReason", () => {
  it("skips a scanner when the PR changed nothing it reads", () => {
    expect(skipReason("osv", ["src/app.ts"])).toMatch(/No relevant/);
    expect(skipReason("osv", ["web/pnpm-lock.yaml"])).toBeNull();
    expect(skipReason("osv", ["requirements-dev.txt"])).toBeNull();
    expect(skipReason("zizmor", ["README.md"])).toMatch(/No relevant/);
    expect(skipReason("zizmor", [".github/workflows/ci.yml"])).toBeNull();
    expect(skipReason("zizmor", ["actions/setup/action.yml"])).toBeNull();
    expect(skipReason("trivy", ["deploy/Dockerfile"])).toBeNull();
    expect(skipReason("opengrep", ["README.md", "docs/a.png"])).toMatch(/No relevant/);
    expect(skipReason("opengrep", ["src/routes/login.tsx"])).toBeNull();
    expect(skipReason("opengrep", ["Sources/App/Auth.swift"])).toBeNull();
    expect(skipReason("poutine", [".gitlab-ci.yml"])).toBeNull();
    expect(skipReason("poutine", ["ci/azure-pipelines.prod.yml"])).toBeNull();
    expect(skipReason("poutine", ["src/app.ts"])).toMatch(/No relevant/);
    expect(skipReason("spectral", ["api/openapi.yaml"])).toBeNull();
  });

  it("always runs the secret scanner, and everything on branch runs", () => {
    expect(skipReason("gitleaks", ["README.md"])).toBeNull();
    expect(skipReason("osv", null)).toBeNull();
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
    expect(parseGitleaks('{"history":[],"tree":[]}')).toEqual([]);
  });

  it("reports secrets from the PR's commits, including ones removed later", () => {
    const leak = (rule: string, file: string, line: number, commit?: string) => ({
      RuleID: rule,
      Description: rule,
      File: commit ? file : `/workspace/repo/${file}`,
      StartLine: line,
      EndLine: line,
      ...(commit ? { Commit: commit, Author: "someone", Email: "a@b.c", Message: "msg" } : {}),
    });
    const findings = parseGitleaks(
      JSON.stringify({
        // git log order: newest first.
        history: [
          leak("stripe-access-token", "app/config.js", 3, "bbbbbbbbbbbbbbbbbbbb"),
          leak("aws-access-token", "app/old.js", 7, "aaaaaaaaaaaaaaaaaaaa"),
          leak("stripe-access-token", "app/config.js", 1, "aaaaaaaaaaaaaaaaaaaa"),
        ],
        tree: [leak("stripe-access-token", "app/config.js", 3), leak("github-pat", "lib/x.ts", 2)],
      }),
    );
    expect(findings.map((f) => [f.ruleId, f.filePath, f.startLine, f.metadata.commit ?? null])).toEqual([
      // In the head commit, first added by the oldest commit that has it.
      ["stripe-access-token", "app/config.js", 3, "aaaaaaaaaaaa"],
      // Pre-existing: not in the PR's history.
      ["github-pat", "lib/x.ts", 2, null],
      // Added, then deleted: no line (it's an old version of the file).
      ["aws-access-token", "app/old.js", null, "aaaaaaaaaaaa"],
    ]);
    expect(findings[2].description).toMatch(/removed by a later one/);
    expect(JSON.stringify(findings)).not.toMatch(/someone|a@b\.c|msg/);
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
    const hit = (id: string, severity: string, extra: Record<string, unknown> = {}) => ({
      check_id: `opt.opengrep-rules.python.${id}`,
      path: "/workspace/repo/app/db.py",
      start: { line: 9 },
      end: { line: 9 },
      extra: { message: "SQL built from user input", severity, metadata: { category: "security", cwe: ["CWE-89: SQL Injection"], ...extra } },
    });
    const merged = parseOpengrep(
      JSON.stringify({
        results: [
          hit("opengrep.python.flask.tainted-sql-string", "WARNING", { confidence: "MEDIUM" }),
          hit("gitlab.python.sql.python_sql_rule-hardcoded-sql-expression", "ERROR"),
          hit("opengrep.python.lang.formatted-sql-query", "WARNING", { confidence: "LOW" }),
          hit("opengrep.python.lang.audit-sql", "WARNING", { subcategory: ["audit"] }),
        ],
      }),
    );
    expect(merged.length).toBe(1);
    expect(merged[0].severity).toBe("high");
    expect(merged[0].cwe).toBe("CWE-89");
    // Low-confidence and audit-only rules are dropped before grouping.
    expect(merged[0].metadata.rules).toEqual([
      "opengrep.python.flask.tainted-sql-string",
      "gitlab.python.sql.python_sql_rule-hardcoded-sql-expression",
    ]);
  });
});

describe("parsePoutine", () => {
  // poutine.json: .gitlab-ci.yml piping curl to bash, an Azure pipeline
  // echoing the PR's branch name, and the pull_request_target workflow.
  const findings = parsePoutine(fixture("poutine.json"));

  it("reports non-GitHub pipelines, leaving GitHub workflows to zizmor", () => {
    expect(findings.map((f) => [f.ruleId, f.filePath, f.startLine, f.severity])).toEqual([
      ["unverified_script_exec", "azure-pipelines.yml", 4, "low"],
      ["unverified_script_exec", ".gitlab-ci.yml", 5, "low"],
      ["injection", "azure-pipelines.yml", 4, "medium"],
    ]);
    expect(findings[1].title).toBe("Unverified Script Execution (job build)");
  });

  it("keeps the GitHub rules zizmor has no equivalent for", () => {
    const report = (rule_id: string) =>
      JSON.stringify({
        findings: [{ rule_id, meta: { path: ".github/workflows/automerge.yml", line: 3, job: "merge" } }],
        rules: { [rule_id]: { title: rule_id, level: "error" } },
      });
    expect(parsePoutine(report("confused_deputy_auto_merge"))[0]?.severity).toBe("high");
    expect(parsePoutine(report("injection"))).toEqual([]);
    expect(parsePoutine('{"findings":null,"rules":{}}')).toEqual([]);
  });
});

describe("parseSpectral", () => {
  // spectral.json: a YAML spec with an unauthenticated GET and an http://
  // server, and a JSON one with an unauthenticated DELETE on a numeric id.
  const findings = parseSpectral(fixture("spectral.json"));

  it("keeps the OWASP security rules only, with our severities", () => {
    expect(findings.map((f) => [f.ruleId, f.filePath, f.startLine, f.severity])).toEqual([
      ["owasp:api8:2023-no-server-http", "api/openapi.yaml", 4, "low"],
      ["owasp:api2:2023-read-restricted", "api/openapi.yaml", 7, "low"],
      ["owasp:api8:2023-no-server-http", "api2/spec.json", 4, "low"],
      ["owasp:api2:2023-write-restricted", "api2/spec.json", 7, "medium"],
      ["owasp:api1:2023-no-numeric-ids", "api2/spec.json", 8, "low"],
    ]);
    expect(findings.find((f) => f.ruleId === "owasp:api2:2023-write-restricted")?.cwe).toBe("CWE-306");
  });

  it("fingerprints by the spec's JSON path, not the line", () => {
    expect(findings[1].fingerprintKey).toBe("spectral|api2:2023-read-restricted|api/openapi.yaml|paths./users/{id}.get");
    expect(parseSpectral("[]")).toEqual([]);
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
