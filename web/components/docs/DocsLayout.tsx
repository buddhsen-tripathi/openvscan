import { useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import Link from "@/components/AppLink";
import Footer from "@/components/Footer";
import { ChevronDown, Search, X } from "@/components/icons";
import { Container } from "@/components/landing/primitives";
import Navbar from "@/components/Navbar";
import { cn } from "@/lib/utils";
import {
  allDocs,
  DOC_TABS,
  type DocTab,
  docHref,
  docSlugFromPath,
  docTab,
  getDoc,
} from "./pages";
import "./docs.css";

function tabHref(tab: DocTab) {
  return docHref(tab.sections[0].pages[0].slug);
}

/** Documentation / Self-hosting, Mintlify-style, at the top of the sidebar. */
function TabSwitcher({
  current,
  onNavigate,
}: {
  current: string;
  onNavigate?: () => void;
}) {
  const active = docTab(current).id;
  return (
    <ul className="space-y-1">
      {DOC_TABS.map((tab) => {
        const TabIcon = tab.icon;
        const on = tab.id === active;
        return (
          <li key={tab.id}>
            <Link
              href={tabHref(tab)}
              onClick={onNavigate}
              aria-current={on ? "true" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-[7px] px-2 py-1.5 text-[14px] transition-colors",
                on ? "font-medium text-ink" : "text-stone hover:text-ink",
              )}
            >
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-[6px] border transition-colors",
                  on
                    ? "border-brand/30 bg-brand-wash text-brand"
                    : "border-rule bg-chalk text-stone group-hover:text-ink",
                )}
              >
                <TabIcon size={15} />
              </span>
              {tab.title}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SectionList({
  tab,
  current,
  onNavigate,
}: {
  tab: DocTab;
  current: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-6">
      {tab.sections.map((section) => (
        <div key={section.title}>
          <p className="px-2 text-[12.5px] font-medium text-ink">
            {section.title}
          </p>
          <ul className="mt-1.5 space-y-px border-l border-rule">
            {section.pages.map((page) => {
              const on = page.slug === current;
              return (
                <li key={page.slug}>
                  <Link
                    href={docHref(page.slug)}
                    onClick={onNavigate}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "-ml-px block border-l py-1.5 pr-2 pl-3.5 text-[14px] transition-colors",
                      on
                        ? "border-brand font-medium text-brand"
                        : "border-transparent text-stone hover:border-rule-strong hover:text-ink",
                    )}
                  >
                    {page.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Filters every page (both tabs) by title and description. */
function SearchResults({
  query,
  onNavigate,
}: {
  query: string;
  onNavigate?: () => void;
}) {
  const q = query.trim().toLowerCase();
  const hits = useMemo(
    () =>
      allDocs().filter(
        ({ page }) =>
          page.title.toLowerCase().includes(q) ||
          page.description.toLowerCase().includes(q),
      ),
    [q],
  );
  if (hits.length === 0)
    return <p className="px-2 text-[13.5px] text-stone">No pages match.</p>;
  return (
    <ul className="space-y-1">
      {hits.map(({ page, tab }) => (
        <li key={page.slug}>
          <Link
            href={docHref(page.slug)}
            onClick={onNavigate}
            className="block rounded-[6px] px-2 py-2 transition-colors hover:bg-paper-2"
          >
            <span className="block text-[14px] text-ink">{page.title}</span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-stone">
              {tab.title} · {page.description}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SidebarContent({
  current,
  onNavigate,
}: {
  current: string;
  onNavigate?: () => void;
}) {
  const [query, setQuery] = useState("");
  return (
    <div className="space-y-6">
      <label className="relative block">
        <span className="sr-only">Search the docs</span>
        <Search
          size={15}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-stone"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the docs"
          className="h-9 w-full rounded-[7px] border border-rule bg-chalk pr-8 pl-8 text-[13.5px] text-ink placeholder:text-pebble focus-visible:border-brand focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-stone hover:text-ink"
          >
            <X size={14} />
          </button>
        )}
      </label>
      {query.trim() ? (
        <SearchResults query={query} onNavigate={onNavigate} />
      ) : (
        <>
          <TabSwitcher current={current} onNavigate={onNavigate} />
          <SectionList
            tab={docTab(current)}
            current={current}
            onNavigate={onNavigate}
          />
        </>
      )}
    </div>
  );
}

function MobileNav({ current }: { current: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [current]);
  const page = getDoc(current);
  return (
    <div className="sticky top-16 z-30 -mx-5 border-b border-rule bg-paper/95 backdrop-blur-md sm:-mx-8 lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="docs-mobile-nav"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-[14px] sm:px-8"
      >
        <span className="min-w-0 truncate">
          <span className="text-stone">{docTab(current).title}</span>
          <span className="px-1.5 text-pebble">/</span>
          <span className="font-medium text-ink">{page?.title ?? "Menu"}</span>
        </span>
        <ChevronDown
          size={16}
          className={cn(
            "text-stone transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div
          id="docs-mobile-nav"
          className="max-h-[70dvh] overflow-y-auto border-t border-rule px-5 py-5 sm:px-8"
        >
          <SidebarContent current={current} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

export function DocsLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const slug = docSlugFromPath(pathname);
  return (
    <div className="paper min-h-screen bg-paper font-sans text-ink">
      <Navbar />
      <Container className="pt-16">
        <MobileNav current={slug} />
        <div className="grid gap-12 pt-8 pb-24 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-12 lg:pt-10">
          <aside className="sticky top-[88px] hidden max-h-[calc(100dvh-104px)] self-start overflow-y-auto pr-2 pb-10 lg:block">
            <SidebarContent current={slug} />
          </aside>
          <main id="main-content" className="min-w-0">
            {children}
          </main>
        </div>
      </Container>
      <Footer />
    </div>
  );
}

export function DocsPending() {
  return (
    <div aria-busy="true" className="max-w-[720px] animate-pulse space-y-4">
      <span className="sr-only">Loading page</span>
      <div className="h-3 w-24 rounded bg-paper-2" />
      <div className="h-10 w-2/3 rounded bg-paper-2" />
      <div className="h-4 w-full rounded bg-paper-2" />
      <div className="h-4 w-5/6 rounded bg-paper-2" />
    </div>
  );
}
