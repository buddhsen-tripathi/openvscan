import { type ReactNode, useEffect, useRef, useState } from "react";
import { BrushPanel, type BrushTone } from "@/components/brand/BrushPanel";
import { ClaudeMark, OpenAIMark, Plus } from "@/components/icons";
import { REPO_URL } from "@/components/site";
import { cn } from "@/lib/utils";
import {
  CheckCard,
  CredentialPanel,
  DeployPanel,
  DiffScopePanel,
  EgressPanel,
  HeroDemo,
  InlineComment,
  PolicyPanel,
  ScannersCard,
  SummaryCard,
  TriageCard,
} from "./mocks";
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

/* ---------------------------------- Hero ---------------------------------- */

export function Hero() {
  return (
    <section className="pt-[124px] sm:pt-[148px]">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:gap-14">
          <Reveal>
            <Eyebrow className="mb-6">Open-source PR security review</Eyebrow>
            <h1 className="font-display text-[52px] leading-[0.98] tracking-[-0.035em] text-ink sm:text-[72px] xl:text-[84px]">
              Security review for every pull request
            </h1>
          </Reveal>
          <Reveal delay={0.08} className="lg:pt-[68px]">
            <p className="max-w-[540px] text-[19px] leading-[1.55] text-ink-2 sm:text-[21px]">
              Trivy, Opengrep and Gitleaks scan the change. Your own{" "}
              <AgentName mark={ClaudeMark} className="text-[#D97757]">
                Claude Code
              </AgentName>{" "}
              or{" "}
              <AgentName mark={OpenAIMark} className="text-ink">
                Codex
              </AgentName>{" "}
              triages what they find and reads the diff. The result lands on the
              pull request as a check and review comments.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href={INSTALL_HREF} arrow>
                Install on GitHub
              </Button>
              <Button href={SELF_HOST_HREF} variant="outline">
                Self-host it
              </Button>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.12} className="mt-14 sm:mt-20">
          <BrushPanel
            id="hero"
            tone="moss"
            className="rounded-[12px] px-3 py-3 sm:px-10 sm:py-10"
          >
            <HeroDemo />
          </BrushPanel>
        </Reveal>
      </Container>
    </section>
  );
}

/** An agent's name with its logo, inline in running text. */
function AgentName({
  mark: AgentMark,
  className,
  children,
}: {
  mark: typeof ClaudeMark;
  className?: string;
  children: string;
}) {
  return (
    <span className="whitespace-nowrap text-ink">
      <AgentMark
        size="0.82em"
        className={cn(
          "mr-[0.28em] inline-block -translate-y-[0.06em]",
          className,
        )}
      />
      {children}
    </span>
  );
}

/* ------------------------------ How it works ------------------------------ */

const PILLARS: {
  tone: BrushTone;
  variant: 0 | 1 | 2;
  card: ReactNode;
  title: string;
  body: string;
  code: string;
  link: { label: string; href: string };
}[] = [
  {
    tone: "moss",
    variant: 0,
    card: <ScannersCard />,
    title: "Three scanners",
    body: "Dependencies and IaC with Trivy, code patterns with Opengrep, secrets with Gitleaks. Findings are mapped to the lines the PR changed.",
    code: "trivy · opengrep · gitleaks",
    link: { label: "Scanners", href: "/docs/scanners" },
  },
  {
    tone: "umber",
    variant: 1,
    card: <TriageCard rows={3} />,
    title: "Your agent triages",
    body: "Claude Code or Codex runs headless on your own subscription or API key. It confirms or dismisses each finding and adds what the rules missed.",
    code: "claude -p · codex exec",
    link: {
      label: "Agents",
      href: "/docs/ai-review",
    },
  },
  {
    tone: "pine",
    variant: 2,
    card: <CheckCard />,
    title: "One check on the PR",
    body: "A GitHub check you can require before merge, inline comments on the changed lines, and a summary that updates on every push.",
    code: "checks · reviews · comments",
    link: { label: "Reports", href: "/docs/results-on-github" },
  },
];

export function HowItWorks() {
  return (
    <section id="product" className="scroll-mt-20 pt-28 sm:pt-40">
      <Container>
        <SectionHeading title="Scanners, your agent and one check">
          Every push to a pull request starts a run in an isolated Cloudflare
          container. There is nothing to add to your CI.
        </SectionHeading>

        {/* Trigger chip with branches down to the three cards. */}
        <Reveal className="relative mt-14 hidden lg:block">
          <div className="flex justify-center">
            <span className="relative z-10 inline-flex items-center gap-2 rounded-full border border-rule-strong bg-chalk px-4 py-2 font-mono text-[13px] text-ink-2">
              <span className="size-1.5 rounded-full bg-brand" />
              on: pull_request · opened, synchronize, reopened
            </span>
          </div>
          <div className="mx-auto h-7 w-px bg-rule-strong" />
          <div className="mx-[16.66%] h-7 border-x border-t border-rule-strong" />
          <div className="absolute bottom-0 left-1/2 h-7 w-px -translate-x-1/2 bg-rule-strong" />
        </Reveal>

        <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-5 lg:mt-0">
          {PILLARS.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.06}>
              <BrushPanel
                id={`pillar-${i}`}
                tone={p.tone}
                variant={p.variant}
                className="flex aspect-[4/3.3] items-center justify-center rounded-[10px] p-6"
              >
                {p.card}
              </BrushPanel>
              <div className="px-1">
                <h3 className="mt-6 font-display text-[30px] leading-tight tracking-[-0.02em] text-ink">
                  {p.title}
                </h3>
                <p className="mt-2.5 text-[15.5px] leading-[1.6] text-stone">
                  {p.body}
                </p>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <code className="font-mono text-[12.5px] text-stone">
                    {p.code}
                  </code>
                  <ArrowLink href={p.link.href}>{p.link.label}</ArrowLink>
                </div>
              </div>
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
            className="rounded-[12px] p-4 sm:p-10"
          >
            <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.05fr]">
              <div className="space-y-4">
                <InlineComment />
                <CheckCard className="max-w-none" />
              </div>
              <SummaryCard />
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
              <h3 className="font-display text-[24px] tracking-[-0.015em] text-ink">
                {t}
              </h3>
              <p className="mt-2 text-[15.5px] leading-[1.6] text-stone">{d}</p>
            </Reveal>
          ))}
        </div>
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
    title: "False positives stay out of the way",
    body: "The agent reads the code around each finding. Test fixtures, dead code and sanitized inputs are dismissed with a reason you can read.",
    tone: "sand",
    panel: <TriageCard />,
  },
  {
    title: "A threshold per repository",
    body: "Pick which scanners run, which agent reviews, extra instructions for it, and the severity that fails the check.",
    tone: "moss",
    panel: <PolicyPanel />,
  },
  {
    title: "Your key never enters the sandbox",
    body: "The agent gets a placeholder. The real credential is swapped in at the network edge, only on requests to the model API you chose.",
    tone: "sand",
    panel: <CredentialPanel />,
  },
  {
    title: "The network is locked per phase",
    body: "Checkout can reach one repository, scanners can fetch their databases, the agent can reach its model API. During publish the sandbox reaches nothing.",
    tone: "moss",
    panel: <EgressPanel />,
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
        <SectionHeading
          eyebrow="Details"
          title="Built so a red check means something"
        >
          A review tool people learn to ignore is worse than none. These are the
          decisions that keep the signal high and your code and keys contained.
        </SectionHeading>

        <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
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
                    "mt-3 font-display text-[30px] leading-tight tracking-[-0.02em] transition-colors duration-300 sm:text-[34px]",
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
                  className="mt-6 flex items-center justify-center rounded-[10px] p-5 sm:p-8 lg:hidden"
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
                className="flex h-[480px] items-center justify-center rounded-[12px] p-10 transition-colors duration-500"
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
        "Codex: OpenAI API key",
        "Encrypted at rest, injected at egress",
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
        <Reveal className="mt-12 grid overflow-hidden rounded-[10px] border border-rule bg-chalk md:grid-cols-3">
          {cols.map((c) => (
            <div
              key={c.title}
              className={cn(
                "flex flex-col border-rule p-7 not-last:border-b md:not-last:border-r md:not-last:border-b-0",
                c.featured && "bg-paper-2/50",
              )}
            >
              <Eyebrow>{c.eyebrow}</Eyebrow>
              <h3 className="mt-4 font-display text-[28px] tracking-[-0.02em] text-ink">
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
        a: "Anything the scanners and the agent understand. Opengrep's rules cover the major languages, Trivy reads lockfiles for most ecosystems, and Gitleaks is language-agnostic.",
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
        a: "A Claude subscription token (from `claude setup-token`) or an Anthropic API key for Claude Code, and an OpenAI API key for Codex. If you run OpenVScan as a service for other people, check your provider's terms for subscription tokens; API keys are the safe choice there.",
      },
      {
        q: "Can the agent leak my code?",
        a: "During the review the sandbox can reach only the model API you chose, through a Worker that refuses everything else. It has no GitHub token and no way to post anything itself.",
      },
      {
        q: "What about pull requests from forks?",
        a: "They are reviewed with the repository owner's credential, so they spend the owner's quota. Text in the PR is passed to the agent as untrusted input.",
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
            <h2 className="font-display text-[44px] leading-[1.04] tracking-[-0.025em] text-ink sm:text-[54px]">
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
            className="rounded-[12px] px-6 py-20 text-center sm:py-28"
          >
            <h2 className="mx-auto max-w-[760px] font-display text-[42px] leading-[1.04] tracking-[-0.03em] text-day sm:text-[64px]">
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
