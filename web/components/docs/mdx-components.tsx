import type { MDXComponents } from "mdx/types";
import {
  Children,
  type ComponentProps,
  isValidElement,
  type ReactNode,
  useRef,
} from "react";
import Link from "@/components/AppLink";
import { AlertTriangle, Info, Sparkle } from "@/components/icons";
import { CopyButton } from "@/components/ui/CopyButton";

/** Plain text of a React node tree (for heading ids). */
function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node))
    return textOf(node.props.children);
  return "";
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[`'’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function heading(Tag: "h2" | "h3" | "h4") {
  return function Heading({ children, id, ...props }: ComponentProps<"h2">) {
    const anchor = id ?? slugify(textOf(children));
    return (
      <Tag id={anchor} {...props}>
        <a href={`#${anchor}`} className="heading-link">
          {children}
        </a>
      </Tag>
    );
  };
}

function Anchor({ href = "", children, ...props }: ComponentProps<"a">) {
  if (href.startsWith("/") && !href.startsWith("//")) {
    return (
      <Link href={href} {...props}>
        {children}
      </Link>
    );
  }
  if (href.startsWith("#")) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
}

/** Code block from rehype-shiki, with a copy button. */
function Pre({ className, children, ...props }: ComponentProps<"pre">) {
  const ref = useRef<HTMLPreElement>(null);
  return (
    <div className="code-block">
      <pre ref={ref} className={className} {...props}>
        {children}
      </pre>
      <CopyButton
        label="Copy code"
        className="code-copy"
        getText={() => ref.current?.innerText.replace(/\n$/, "") ?? ""}
      />
    </div>
  );
}

function Table(props: ComponentProps<"table">) {
  return (
    <div className="table-wrap">
      <table {...props} />
    </div>
  );
}

const CALLOUTS = {
  note: { icon: Info, label: "Note" },
  tip: { icon: Sparkle, label: "Tip" },
  warning: { icon: AlertTriangle, label: "Warning" },
} as const;

/** `<Callout type="note|tip|warning" title="…">…</Callout>` */
function Callout({
  type = "note",
  title,
  children,
}: {
  type?: keyof typeof CALLOUTS;
  title?: string;
  children: ReactNode;
}) {
  const { icon: CalloutIcon, label } = CALLOUTS[type] ?? CALLOUTS.note;
  return (
    <aside className="callout" data-type={type} aria-label={title ?? label}>
      <CalloutIcon size={16} className="callout-icon" />
      <div className="min-w-0">
        {title ? <p className="callout-title">{title}</p> : null}
        <div className="callout-body">{children}</div>
      </div>
    </aside>
  );
}

/** `<Steps><Step title="…">…</Step></Steps>`: a numbered vertical list. */
function Steps({ children }: { children: ReactNode }) {
  const steps = Children.toArray(children).filter(isValidElement);
  return (
    <ol className="steps">
      {steps.map((step, i) => (
        <li key={step.key ?? i} className="step">
          <span className="step-number" aria-hidden="true">
            {i + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  );
}

function Step({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="step-title">{title}</p>
      <div className="step-body">{children}</div>
    </div>
  );
}

export const mdxComponents: MDXComponents = {
  h2: heading("h2"),
  h3: heading("h3"),
  h4: heading("h4"),
  a: Anchor,
  pre: Pre,
  table: Table,
  Callout,
  Steps,
  Step,
};
