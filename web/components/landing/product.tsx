/**
 * Product pictures for the marketing site, drawn with the dashboard's own
 * components (components/dashboard) inside its `.dash` theme, so they look
 * exactly like the app. They all show one review: acme/storefront#482 adds
 * an order search endpoint and its OpenAPI spec. OpenGrep flags a SQL
 * injection the agent confirms and a path traversal it dismisses, Spectral
 * flags a DELETE with no security scheme, OSV-Scanner flags a lodash
 * advisory that predates the pull request, and the agent adds an IDOR it
 * found reading the diff. Trivy, zizmor and poutine skip: the pull request
 * touches no infrastructure, workflow or pipeline file.
 */
import {
  AGENT_INFO,
  CREDENTIAL_INFO,
  SCANNER_INFO,
  type Scanner,
  SKILL_LIMITS,
} from "@openvscan/core";
import { type ReactNode, useState } from "react";
import { AgentLogo } from "@/components/brand/AgentLogo";
import {
  AiSummary,
  blocks,
  type Finding,
  FindingRow,
  Findings,
  type RunDetail,
  ScannerStats,
  Verdict,
} from "@/components/dashboard/run";
import {
  CheckCard,
  Panel,
  SettingRow,
  TabBar,
} from "@/components/dashboard/ui";
import { Key, Lock, Plus, Trash } from "@/components/icons";
import { Pill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* The demo review                                                             */
/* -------------------------------------------------------------------------- */

const SHA = "3f9c2e1b7d04a6c58e2f91b3a7d6c0e4f5a8b912";
const MINUTE = 60_000;
// Fixed relative to page load, so "took 3m 12s" never drifts.
const COMPLETED = new Date(Date.now() - 2 * MINUTE);
const STARTED = new Date(COMPLETED.getTime() - 192_000);

const SECRET_DESCRIPTION =
  "A credential-like value is committed to the repository. Anyone with read access to the repository (or its history) can use it.";
const SECRET_REMEDIATION =
  "Revoke and rotate the credential, remove it from the code, and load it from a secret manager or environment variable instead.";

let nextId = 0;
function finding(
  f: Partial<Finding> & Pick<Finding, "source" | "title" | "severity">,
): Finding {
  nextId += 1;
  return {
    id: `demo-${nextId}`,
    runId: "demo",
    ruleId: null,
    description: "",
    filePath: null,
    startLine: null,
    endLine: null,
    inDiff: true,
    cwe: null,
    remediation: null,
    suggestion: null,
    fingerprint: `demo-${nextId}`,
    aiVerdict: null,
    aiReasoning: null,
    commented: false,
    metadata: null,
    createdAt: COMPLETED,
    ...f,
  };
}

const SQLI = finding({
  source: "opengrep",
  ruleId: "opengrep.javascript.express.security.injection.tainted-sql-string",
  title: "Tainted sql string (CWE-89)",
  description:
    "User input from req.query reaches a SQL string built with a template literal. Use parameterized queries instead.",
  severity: "high",
  filePath: "api/orders/search.ts",
  startLine: 14,
  endLine: 14,
  cwe: "CWE-89",
  aiVerdict: "confirmed",
  aiReasoning:
    "req.query.q goes straight into db.query(). This pull request removed the sanitizeSearch() call that used to escape it.",
  remediation: "Pass the search term as a bound parameter.",
  suggestion: `  const rows = await db.query(\n    'SELECT * FROM orders WHERE note LIKE ?',\n    [\`%${"$"}{q}%\`],\n  );`,
});

const IDOR = finding({
  source: "ai",
  title: "Order lookup doesn't check who owns the order",
  description:
    "GET /orders/:id loads the order by id and returns it without comparing order.user_id to the signed-in user, so any customer can read any order.",
  severity: "high",
  filePath: "api/orders/[id].ts",
  startLine: 22,
  endLine: 24,
  cwe: "CWE-639",
  remediation:
    "Scope the query to the session's user: WHERE id = ? AND user_id = ?.",
});

const SPEC = finding({
  source: "spectral",
  ruleId: "owasp:api2:2023-write-restricted",
  title: "Unauthenticated write operation",
  description:
    "This write operation is not protected by any security scheme. (at paths./orders/{id}.delete)",
  severity: "medium",
  filePath: "api/openapi.yaml",
  startLine: 41,
  cwe: "CWE-306",
  aiVerdict: "confirmed",
  aiReasoning:
    "The route handler checks the session, but the spec tells API clients and gateways it's public.",
});

const TRAVERSAL = finding({
  source: "opengrep",
  ruleId:
    "opengrep.javascript.lang.security.audit.path-traversal.path-join-resolve-traversal",
  title: "Path join resolve traversal (CWE-22)",
  description:
    "A file path is built from a variable that may come from user input.",
  severity: "medium",
  filePath: "api/receipts.ts",
  startLine: 31,
  cwe: "CWE-22",
  aiVerdict: "false_positive",
  aiReasoning:
    "The file name comes from RECEIPT_TEMPLATES, a fixed allowlist on line 28, never from the request.",
});

const LODASH = finding({
  source: "osv",
  ruleId: "GHSA-35jh-r3h4-6jhm",
  title: "lodash@4.17.20: Command Injection in lodash",
  description:
    "lodash versions prior to 4.17.21 are vulnerable to Command Injection via the template function.",
  severity: "high",
  filePath: "pnpm-lock.yaml",
  inDiff: false,
  cwe: "CWE-77",
  remediation: "Upgrade lodash to 4.17.21 or later.",
});

const stat = (
  status: "ok" | "skipped",
  findings: number,
  durationMs?: number,
) =>
  status === "skipped"
    ? { status, findings: 0, reason: "No relevant files changed" }
    : { status, findings, durationMs };

export const DEMO_FINDINGS = {
  sqli: SQLI,
  idor: IDOR,
  spec: SPEC,
  traversal: TRAVERSAL,
  lodash: LODASH,
};

export const DEMO_RUN = {
  id: "demo",
  repositoryId: "demo",
  pullRequestId: "demo",
  trigger: "pull_request",
  status: "completed",
  phase: "done",
  conclusion: "fail",
  headRef: "feat/order-search",
  headSha: SHA,
  baseSha: null,
  scanners: [
    "opengrep",
    "osv",
    "gitleaks",
    "trivy",
    "zizmor",
    "poutine",
    "spectral",
  ],
  agent: "claude",
  agentModel: "sonnet",
  failOn: "high",
  instructions: null,
  focus: [],
  ignorePaths: [],
  aiSummary:
    "This pull request adds an order search endpoint. It removes input sanitization and builds SQL from the query string, and a new lookup route returns any order by id without checking who owns it. The OpenAPI spec adds a DELETE route with no security scheme.",
  aiRisk: "high",
  aiError: null,
  aiSkipped: null,
  counts: { critical: 0, high: 2, medium: 1, low: 0, info: 0 },
  scannerStats: {
    opengrep: stat("ok", 2, 41_200),
    osv: stat("ok", 1, 6_800),
    gitleaks: stat("ok", 0, 3_100),
    trivy: stat("skipped", 0),
    zizmor: stat("skipped", 0),
    poutine: stat("skipped", 0),
    spectral: stat("ok", 1, 2_400),
  },
  filesChanged: 6,
  checkRunId: "1",
  reviewId: "1",
  error: null,
  cancelRequested: false,
  startedAt: STARTED,
  completedAt: COMPLETED,
  createdAt: STARTED,
  updatedAt: COMPLETED,
  repository: { id: "demo", fullName: "acme/storefront" },
  pullRequest: {
    id: "demo",
    number: 482,
    title: "Add order search endpoint",
    url: "https://github.com",
    headRef: "feat/order-search",
    baseRef: "main",
  },
  findings: [SQLI, IDOR, SPEC, TRAVERSAL, LODASH],
  logs: [],
  skills: [
    {
      id: "builtin:api-security",
      name: "API security",
      builtin: true,
      missing: false,
    },
    {
      id: "demo-skill",
      name: "payments-review",
      builtin: false,
      missing: false,
    },
  ],
} as unknown as RunDetail;

/* -------------------------------------------------------------------------- */
/* Shared framing                                                              */
/* -------------------------------------------------------------------------- */

/** The signed-in app's theme and type, so a panel renders as it does there. */
export function Dash({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("dash w-full font-sans text-foreground", className)}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

export function HeroVerdict() {
  return (
    <Dash>
      <Verdict run={DEMO_RUN} stacked />
    </Dash>
  );
}

export function HeroFindings({
  limit = 3,
  className,
}: {
  limit?: number;
  className?: string;
}) {
  return (
    <Dash className={className}>
      <Findings run={DEMO_RUN} collapsed githubLinks={false} limit={limit} />
    </Dash>
  );
}

export function HeroScanners() {
  return (
    <Dash>
      <ScannerStats run={DEMO_RUN} />
    </Dash>
  );
}

/* -------------------------------------------------------------------------- */
/* What's new: one finding or panel per feature                                */
/* -------------------------------------------------------------------------- */

/** A single finding as it appears in a review's findings list. */
function FindingCard({
  finding: f,
  open,
}: {
  finding: Finding;
  open?: boolean;
}) {
  return (
    <Dash>
      <Panel>
        <FindingRow
          finding={f}
          run={DEMO_RUN}
          blocking={blocks(f, DEMO_RUN)}
          defaultOpen={open ?? false}
          githubLinks={false}
        />
      </Panel>
    </Dash>
  );
}

export function LanguageRulesVisual() {
  const run = {
    ...DEMO_RUN,
    scanners: ["opengrep", "trivy", "zizmor"],
  } as RunDetail;
  return (
    <Dash>
      <ScannerStats run={run} />
    </Dash>
  );
}

export function CommitHistoryVisual() {
  return (
    <FindingCard
      open
      finding={finding({
        source: "gitleaks",
        ruleId: "stripe-access-token",
        title: "Hard-coded secret: Stripe Access Token",
        description: `${SECRET_DESCRIPTION} It was added in commit 8c41f0a2e9b1 of this pull request and removed by a later one, but it is still in the branch's history.`,
        severity: "high",
        filePath: "api/payments/client.ts",
        cwe: "CWE-798",
        remediation: SECRET_REMEDIATION,
      })}
    />
  );
}

export function MaliciousPackageVisual() {
  return (
    <FindingCard
      open
      finding={finding({
        source: "osv",
        ruleId: "MAL-2025-20690",
        title: "Malicious package: flatmap-stream@0.1.1",
        description: "This package version is known to be malicious.",
        severity: "critical",
        filePath: "package-lock.json",
        remediation:
          "Remove flatmap-stream now, treat any machine that installed it as compromised, and rotate the credentials it could reach.",
      })}
    />
  );
}

export function PipelineVisual() {
  return (
    <FindingCard
      open
      finding={finding({
        source: "poutine",
        ruleId: "injection",
        title:
          "Injection with Arbitrary External Contributor Input (job build)",
        description:
          "The pipeline contains an injection into bash or JavaScript with an expression that can contain user input.\n\nSources: CI_MERGE_REQUEST_TITLE",
        severity: "medium",
        filePath: ".gitlab-ci.yml",
        startLine: 7,
      })}
    />
  );
}

export function ApiSpecVisual() {
  return <FindingCard open finding={SPEC} />;
}

const HARDENING: [string, string[]][] = [
  ["OpenGrep", ["nosemgrep", ".semgrepignore"]],
  ["Gitleaks", ["gitleaks:allow", ".gitleaksignore", ".gitleaks.toml"]],
  ["OSV-Scanner", ["osv-scanner.toml", ".gitignore"]],
  ["zizmor", ["zizmor.yml", "# zizmor: ignore"]],
  ["poutine", [".poutine.yml"]],
  ["Trivy", [".trivyignore", "trivy.yaml"]],
];

export function HardeningVisual() {
  return (
    <Dash>
      <Panel title="Ignored in the pull request">
        <div className="divide-y divide-border">
          {HARDENING.map(([scanner, files]) => (
            <div
              key={scanner}
              className="flex items-center justify-between gap-3 px-5 py-2.5"
            >
              <span className="text-[13px] font-medium text-foreground">
                {scanner}
              </span>
              <span className="flex flex-wrap justify-end gap-1">
                {files.map((f) => (
                  <Pill
                    key={f}
                    tone="outline"
                    className="font-mono line-through decoration-1"
                  >
                    {f}
                  </Pill>
                ))}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </Dash>
  );
}

/* -------------------------------------------------------------------------- */
/* Review skills                                                               */
/* -------------------------------------------------------------------------- */

const INLINE_CODE =
  "rounded-[4px] bg-muted px-1 font-mono text-[12px] text-foreground";

/** Settings → Review skills, importing from skills.sh. */
export function SkillsPanel() {
  const [tab, setTab] = useState("url");
  return (
    <Dash>
      <Panel
        title="Your skills"
        description={`2 of ${SKILL_LIMITS.perUser}`}
        actions={
          <Button size="sm" variant="outline" tabIndex={-1}>
            <Plus />
            Add skill
          </Button>
        }
      >
        <div className="space-y-4 border-b border-border px-5 py-4">
          <div className="border-b border-border">
            <TabBar
              label="Add a skill"
              value={tab}
              onChange={setTab}
              tabs={[
                { key: "paste", label: "Paste" },
                { key: "upload", label: "Upload" },
                { key: "url", label: "Import URL" },
              ]}
            />
          </div>
          <Field label="URL" htmlFor="demo-skill-url">
            <Input
              id="demo-skill-url"
              readOnly
              value="https://skills.sh/acme/review-skills/payments-review"
              className="font-mono text-[13px]"
            />
          </Field>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            A file on GitHub, a gist, or a{" "}
            <code className={INLINE_CODE}>skills.sh</code> skill page. Up to{" "}
            {SKILL_LIMITS.body / 1024} KB, fetched once and saved as a copy.
          </p>
        </div>
        <ul className="divide-y divide-border">
          {[
            {
              name: "payments-review",
              label: "Imported",
              tone: "outline" as const,
              description:
                "All amounts are integer cents. Flag float arithmetic on money and refunds without an idempotency key.",
              meta: "Updated 2d ago · skills.sh",
            },
            {
              name: "tenant-isolation",
              label: "Pasted",
              tone: "outline" as const,
              description:
                "Every query on a tenant table filters by org_id from the session, never from the request.",
              meta: "Updated 5d ago",
            },
          ].map((s) => (
            <li key={s.name} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-medium text-foreground">
                  {s.name}
                </span>
                <Pill tone={s.tone}>{s.label}</Pill>
              </div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                {s.description}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">{s.meta}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </Dash>
  );
}

/** Repository → Review policy → Review skills, and the review that used them. */
export function SkillPickerPanel() {
  const [picked, setPicked] = useState([
    "builtin:api-security",
    "payments-review",
  ]);
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const options = [
    {
      id: "builtin:api-security",
      title: "API security",
      description: "OWASP API Top 10 checks for HTTP handlers.",
    },
    {
      id: "payments-review",
      title: "payments-review (yours)",
      description: "How we handle money.",
    },
    {
      id: "builtin:owasp-asvs",
      title: "OWASP ASVS checklist",
      description: "Verification requirements by area.",
    },
    {
      id: "tenant-isolation",
      title: "tenant-isolation (yours)",
      description: "Org scoping on every query.",
    },
  ];
  return (
    <Dash className="space-y-4">
      <Panel>
        <div className="px-5 py-4">
          <div className="text-[14px] font-medium text-foreground">
            Review skills
          </div>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Instructions the reviewer reads and applies, in the order picked.
          </p>
          <div className="mt-3 grid gap-2">
            {options.map((o) => (
              <CheckCard
                key={o.id}
                compact
                checked={picked.includes(o.id)}
                onChange={() => toggle(o.id)}
                title={o.title}
                description={o.description}
              />
            ))}
          </div>
        </div>
      </Panel>
      <AiSummary run={DEMO_RUN} />
    </Dash>
  );
}

/* -------------------------------------------------------------------------- */
/* Numbered details                                                            */
/* -------------------------------------------------------------------------- */

export function DiffScopePanel() {
  return (
    <Dash className="max-w-[520px]">
      <Findings run={DEMO_RUN} collapsed githubLinks={false} />
    </Dash>
  );
}

const FAIL_OPTIONS = [
  { value: "critical", label: "Critical only" },
  { value: "high", label: "High or above" },
  { value: "medium", label: "Medium or above" },
  { value: "low", label: "Low or above" },
  { value: "never", label: "Never (report only)" },
] as const;

export function PolicyPanel() {
  const [failOn, setFailOn] =
    useState<(typeof FAIL_OPTIONS)[number]["value"]>("high");
  const rows: [string, string][] = [
    ["Reviews", "Every push"],
    ["Branches", "main"],
    [
      "Scanners",
      (DEMO_RUN.scanners as Scanner[])
        .map((s) => SCANNER_INFO[s].label)
        .join(", "),
    ],
    ["AI reviewer", `${AGENT_INFO.claude.label} · sonnet`],
    ["Skills", "2 selected"],
  ];
  return (
    <Dash className="max-w-[480px] space-y-4">
      <Panel title="Review policy">
        <dl className="divide-y divide-border text-[13px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-5 py-2.5">
              <dt className="shrink-0 text-muted-foreground">{k}</dt>
              <dd className="min-w-0 text-right text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <Panel>
        <SettingRow
          title="Fail the check on"
          description="Findings in the diff at or above this severity. AI-dismissed findings never fail it."
        >
          <Select
            aria-label="Fail the check on"
            value={failOn}
            onChange={setFailOn}
            options={FAIL_OPTIONS}
            className="w-full sm:w-[180px]"
          />
        </SettingRow>
      </Panel>
    </Dash>
  );
}

/** Settings → AI agents, with the credential saved. */
export function CredentialPanel() {
  const info = AGENT_INFO.claude;
  return (
    <Dash className="max-w-[500px] space-y-4">
      <Panel>
        <div className="flex items-start gap-4 px-5 py-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-[8px] border border-transparent bg-background shadow-edge">
            <AgentLogo agent="claude" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold text-foreground">
                {info.label}
              </span>
              <code className="rounded-[4px] bg-muted px-1.5 py-px font-mono text-[11px] text-muted-foreground">
                {info.cmd}
              </code>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-status-completed">
                <span className="size-1.5 rounded-full bg-status-completed" />
                Connected
              </span>
            </div>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {info.blurb}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-5 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <Key size={14} className="text-muted-foreground" />
              {CREDENTIAL_INFO.claude_oauth_token.label}
            </span>
            <span className="font-mono text-[12px] text-muted-foreground">
              sk-ant-oat01-…Q7wA
            </span>
            <span className="text-[12px] text-muted-foreground">
              Used 2m ago
            </span>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" tabIndex={-1}>
              Replace
            </Button>
            <Button
              size="sm"
              variant="ghost"
              tabIndex={-1}
              aria-label="Remove credential"
              className="text-destructive hover:bg-destructive/[0.07] hover:text-destructive"
            >
              <Trash />
            </Button>
          </div>
        </div>
      </Panel>
      <Panel title="Inside the sandbox">
        <div className="space-y-1 px-5 py-3.5 font-mono text-[12.5px] leading-[1.7]">
          <div className="text-foreground">
            CLAUDE_CODE_OAUTH_TOKEN=
            <span className="text-muted-foreground">placeholder</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Lock size={12} className="text-accent-brand" />
            swapped for the real token at egress, on api.anthropic.com only
          </div>
        </div>
      </Panel>
    </Dash>
  );
}

const EGRESS: [string, string, string][] = [
  ["checkout", "github.com, this repository only", "read-only token"],
  ["scan", "api.osv.dev, package names only", "OSV-Scanner"],
  ["agent", "your model API", "key swapped in"],
  ["locked", "nothing", "every other step"],
];

export function EgressPanel() {
  return (
    <Dash className="max-w-[520px]">
      <Panel
        title="Sandbox network"
        description="What the container can reach, by phase"
      >
        <div className="eyebrow hidden grid-cols-[84px_minmax(0,1fr)_auto] gap-3 border-b border-border bg-muted/50 px-5 py-2 text-[10.5px] text-muted-foreground sm:grid">
          <span>Phase</span>
          <span>Can reach</span>
          <span>Note</span>
        </div>
        <div className="divide-y divide-border">
          {EGRESS.map(([phase, host, note]) => (
            <div
              key={phase}
              className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-3 px-5 py-2.5 sm:grid-cols-[84px_minmax(0,1fr)_auto]"
            >
              <span className="font-mono text-[12.5px] text-foreground">
                {phase}
              </span>
              <span className="truncate text-[13px] text-foreground">
                {host}
              </span>
              <span className="hidden text-[12.5px] text-muted-foreground sm:inline">
                {note}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </Dash>
  );
}

/* -------------------------------------------------------------------------- */
/* Terminals                                                                   */
/* -------------------------------------------------------------------------- */

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
