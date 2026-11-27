import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import Link from "@/components/AppLink";
import { Wordmark } from "@/components/brand/Mark";
import { docSlugFromPath, docTab } from "@/components/docs/pages";
import { Github, Menu, Star, X } from "@/components/icons";
import {
  Container,
  DOCS_HREF,
  SELF_HOST_HREF,
} from "@/components/landing/primitives";
import { REPO_SLUG, REPO_URL } from "@/components/site";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Product", match: (p: string) => p === "/" },
  {
    href: DOCS_HREF,
    label: "Docs",
    match: (p: string) =>
      p.startsWith("/docs") && docTab(docSlugFromPath(p)).id === "docs",
  },
  {
    href: SELF_HOST_HREF,
    label: "Self-hosting",
    match: (p: string) =>
      p.startsWith("/docs") && docTab(docSlugFromPath(p)).id === "self-hosting",
  },
];

function formatStars(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
}

export default function Navbar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    fetch(`https://api.github.com/repos/${REPO_SLUG}`)
      .then((res) => res.json() as Promise<{ stargazers_count?: number }>)
      .then((d) => {
        if (typeof d.stargazers_count === "number")
          setStars(d.stargazers_count);
      })
      .catch(() => {});
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300",
        scrolled || open
          ? "border-rule bg-paper/85 backdrop-blur-xl"
          : "border-transparent bg-paper",
      )}
    >
      <Container className="flex h-16 items-center gap-10">
        <Link href="/" className="text-ink" aria-label="OpenVScan home">
          <Wordmark className="text-[23px]" />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.match(pathname) ? "page" : undefined}
              className="text-[15px] text-stone transition-colors hover:text-ink aria-[current=page]:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="OpenVScan on GitHub"
            className="hidden h-9 items-center gap-1.5 rounded-[4px] px-2.5 text-[14px] text-ink-2 transition-colors hover:bg-ink/[0.04] md:inline-flex"
          >
            <Github size={16} />
            <Star size={13} className="text-stone" />
            {stars !== null ? formatStars(stars) : "Star"}
          </Link>
          <Link
            href="/signin"
            className="hidden h-9 items-center rounded-[4px] bg-ink px-3.5 text-[14px] font-medium text-paper transition-colors hover:bg-ink-2 md:inline-flex"
          >
            Sign in
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="grid size-9 place-items-center rounded-[4px] text-ink md:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </Container>

      {open && (
        <nav className="border-t border-rule md:hidden">
          <Container className="flex flex-col py-3">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="py-2.5 text-[16px] text-ink-2"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2 pb-2">
              <Link
                href={REPO_URL}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[4px] border border-ink text-[15px] text-ink"
              >
                <Github size={15} /> GitHub
              </Link>
              <Link
                href="/signin"
                className="inline-flex h-10 items-center justify-center rounded-[4px] bg-ink text-[15px] font-medium text-paper"
              >
                Sign in
              </Link>
            </div>
          </Container>
        </nav>
      )}
    </header>
  );
}
