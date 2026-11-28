/**
 * Small illustrations for the feature cards and the review skills section.
 * Same story as mocks.tsx (acme/storefront#482) where it fits.
 */
import { Check, GitBranch, Key, X } from "@/components/icons";
import { SeverityBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Eyebrow, Sheet } from "./primitives";

/* ---------------------- Scanners that follow the diff --------------------- */

export function LanguageRulesVisual() {
  const rows: [string, number, boolean][] = [
    ["js", 163, true],
    ["python", 188, true],
    ["jvm", 362, false],
    ["go", 59, false],
    ["csharp", 44, false],
    ["swift", 25, false],
  ];
  return (
    <Sheet className="w-full p-4">
      <div className="flex items-center justify-between">
        <Eyebrow>OpenGrep rules</Eyebrow>
        <span className="font-mono text-[11px] text-pebble">
          351 of 977 loaded
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {rows.map(([lang, n, on]) => (
          <div
            key={lang}
            className={cn(
              "flex items-center justify-between rounded-[5px] border px-2.5 py-1.5 font-mono text-[11.5px]",
              on
                ? "border-brand/30 bg-brand/[0.08] text-ink"
                : "border-rule text-pebble",
            )}
          >
            <span>{lang}</span>
            <span>{n}</span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/* ------------------------- Every commit, not the tip ----------------------- */

export function CommitHistoryVisual() {
  const commits = [
    { sha: "a41c9e0", msg: "add order search", key: false },
    { sha: "7d2f13b", msg: "wire up stripe", key: true },
    { sha: "c90b6e2", msg: "move key to env", key: false, removed: true },
  ];
  return (
    <Sheet className="w-full p-4">
      <Eyebrow>Gitleaks · 3 commits</Eyebrow>
      <ol className="relative mt-3 space-y-2.5 pl-5">
        <span className="absolute top-1.5 bottom-1.5 left-[6px] w-px bg-rule-strong" />
        {commits.map((c) => (
          <li key={c.sha} className="relative">
            <span
              className={cn(
                "absolute top-[5px] -left-5 size-[13px] rounded-full border-2 border-chalk",
                c.key ? "bg-severity-high" : "bg-rule-strong",
              )}
            />
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[11.5px] text-stone">
                {c.sha}
              </span>
              <span className="truncate text-[12.5px] text-ink">{c.msg}</span>
            </div>
            {c.key && (
              <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-severity-high">
                <Key size={11} /> + STRIPE_KEY = "sk_live_••••"
              </p>
            )}
            {c.removed && (
              <p className="mt-0.5 font-mono text-[11px] text-stone">
                − removed, still in history
              </p>
            )}
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

/* -------------------------- Malicious packages ----------------------------- */

export function MaliciousPackageVisual() {
  return (
    <Sheet className="w-full space-y-2.5 p-4">
      <div className="rounded-[6px] border border-severity-critical/30 bg-severity-critical-muted px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <SeverityBadge severity="critical" />
          <span className="font-mono text-[10.5px] text-severity-critical">
            AI can't dismiss
          </span>
        </div>
        <p className="mt-1.5 text-[13px] font-medium text-ink">
          Malicious package: flatmap-stream@0.1.1
        </p>
        <p className="font-mono text-[11px] text-stone">
          OpenSSF malicious packages
        </p>
      </div>
      <div className="rounded-[6px] border border-rule px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] text-ink">zlib@cacf7f1d4e3d</span>
          <SeverityBadge severity="critical" />
        </div>
        <p className="font-mono text-[11px] text-stone">
          third_party/zlib · CVE-2022-37434
        </p>
      </div>
    </Sheet>
  );
}

/* ------------------------------ CI pipelines ------------------------------- */

export function PipelineVisual() {
  return (
    <Sheet className="w-full overflow-hidden">
      <div className="flex items-center justify-between border-b border-rule px-4 py-2">
        <span className="font-mono text-[11.5px] text-ink">.gitlab-ci.yml</span>
        <span className="font-mono text-[10.5px] text-pebble">poutine</span>
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[11.5px] leading-[1.7] text-ink-2">
        {"build:\n  script:\n"}
        <span className="block bg-severity-high/[0.12]">
          {'    - echo "$CI_MERGE_REQUEST_TITLE"'}
        </span>
        <span className="block bg-severity-low/[0.12]">
          {"    - curl -s https://x.sh | bash"}
        </span>
      </pre>
      <div className="flex flex-wrap gap-1.5 border-t border-rule px-4 py-2.5">
        {["GitHub Actions", "GitLab CI", "Azure Pipelines", "Tekton"].map(
          (c) => (
            <span
              key={c}
              className="rounded-full border border-rule px-2 py-0.5 text-[11px] text-stone"
            >
              {c}
            </span>
          ),
        )}
      </div>
    </Sheet>
  );
}

/* --------------------------- OpenAPI / OWASP API --------------------------- */

export function ApiSpecVisual() {
  return (
    <Sheet className="w-full overflow-hidden">
      <div className="flex items-center justify-between border-b border-rule px-4 py-2">
        <span className="font-mono text-[11.5px] text-ink">
          api/openapi.yaml
        </span>
        <span className="font-mono text-[10.5px] text-pebble">spectral</span>
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[11.5px] leading-[1.7] text-ink-2">
        {"/orders/{id}:\n"}
        <span className="block bg-severity-medium/[0.14]">{"  delete:"}</span>
        {"    responses:\n      '204': { description: deleted }"}
      </pre>
      <div className="flex items-center gap-2 border-t border-rule px-4 py-2.5">
        <SeverityBadge severity="medium" />
        <span className="truncate text-[12px] text-ink">
          Write operation with no security scheme
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-pebble">
          API2
        </span>
      </div>
    </Sheet>
  );
}

/* ----------------------- The PR can't switch it off ------------------------ */

export function HardeningVisual() {
  const ignored = [
    "# nosemgrep",
    ".semgrepignore",
    "gitleaks:allow",
    ".gitleaksignore",
    "osv-scanner.toml",
    ".github/poutine.yml",
    "# zizmor: ignore",
    ".gitignore",
  ];
  return (
    <Sheet className="w-full p-4">
      <div className="flex items-center justify-between">
        <Eyebrow>Read from the PR</Eyebrow>
        <span className="font-mono text-[11px] text-pebble">ignored</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {ignored.map((i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-[4px] border border-rule bg-paper/60 px-2 py-1 font-mono text-[11px] text-stone"
          >
            <X size={9} strokeWidth={3} className="text-severity-critical" />
            <span className="line-through decoration-stone/50">{i}</span>
          </span>
        ))}
      </div>
    </Sheet>
  );
}

/* ------------------------------ Review skills ------------------------------ */

export function SkillImportPanel() {
  return (
    <Sheet className="w-full p-5">
      <Eyebrow>Add skill</Eyebrow>
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-[6px] bg-paper-2 p-1 text-center text-[12.5px]">
        {["Import URL", "Upload", "Paste"].map((t, i) => (
          <span
            key={t}
            className={cn(
              "rounded-[4px] py-1",
              i === 0 ? "bg-chalk text-ink shadow-sm" : "text-stone",
            )}
          >
            {t}
          </span>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-[6px] border border-rule-strong bg-chalk px-3 py-2 font-mono text-[12px] text-ink-2">
        <span className="truncate">skills.sh/acme/payments-review</span>
        <span className="ml-auto shrink-0 rounded-[4px] bg-ink px-2 py-0.5 font-sans text-[11.5px] text-paper">
          Fetch
        </span>
      </div>
      <div className="mt-3 rounded-[6px] border border-rule bg-paper/50 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink">
            payments-review
          </span>
          <span className="font-mono text-[11px] text-pebble">18 KB</span>
        </div>
        <p className="mt-1 text-[12px] leading-snug text-stone">
          Amounts are integers in minor units. Refunds must check the original
          charge's owner. Webhooks verify the signature before parsing.
        </p>
      </div>
      <p className="mt-3 font-mono text-[11px] text-pebble">
        up to 512 KB each · 2 MB per review
      </p>
    </Sheet>
  );
}

export function SkillListPanel() {
  const skills: [string, string, boolean][] = [
    ["OWASP ASVS checklist", "built-in", true],
    ["API security", "built-in", true],
    ["LLM application security", "built-in", false],
    ["CI/CD security", "built-in", false],
    ["payments-review", "skills.sh", true],
    ["tenancy-rules.md", "upload", true],
  ];
  return (
    <Sheet className="w-full overflow-hidden">
      <div className="flex items-center justify-between border-b border-rule px-5 py-3">
        <Eyebrow>Skills · acme/storefront</Eyebrow>
        <GitBranch size={13} className="text-pebble" />
      </div>
      <ul className="divide-y divide-rule">
        {skills.map(([name, src, on]) => (
          <li key={name} className="flex items-center gap-3 px-5 py-2.5">
            <span
              className={cn(
                "grid size-4 shrink-0 place-items-center rounded-[4px] border",
                on ? "border-brand bg-brand text-paper" : "border-rule-strong",
              )}
            >
              {on && <Check size={10} strokeWidth={3.5} />}
            </span>
            <span className={cn("text-[13px]", on ? "text-ink" : "text-stone")}>
              {name}
            </span>
            <span className="ml-auto font-mono text-[11px] text-pebble">
              {src}
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
