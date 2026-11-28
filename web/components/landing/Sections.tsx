import { AGENT_INFO, type AgentProvider } from "@openvscan/core";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AgentLogo } from "@/components/brand/AgentLogo";
import { BrushPanel, type BrushTone } from "@/components/brand/BrushPanel";
import { ContourPanel } from "@/components/brand/ContourPanel";
import { Book, Plus } from "@/components/icons";
import { REPO_URL } from "@/components/site";
import { cn } from "@/lib/utils";
import { GitHubReviewComment, GitHubSummaryComment } from "./github";
import {
  ArrowLink,
  Button,
  Container,
  DOCS_HREF,
  Eyebrow,
  INSTALL_HREF,
  Reveal,
  SELF_HOST_HREF,
  SectionHeading,
} from "./primitives";
import {
  ApiSpecVisual,
  CommitHistoryVisual,
  CredentialPanel,
  DeployPanel,
  DiffScopePanel,
  EgressPanel,
  HardeningVisual,
  HeroFindings,
  HeroScanners,
  HeroVerdict,
  LanguageRulesVisual,
  MaliciousPackageVisual,
  McpPanel,
  PipelineVisual,
  PolicyPanel,
  SkillPickerPanel,
  SkillsPanel,
} from "./product";

/* ---------------------------------- Hero ---------------------------------- */

export function Hero() {
  return (
    <section className="pt-[120px] sm:pt-[150px]">
      <Container>
        <Reveal className="mx-auto flex max-w-[920px] flex-col items-center text-center">
          <p className="text-[14px] text-stone">
            Open source · AGPL-3.0 · for GitHub pull requests
          </p>
          <h1 className="mt-5 font-editorial text-[52px] leading-[0.98] text-ink sm:text-[78px] lg:text-[92px]">
            Security review for every pull request
          </h1>
          <p className="mt-6 max-w-[620px] text-[17px] leading-[1.6] text-stone sm:text-[19px]">
            Open-source scanners check the change. Your own Claude Code, Codex
            or Cursor triages what they find and reads the diff. The result
            lands on the pull request as a check and review comments.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button href={INSTALL_HREF} arrow>
              Install on GitHub
            </Button>
            <Button href={DOCS_HREF} variant="outline">
              Read the docs
              <Book size={16} />
            </Button>
          </div>
        </Reveal>

        <Reveal delay={0.12} className="mt-14 sm:mt-20">
          <ContourPanel className="rounded-[20px] px-4 py-5 sm:px-8 sm:py-12 lg:px-12 lg:pt-14 lg:pb-24">
            <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.04fr)_minmax(0,1fr)] lg:gap-6">
              <Frame>
                <HeroVerdict />
              </Frame>
              <Frame className="lg:translate-y-12">
                <HeroFindings />
              </Frame>
              <Frame className="hidden sm:block">
                <HeroScanners />
              </Frame>
            </div>
          </ContourPanel>
        </Reveal>
      </Container>
    </section>
  );
}

/** The frosted rim around a card floating on a gradient panel. */
function Frame({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] bg-white/30 p-1.5 ring-1 ring-white/40 backdrop-blur-[2px] dark:bg-white/[0.04] dark:ring-white/10",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------ Built on open-source scanners -------------------- */

const SCANNERS: { name: string; what: string; logo: string; href: string }[] = [
  {
    name: "OpenGrep",
    what: "code",
    logo: "opengrep.svg",
    href: "/docs/scanners#opengrep",
  },
  {
    name: "OSV-Scanner",
    what: "dependencies",
    logo: "osv.svg",
    href: "/docs/scanners#osv-scanner",
  },
  {
    name: "Gitleaks",
    what: "secrets",
    logo: "",
    href: "/docs/scanners#gitleaks",
  },
  {
    name: "Trivy",
    what: "infrastructure",
    logo: "trivy.svg",
    href: "/docs/scanners#trivy",
  },
  {
    name: "zizmor",
    what: "GitHub Actions",
    logo: "zizmor.svg",
    href: "/docs/scanners#zizmor",
  },
  {
    name: "poutine",
    what: "CI pipelines",
    logo: "poutine.png",
    href: "/docs/scanners#poutine",
  },
  {
    name: "Spectral",
    what: "OpenAPI",
    logo: "spectral.png",
    href: "/docs/scanners#spectral",
  },
];

const AGENTS: { agent: AgentProvider; what: string }[] = [
  { agent: "claude", what: "Claude Pro or Max, or an API key" },
  { agent: "codex", what: "ChatGPT login or an API key" },
  { agent: "cursor", what: "Cursor API key" },
];

/** Gitleaks' logo is the ASCII drawing at the top of its README. */
function GitleaksMark() {
  return (
    <pre
      aria-hidden="true"
      className="font-mono text-[7.5px] leading-[1.05] text-[#16150f]"
    >
      {GITLEAKS_ASCII}
    </pre>
  );
}

const GITLEAKS_ASCII = [
  "┌─○───┐",
  "│ │╲  │",
  "│ │ ○ │",
  "│ ○ ░ │",
  "└─░───┘",
].join("\n");

/** A logo on a white tile, so every mark keeps its own colours in both themes. */
function LogoTile({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-14 place-items-center rounded-[14px] bg-white shadow-[0_0_0_1px_rgb(18_17_15/0.08),0_1px_2px_rgb(18_17_15/0.06)] transition-transform duration-200 group-hover:-translate-y-0.5 dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ScannerRow() {
  return (
    <section className="pt-28 sm:pt-40">
      <Container>
        <Reveal className="mx-auto max-w-[620px] text-center">
          <h2 className="font-editorial text-[34px] leading-[1.1] text-ink sm:text-[42px]">
            Built on open-source scanners
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-stone">
            Each one is pinned by version and SHA-256 checksum and baked into
            the sandbox image. Their rules and configs come from the image, not
            from the pull request.
          </p>
        </Reveal>
        <Reveal
          delay={0.06}
          className="mt-14 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4 lg:grid-cols-7"
        >
          {SCANNERS.map((s) => (
            <a
              key={s.name}
              href={s.href}
              className="group flex flex-col items-center text-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            >
              <LogoTile>
                {s.logo ? (
                  <img
                    src={`/logos/${s.logo}`}
                    alt=""
                    width={32}
                    height={32}
                    loading="lazy"
                    className={cn(
                      "size-8 object-contain",
                      s.name === "poutine" && "rounded-[6px]",
                    )}
                  />
                ) : (
                  <GitleaksMark />
                )}
              </LogoTile>
              <span className="mt-3.5 font-display text-[19px] tracking-[-0.02em] text-ink-2 transition-colors group-hover:text-ink">
                {s.name}
              </span>
              <span className="mt-1 font-mono text-[11px] tracking-[0.04em] text-pebble">
                {s.what}
              </span>
            </a>
          ))}
        </Reveal>

        <Reveal className="mx-auto mt-24 max-w-[620px] text-center">
          <h3 className="font-editorial text-[30px] leading-[1.1] text-ink sm:text-[36px]">
            Reviewed by the agent you already use
          </h3>
          <p className="mt-4 text-[16px] leading-[1.6] text-stone">
            Connect your own Claude Code, Codex or Cursor. It triages what the
            scanners found and reads the diff for what they can&apos;t see.
          </p>
        </Reveal>
        <Reveal
          delay={0.06}
          className="mx-auto mt-12 grid max-w-[760px] grid-cols-1 gap-8 sm:grid-cols-3"
        >
          {AGENTS.map((a) => (
            <a
              key={a.agent}
              href="/docs/agent-credentials"
              className="group flex flex-col items-center text-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            >
              <LogoTile className="size-16 rounded-[16px]">
                <AgentLogo
                  agent={a.agent}
                  className={cn(
                    "size-8",
                    a.agent !== "claude" && "text-[#16150f]",
                  )}
                />
              </LogoTile>
              <span className="mt-3.5 font-display text-[19px] tracking-[-0.02em] text-ink-2 transition-colors group-hover:text-ink">
                {AGENT_INFO[a.agent].label}
              </span>
              <span className="mt-1 text-[13px] text-pebble">{a.what}</span>
            </a>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}

/* -------------------------------- What's new ------------------------------- */

const FEATURES: {
  title: string;
  body: string;
  visual: ReactNode;
  href: string;
  link: string;
}[] = [
  {
    title: "Rules for the languages you use",
    body: "About 980 OpenGrep rules from five open packs, including mobsfscan for Android and iOS. Only the rules for languages in your repository load, and a pull request that changes no source file skips OpenGrep.",
    visual: <LanguageRulesVisual />,
    href: "/docs/scanners#opengrep",
    link: "OpenGrep",
  },
  {
    title: "Every commit in the pull request",
    body: "Gitleaks scans what each commit added, not only the final files. A key added in one commit and deleted in the next is still in the branch's history on GitHub, so it is still reported.",
    visual: <CommitHistoryVisual />,
    href: "/docs/scanners#gitleaks",
    link: "Gitleaks",
  },
  {
    title: "Malicious packages stay blocked",
    body: "OSV-Scanner checks lockfiles against OSV.dev, including the OpenSSF malicious packages dataset. A match is critical, and the AI can't dismiss it. Vendored C and C++ libraries are matched by file hash.",
    visual: <MaliciousPackageVisual />,
    href: "/docs/scanners#osv-scanner",
    link: "OSV-Scanner",
  },
  {
    title: "CI pipelines, not only GitHub Actions",
    body: "zizmor audits GitHub workflows. poutine covers GitLab CI, Azure Pipelines and Tekton: untrusted input in scripts, a fork's code run with the pipeline's secrets, and scripts piped from curl into a shell.",
    visual: <PipelineVisual />,
    href: "/docs/scanners#poutine",
    link: "zizmor and poutine",
  },
  {
    title: "OWASP API Top 10 on your spec",
    body: "Spectral checks OpenAPI and Swagger files with the OWASP API Security ruleset, kept to its security rules: endpoints with no authentication, credentials in URLs, plain HTTP and SSRF-prone parameters.",
    visual: <ApiSpecVisual />,
    href: "/docs/scanners#spectral",
    link: "Spectral",
  },
  {
    title: "The pull request can't switch them off",
    body: "Scanners read files the author wrote, so they ignore suppression comments, ignore files, .gitignore and configs in the pull request. Each runs with the config in the image.",
    visual: <HardeningVisual />,
    href: "/docs/scanners#hardened-against-the-pull-request",
    link: "Hardening",
  },
];

export function WhatsNew() {
  return (
    <section id="product" className="scroll-mt-20 pt-28 sm:pt-40">
      <Container>
        <SectionHeading title="Scanners that run only when they're needed">
          On a pull request, each scanner looks at the changed files first and
          skips if nothing it reads was touched. The run page says why. The ones
          that run can't be turned off by the code they're scanning.
        </SectionHeading>

        <div className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.06}>
              <article className="flex h-full flex-col overflow-hidden rounded-[16px] border border-rule bg-chalk">
                {i % 3 === 1 ? (
                  <ContourPanel
                    variant={(i % 2 ? 1 : 2) as 1 | 2}
                    className="grid min-h-[260px] grid-cols-[minmax(0,1fr)] items-center p-6"
                  >
                    {f.visual}
                  </ContourPanel>
                ) : (
                  <div className="grid min-h-[260px] grid-cols-[minmax(0,1fr)] items-center bg-paper-2/70 p-6">
                    {f.visual}
                  </div>
                )}
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="font-editorial text-[27px] leading-[1.12] text-ink">
                    {f.title}
                  </h3>
                  <p className="mt-2.5 text-[15px] leading-[1.6] text-stone">
                    {f.body}
                  </p>
                  <div className="mt-auto pt-5">
                    <ArrowLink href={f.href}>{f.link}</ArrowLink>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* --------------------------- On the pull request -------------------------- */

export function OnThePr() {
  return (
    <section className="pt-28 sm:pt-40">
      <Container>
        <SectionHeading title="Findings where you already review code">
          Comments land on the changed lines, the check can block the merge, and
          one summary comment keeps the whole picture current.
        </SectionHeading>

        <Reveal className="mt-12">
          <BrushPanel
            id="pr"
            tone="umber"
            variant={1}
            className="rounded-[20px] p-4 sm:p-10"
          >
            <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
              <GitHubReviewComment />
              <GitHubSummaryComment />
            </div>
          </BrushPanel>
        </Reveal>

        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {[
            [
              "Inline comments",
              "On the exact line, with the agent's reasoning and a suggested fix you can commit.",
            ],
            [
              "A check you can require",
              "Fails only for findings in the diff at or above your threshold. Set it to advisory if you prefer.",
            ],
            [
              "One summary comment",
              "Rewritten in place on each push, so the thread doesn't fill up with bot noise.",
            ],
          ].map(([t, d]) => (
            <Reveal key={t}>
              <h3 className="font-editorial text-[26px] text-ink">{t}</h3>
              <p className="mt-2 text-[15.5px] leading-[1.6] text-stone">{d}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------ Review skills ------------------------------ */

export function Skills() {
  return (
    <section id="skills" className="scroll-mt-20 pt-28 sm:pt-40">
      <Container>
        <SectionHeading title="Teach the reviewer how your code works">
          Skills are markdown instructions the AI reviewer applies when a change
          matches: your conventions, a checklist for your framework, how you
          handle money or tenants. Start from four built-ins based on OWASP, or
          add your own.
        </SectionHeading>

        <Reveal className="mt-12">
          <ContourPanel
            variant={2}
            className="rounded-[20px] p-4 sm:p-10 lg:p-14"
          >
            <div className="mx-auto grid max-w-[980px] grid-cols-[minmax(0,1fr)] items-start gap-4 md:grid-cols-2 lg:gap-6">
              <Frame>
                <SkillsPanel />
              </Frame>
              <Frame className="md:translate-y-8">
                <SkillPickerPanel />
              </Frame>
            </div>
          </ContourPanel>
        </Reveal>

        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {[
            [
              "Import a link",
              "A skills.sh page, a GitHub file or a gist. It's fetched once, on the server, and saved as a snapshot that never changes behind your back.",
            ],
            [
              "Upload or paste",
              "Any SKILL.md or markdown file up to 512 KB, and up to 2 MB of skills on a single review. Hidden and bidirectional characters are stripped.",
            ],
            [
              "Choose per repository",
              "Each repository picks its skills and their order. Skills shape the AI review only; the scanners stay the same.",
            ],
          ].map(([t, d]) => (
            <Reveal key={t}>
              <h3 className="font-editorial text-[26px] text-ink">{t}</h3>
              <p className="mt-2 text-[15.5px] leading-[1.6] text-stone">{d}</p>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-8">
          <ArrowLink href="/docs/review-skills">Review skills</ArrowLink>
        </Reveal>
      </Container>
    </section>
  );
}

/* ------------------------- Numbered details (sticky) ---------------------- */

const DETAILS: {
  title: string;
  body: string;
  tone: BrushTone;
  panel: ReactNode;
}[] = [
  {
    title: "Only what the PR changed blocks it",
    body: "Old issues elsewhere in the repository are reported for context but never fail the check, so turning OpenVScan on doesn't stop every open PR.",
    tone: "moss",
    panel: <DiffScopePanel />,
  },
  {
    title: "A threshold per repository",
    body: "Pick which scanners run, which agent reviews, its skills and extra instructions, and the severity that fails the check.",
    tone: "sand",
    panel: <PolicyPanel />,
  },
  {
    title: "Your key never enters the sandbox",
    body: "Claude Code, Codex or Cursor gets a placeholder. The real credential is swapped in at the network edge, only on requests to the model API you chose.",
    tone: "moss",
    panel: <CredentialPanel />,
  },
  {
    title: "The network is locked per phase",
    body: "Checkout can reach one repository, OSV-Scanner can send package names to OSV.dev, the agent can reach its model API. The rest of the time the sandbox reaches nothing.",
    tone: "sand",
    panel: <EgressPanel />,
  },
  {
    title: "Fix findings from your coding agent",
    body: "OpenVScan runs an MCP server. Connect Claude Code, Codex or Cursor, and ask it to read a review's findings, fix them and run the review again.",
    tone: "pine",
    panel: <McpPanel />,
  },
  {
    title: "Runs on your Cloudflare account",
    body: "Two Workers, a Workflow, D1, R2 and a Container. Self-host it under AGPL-3.0 with one deploy command.",
    tone: "pine",
    panel: <DeployPanel />,
  },
];

export function Details() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setActive(Number((e.target as HTMLElement).dataset.index));
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const el of refs.current) if (el) io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="security" className="scroll-mt-20 pt-28 sm:pt-40">
      <Container>
        <SectionHeading title="Built so a red check means something">
          A review tool people learn to ignore is worse than none. These are the
          decisions that keep the signal high and your code and keys contained.
        </SectionHeading>

        <div className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16">
          <div>
            {DETAILS.map((d, i) => (
              <div
                key={d.title}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                data-index={i}
                className="border-t border-rule py-10 first:border-t-0 first:pt-0 lg:flex lg:min-h-[52vh] lg:flex-col lg:justify-center lg:py-0 lg:first:border-t lg:first:pt-0"
              >
                <p className="font-mono text-[12px] text-pebble">
                  {String(i + 1).padStart(2, "0")} /{" "}
                  {String(DETAILS.length).padStart(2, "0")}
                </p>
                <h3
                  className={cn(
                    "mt-3 font-editorial text-[32px] leading-tight transition-colors duration-300 sm:text-[38px]",
                    active === i ? "text-ink" : "text-ink lg:text-pebble",
                  )}
                >
                  {d.title}
                </h3>
                <p
                  className={cn(
                    "mt-3 max-w-[470px] text-[16px] leading-[1.6] transition-colors duration-300",
                    active === i
                      ? "text-stone"
                      : "text-stone lg:text-pebble/80",
                  )}
                >
                  {d.body}
                </p>
                {/* Mobile: panel under each item. */}
                <BrushPanel
                  id={`detail-m-${i}`}
                  tone={d.tone}
                  variant={(i % 3) as 0 | 1 | 2}
                  className="mt-6 flex items-center justify-center rounded-[14px] p-5 sm:p-8 lg:hidden [&>*]:min-w-0"
                >
                  {d.panel}
                </BrushPanel>
              </div>
            ))}
          </div>

          <div className="hidden lg:block">
            <div className="sticky top-[calc(50vh-240px)]">
              <BrushPanel
                id="detail"
                tone={DETAILS[active].tone}
                variant={(active % 3) as 0 | 1 | 2}
                className="flex h-[480px] items-center justify-center rounded-[20px] p-10 transition-colors duration-500"
              >
                <div
                  key={active}
                  className="flex w-full justify-center animate-in fade-in-0 zoom-in-[0.98] duration-500"
                >
                  {DETAILS[active].panel}
                </div>
              </BrushPanel>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* --------------------------------- Run it --------------------------------- */

export function WaysToRun() {
  const cols = [
    {
      eyebrow: "Cloud",
      title: "OpenVScan Cloud",
      body: "Install the GitHub App, pick repositories and add your agent credential. We run the Workers.",
      points: [
        "Reviews within a minute of a push",
        "Dashboard for every run and finding",
        "Your agent, your quota",
      ],
      cta: (
        <Button href={INSTALL_HREF} arrow className="w-full">
          Install on GitHub
        </Button>
      ),
      featured: true,
    },
    {
      eyebrow: "Self-host",
      title: "Your Cloudflare account",
      body: "The same code, deployed with one command. AGPL-3.0, no license key, no phone-home.",
      points: [
        "Two Workers, a Workflow and a Container",
        "D1 for state, R2 for raw scanner output",
        "Workers Paid plan for Containers",
      ],
      cta: (
        <Button href={SELF_HOST_HREF} variant="outline" className="w-full">
          Setup guide
        </Button>
      ),
    },
    {
      eyebrow: "Agent",
      title: "Bring your agent",
      body: "The AI review is optional. Leave it off and you still get scanner findings mapped to the diff.",
      points: [
        "Claude Code: subscription token or API key",
        "Codex: ChatGPT login, access token or API key",
        "Cursor: Cursor API key",
        "Encrypted at rest, swapped in at egress",
      ],
      cta: (
        <Button
          href="/docs/agent-credentials"
          variant="outline"
          className="w-full"
        >
          How keys are kept
        </Button>
      ),
    },
  ];
  return (
    <section id="self-host" className="scroll-mt-20 pt-28 sm:pt-40">
      <Container>
        <SectionHeading title="Hosted, or on your own Cloudflare account">
          OpenVScan is open source, like PostHog: use the hosted cloud or deploy
          the same Workers yourself.
        </SectionHeading>
        <Reveal className="mt-12 grid overflow-hidden rounded-[16px] border border-rule bg-chalk md:grid-cols-3">
          {cols.map((c) => (
            <div
              key={c.title}
              className={cn(
                "flex flex-col border-rule p-7 not-last:border-b md:not-last:border-r md:not-last:border-b-0",
                c.featured && "bg-paper-2/50",
              )}
            >
              <Eyebrow>{c.eyebrow}</Eyebrow>
              <h3 className="mt-4 font-editorial text-[30px] text-ink">
                {c.title}
              </h3>
              <p className="mt-2 text-[15px] leading-[1.6] text-stone">
                {c.body}
              </p>
              <ul className="mt-6 mb-8 space-y-2.5">
                {c.points.map((p) => (
                  <li key={p} className="flex gap-2.5 text-[14.5px] text-ink-2">
                    <span className="mt-[9px] h-px w-3 shrink-0 bg-ink" />
                    {p}
                  </li>
                ))}
              </ul>
              <div className="mt-auto">{c.cta}</div>
            </div>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}

/* ----------------------------------- FAQ ---------------------------------- */

const FAQ: { group: string; items: { q: string; a: string }[] }[] = [
  {
    group: "Getting started",
    items: [
      {
        q: "Do I have to use AI?",
        a: "No. Leave the agent unset on a repository and you get scanner findings mapped to the diff, with the same check, comments and dashboard. The agent adds triage and its own findings on top.",
      },
      {
        q: "Will it block every PR on old issues?",
        a: "No. The check fails only for findings on lines the PR changed, at or above the severity you choose. Everything else is reported for context. You can also set it to never fail.",
      },
      {
        q: "Which languages does it cover?",
        a: "OpenGrep has rules for about 20 languages, and only the ones in your repository load. OSV-Scanner reads lockfiles for 11 ecosystems, Trivy covers infrastructure-as-code, zizmor and poutine cover CI pipelines, Spectral checks OpenAPI specs, and Gitleaks scans any text file.",
      },
      {
        q: "What does it cost to self-host?",
        a: "The software is free. You pay Cloudflare for Containers (Workers Paid, $5/month plus usage) and your model provider for the agent, which is optional.",
      },
    ],
  },
  {
    group: "Security & privacy",
    items: [
      {
        q: "Which credentials work?",
        a: "Claude Code: a subscription token from `claude setup-token` or an Anthropic API key. Codex: a ChatGPT login, a Business or Enterprise access token, or an OpenAI API key. Cursor: a Cursor API key. If you run OpenVScan as a service for other people, check your provider's terms for subscription logins; API keys are the safe choice there.",
      },
      {
        q: "Can the agent leak my code?",
        a: "During the review the sandbox can reach only the model API you chose, through a Worker that refuses everything else. It has no GitHub token and no way to post anything itself.",
      },
      {
        q: "What about pull requests from forks?",
        a: "Pull requests from people without write access, including forks and bots, get the scanners only. The AI review runs when someone with write access comments `@<app> review`, so outsiders can't spend your quota. Text from the pull request reaches the agent as untrusted input.",
      },
    ],
  },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 pt-28 sm:pt-40">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <Reveal>
            <Eyebrow className="mb-5">Questions</Eyebrow>
            <h2 className="font-editorial text-[46px] leading-[1.02] text-ink sm:text-[60px]">
              Common questions
            </h2>
            <p className="mt-5 text-[16px] text-stone">
              Something else?{" "}
              <a
                href={`${REPO_URL}/issues`}
                target="_blank"
                rel="noopener noreferrer"
                className="link-underline text-ink"
              >
                Open an issue
              </a>
              .
            </p>
          </Reveal>
          <Reveal className="space-y-12">
            {FAQ.map((g) => (
              <div key={g.group}>
                <Eyebrow className="mb-4">{g.group}</Eyebrow>
                <div className="border-t border-rule">
                  {g.items.map((item) => (
                    <details
                      key={item.q}
                      className="group border-b border-rule"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[16.5px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                        {item.q}
                        <Plus
                          size={18}
                          strokeWidth={1.5}
                          className="shrink-0 transition-transform group-open:rotate-45"
                        />
                      </summary>
                      <p className="-mt-1 max-w-[640px] pb-6 text-[15.5px] leading-[1.65] text-stone">
                        {renderInlineCode(item.a)}
                      </p>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

function renderInlineCode(text: string) {
  return text.split(/(`[^`]+`)/).map((part, i) =>
    part.startsWith("`") ? (
      <code
        key={i}
        className="rounded-[3px] bg-paper-2 px-1 py-0.5 font-mono text-[13.5px] text-ink"
      >
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

/* -------------------------------- Final CTA ------------------------------- */

export function FinalCta() {
  return (
    <section className="pt-28 pb-24 sm:pt-40 sm:pb-32">
      <Container>
        <Reveal>
          <BrushPanel
            id="cta"
            tone="pine"
            variant={2}
            className="rounded-[20px] px-6 py-20 text-center sm:py-28"
          >
            <h2 className="mx-auto max-w-[800px] font-editorial text-[44px] leading-[1.02] text-day sm:text-[72px]">
              Review the next pull request before it merges
            </h2>
            <p className="mx-auto mt-5 max-w-[520px] text-[17px] leading-[1.6] text-day/70">
              Install the GitHub App, add your agent, and open a pull request.
              The first review takes about two minutes.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Button href={INSTALL_HREF} variant="light" arrow>
                Install on GitHub
              </Button>
              <Button
                href={DOCS_HREF}
                variant="outline"
                className="border-day/40 text-day hover:bg-white/[0.06]"
              >
                Read the docs
              </Button>
            </div>
          </BrushPanel>
        </Reveal>
      </Container>
    </section>
  );
}
