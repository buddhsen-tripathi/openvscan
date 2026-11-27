import { type RefObject, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

/** "On this page", built from the rendered article's h2/h3, with scroll spy. */
export function DocsToc({
  articleRef,
  pageKey,
}: {
  articleRef: RefObject<HTMLElement | null>;
  /** The rendered page, or null while its content is still loading. */
  pageKey: string | null;
}) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const root = articleRef.current;
    if (!root || !pageKey) return;
    const headings = Array.from(
      root.querySelectorAll<HTMLHeadingElement>("h2[id], h3[id]"),
    );
    setItems(
      headings.map((h) => ({
        id: h.id,
        text: h.textContent ?? "",
        level: h.tagName === "H2" ? 2 : 3,
      })),
    );
    setActive(headings[0]?.id ?? null);
    if (!headings.length) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = headings.find((h) => visible.has(h.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-88px 0px -65% 0px" },
    );
    for (const h of headings) observer.observe(h);
    return () => observer.disconnect();
  }, [articleRef, pageKey]);

  if (items.length < 2) return null;
  return (
    <nav
      aria-label="On this page"
      className="sticky top-[96px] hidden max-h-[calc(100dvh-120px)] overflow-y-auto pb-10 xl:block"
    >
      <p className="eyebrow text-[10.5px] text-stone">On this page</p>
      <ul className="mt-3 space-y-0.5 border-l border-rule text-[13px]">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? "location" : undefined}
              className={cn(
                "-ml-px block border-l border-transparent py-1 text-stone transition-colors hover:text-ink aria-[current=location]:border-brand aria-[current=location]:text-ink",
                item.level === 3 ? "pl-6" : "pl-3",
              )}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
