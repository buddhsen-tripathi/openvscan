import type { MDXContent } from "mdx/types";
import { type LazyExoticComponent, lazy } from "react";
import { Book, type Icon, Server } from "@/components/icons";

/**
 * Docs registry: tabs, sections, order, titles. Content lives in
 * content/docs/<slug>.mdx (its frontmatter is for readers of the file; the
 * site uses the titles and descriptions here). URLs are flat: /docs/<slug>.
 */
type Loader = () => Promise<{ default: MDXContent }>;

const CONTENT = import.meta.glob<{ default: MDXContent }>(
  "/content/docs/*.mdx",
);

/** The page's MDX module, or undefined if the file doesn't exist. */
export function loadDoc(slug: string): ReturnType<Loader> | undefined {
  return hasDoc(slug) ? CONTENT[`/content/docs/${slug}.mdx`]() : undefined;
}

/** Only real pages: the slug comes from the URL. */
export function hasDoc(slug: string) {
  return Object.hasOwn(CONTENT, `/content/docs/${slug}.mdx`);
}

// One lazy component per page, so revisiting a page doesn't suspend again.
// (Loaders can't return the component itself: SSR has to serialize loader data.)
const lazyPages = new Map<string, LazyExoticComponent<MDXContent>>();

export function docComponent(slug: string) {
  let C = lazyPages.get(slug);
  if (!C) {
    C = lazy(
      () => loadDoc(slug) ?? Promise.reject(new Error(`no page ${slug}`)),
    );
    lazyPages.set(slug, C);
  }
  return C;
}

interface DocPage {
  slug: string;
  title: string;
  /** One line, under the title and in <meta name="description">. */
  description: string;
}

export interface DocSection {
  title: string;
  pages: DocPage[];
}

export interface DocTab {
  id: "docs" | "self-hosting";
  title: string;
  icon: Icon;
  sections: DocSection[];
}

export const INTRODUCTION_SLUG = "introduction";

/** The doc slug a /docs URL points at ("/docs" is the introduction). */
export function docSlugFromPath(pathname: string) {
  return (
    pathname.replace(/^\/docs\/?/, "").replace(/\/$/, "") || INTRODUCTION_SLUG
  );
}

export const DOC_TABS: DocTab[] = [
  {
    id: "docs",
    title: "Documentation",
    icon: Book,
    sections: [
      {
        title: "Get started",
        pages: [
          {
            slug: "introduction",
            title: "Introduction",
            description:
              "OpenVScan reviews GitHub pull requests for security issues using open-source scanners and your own coding agent.",
          },
          {
            slug: "quickstart",
            title: "Quickstart",
            description:
              "Install the GitHub App, connect a repository and get your first pull request reviewed.",
          },
        ],
      },
      {
        title: "How it works",
        pages: [
          {
            slug: "how-a-review-works",
            title: "How a review works",
            description:
              "What starts a review, the steps it runs through, its time limits, and how to cancel or re-run it.",
          },
          {
            slug: "scanners",
            title: "Scanners",
            description:
              "Which open-source scanners run, why each one was chosen, how they are hardened against the pull request they scan, and how findings are normalized.",
          },
          {
            slug: "ai-review",
            title: "AI review",
            description:
              "How Claude Code or Codex triages scanner findings and reviews the diff, and what it can and cannot do.",
          },
          {
            slug: "results-on-github",
            title: "Results on GitHub",
            description:
              "The check run, inline review comments and summary comment OpenVScan publishes, and the rule that decides pass, fail or neutral.",
          },
        ],
      },
      {
        title: "Configure",
        pages: [
          {
            slug: "repository-settings",
            title: "Repository settings",
            description:
              "Every per-repository review setting, what it does, and its default.",
          },
          {
            slug: "review-skills",
            title: "Review skills",
            description:
              "Give the AI reviewer your own checklists and conventions as markdown skills, or use the built-in OWASP-based ones.",
          },
          {
            slug: "agent-credentials",
            title: "Agent credentials",
            description:
              "Connect Claude Code or Codex with your own token or API key, and how OpenVScan stores and uses it.",
          },
        ],
      },
      {
        title: "Integrations",
        pages: [
          {
            slug: "mcp",
            title: "MCP server",
            description:
              "Connect Claude Code, Codex or Cursor to OpenVScan's MCP server to read reviews, start and re-run them, and change repository settings.",
          },
        ],
      },
      {
        title: "Security",
        pages: [
          {
            slug: "security-model",
            title: "Security model",
            description:
              "How the review sandbox, egress policy and GitHub permissions limit what a compromised agent or scanner can do, and what OpenVScan stores.",
          },
        ],
      },
      {
        title: "Help",
        pages: [
          {
            slug: "faq",
            title: "FAQ",
            description:
              "Short answers to common questions about OpenVScan's behaviour, cost and data handling.",
          },
        ],
      },
    ],
  },
  {
    id: "self-hosting",
    title: "Self-hosting",
    icon: Server,
    sections: [
      {
        title: "Self-hosting",
        pages: [
          {
            slug: "self-hosting",
            title: "Self-hosting guide",
            description:
              "Run OpenVScan on your own Cloudflare account, what you deploy and what you need.",
          },
          {
            slug: "github-app",
            title: "Register a GitHub App",
            description:
              "Create the GitHub App that receives pull request events, posts reviews and links users' GitHub accounts.",
          },
          {
            slug: "deploy",
            title: "Deploy to Cloudflare",
            description:
              "Provision D1 and R2, set secrets, deploy the engine and web Workers, and run a test review.",
          },
        ],
      },
      {
        title: "Reference",
        pages: [
          {
            slug: "daytona",
            title: "Run sandboxes on Daytona",
            description:
              "Run review sandboxes on your own Daytona account instead of Cloudflare Containers, in hybrid or full mode.",
          },
          {
            slug: "configuration",
            title: "Configuration",
            description:
              "Every secret, variable and binding for the web and engine Workers.",
          },
          {
            slug: "local-development",
            title: "Local development",
            description:
              "Run both Workers locally, with the review sandbox in Docker, and smoke-test the scanners and agents.",
          },
          {
            slug: "upgrading",
            title: "Upgrading",
            description:
              "Move to a new version, apply migrations in order, redeploy, rotate keys, and the licenses that apply.",
          },
        ],
      },
    ],
  },
];

const ALL: { page: DocPage; section: DocSection; tab: DocTab }[] =
  DOC_TABS.flatMap((tab) =>
    tab.sections.flatMap((section) =>
      section.pages.map((page) => ({ page, section, tab })),
    ),
  );

export function getDoc(slug: string) {
  return ALL.find((e) => e.page.slug === slug)?.page;
}

export function docSection(slug: string) {
  return ALL.find((e) => e.page.slug === slug)?.section;
}

export function docTab(slug: string): DocTab {
  return ALL.find((e) => e.page.slug === slug)?.tab ?? DOC_TABS[0];
}

export function docHref(slug: string) {
  return slug === INTRODUCTION_SLUG ? "/docs" : `/docs/${slug}`;
}

/** Previous and next pages within the same tab. */
export function docNeighbours(slug: string) {
  const tab = docTab(slug);
  const pages = ALL.filter((e) => e.tab === tab).map((e) => e.page);
  const i = pages.findIndex((p) => p.slug === slug);
  return {
    prev: i > 0 ? pages[i - 1] : undefined,
    next: i >= 0 && i < pages.length - 1 ? pages[i + 1] : undefined,
  };
}

/** Every page, for search. */
export function allDocs() {
  return ALL;
}
