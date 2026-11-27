import Link from "@/components/AppLink";
import { Wordmark } from "@/components/brand/Mark";
import { Container } from "@/components/landing/primitives";
import { ThemeSwitch } from "@/components/ThemeSwitch";

const COLUMNS = [
  {
    heading: "Product",
    links: [
      { href: "/#product", label: "How it works" },
      { href: "/docs/security-model", label: "Security" },
      { href: "/docs/faq", label: "FAQ" },
    ],
  },
  {
    heading: "Developers",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: "/docs/quickstart", label: "Quickstart" },
      { href: "/docs/self-hosting", label: "Self-hosting" },
    ],
  },
] as const;

export default function Footer() {
  return (
    <footer className="bg-night text-day dark:border-t dark:border-white/10">
      <Container className="pt-16 pb-8">
        <div className="flex flex-col gap-12 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <Wordmark className="text-[26px] text-day" />
            <p className="mt-4 text-[14px] leading-relaxed text-day/55">
              Open-source security review for GitHub pull requests. Scanners
              plus your own coding agent.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-16 gap-y-10 text-[14px]">
            {COLUMNS.map((column) => (
              <div key={column.heading}>
                <h2 className="eyebrow mb-4 text-[11px] text-day/40">
                  {column.heading}
                </h2>
                <ul className="space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-day/75 transition-colors hover:text-day"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 text-[12.5px] text-day/45 sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} OpenVScan · AGPL-3.0</span>
          <ThemeSwitch tone="night" />
        </div>
      </Container>
    </footer>
  );
}
