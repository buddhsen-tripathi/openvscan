import { MDXProvider } from "@mdx-js/react";
import type { MDXContent } from "mdx/types";
import {
  type ComponentType,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "@/components/AppLink";
import { ArrowLeft, ArrowRight, Github } from "@/components/icons";
import { REPO_URL } from "@/components/site";
import { DocsToc } from "./DocsToc";
import { mdxComponents } from "./mdx-components";
import { docHref, docNeighbours, docSection, getDoc } from "./pages";

/** Rendered after the MDX inside Suspense, so it only fires once content exists. */
function OnRendered({ onRendered }: { onRendered: () => void }) {
  useEffect(onRendered, [onRendered]);
  return null;
}

export function DocsArticle({
  slug,
  Content,
}: {
  slug: string;
  Content: MDXContent | ComponentType;
}) {
  const page = getDoc(slug);
  const section = docSection(slug);
  const { prev, next } = docNeighbours(slug);
  const ref = useRef<HTMLElement>(null);
  const [rendered, setRendered] = useState<string | null>(null);
  const onRendered = useCallback(() => setRendered(slug), [slug]);
  const ready = rendered === slug;

  // The router scrolls before the MDX exists; honour #fragments once it does.
  useEffect(() => {
    if (!ready) return;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash) document.getElementById(hash)?.scrollIntoView();
  }, [ready]);

  return (
    <div className="grid min-w-0 gap-12 xl:grid-cols-[minmax(0,1fr)_200px]">
      <div className="min-w-0 max-w-[720px]">
        <article ref={ref} aria-labelledby="doc-title">
          <p className="eyebrow text-[10.5px] text-brand">{section?.title}</p>
          <h1
            id="doc-title"
            className="mt-3 font-display text-[clamp(34px,4vw,46px)] leading-[1.06] tracking-[-0.025em] text-ink"
          >
            {page?.title}
          </h1>
          {page?.description && (
            <p className="mt-4 text-[17.5px] leading-relaxed text-stone">
              {page.description}
            </p>
          )}
          <div className="docs-prose mt-10">
            <MDXProvider components={mdxComponents}>
              <Suspense fallback={<div className="h-40" />}>
                <Content />
                <OnRendered onRendered={onRendered} />
              </Suspense>
            </MDXProvider>
          </div>
        </article>

        <div className="mt-14 flex items-center justify-between gap-4 text-[13px] text-stone">
          <a
            href={`${REPO_URL}/edit/main/web/content/docs/${slug}.mdx`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-ink"
          >
            <Github size={14} />
            Edit this page on GitHub
          </a>
        </div>

        <nav
          aria-label="Previous and next pages"
          className="mt-6 grid gap-3 border-t border-rule pt-8 sm:grid-cols-2"
        >
          {prev ? (
            <Link
              href={docHref(prev.slug)}
              className="group rounded-[8px] border border-rule bg-chalk p-4 transition-colors hover:border-rule-strong"
            >
              <span className="flex items-center gap-1.5 text-[12.5px] text-stone">
                <ArrowLeft size={13} /> Previous
              </span>
              <span className="mt-1 block text-[15px] font-medium text-ink">
                {prev.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={docHref(next.slug)}
              className="group rounded-[8px] border border-rule bg-chalk p-4 text-right transition-colors hover:border-rule-strong"
            >
              <span className="flex items-center justify-end gap-1.5 text-[12.5px] text-stone">
                Next <ArrowRight size={13} />
              </span>
              <span className="mt-1 block text-[15px] font-medium text-ink">
                {next.title}
              </span>
            </Link>
          ) : null}
        </nav>
      </div>
      <DocsToc articleRef={ref} pageKey={ready ? slug : null} />
    </div>
  );
}
