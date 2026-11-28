import { motion } from "framer-motion";
import type { ReactNode } from "react";
import Link from "@/components/AppLink";
import { ArrowRight } from "@/components/icons";
import { cn } from "@/lib/utils";

export const INSTALL_HREF = "/dashboard/repositories";
export const SELF_HOST_HREF = "/docs/self-hosting";
export const DOCS_HREF = "/docs";

export function Container({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[1312px] px-5 sm:px-8", className)}
    >
      {children}
    </div>
  );
}

/** A small rounded label with a dot, above a section heading. */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cn("eyebrow text-stone", className)}>{children}</p>;
}

/** Eyebrow pill and serif title on the left, supporting copy on the right. */
export function SectionHeading({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Reveal
      className={cn(
        "grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-end lg:gap-16",
        className,
      )}
    >
      <div>
        <h2 className="max-w-[680px] font-editorial text-[44px] leading-[1.02] text-ink sm:text-[62px]">
          {title}
        </h2>
      </div>
      {children && (
        <div className="max-w-[440px] text-[17px] leading-[1.6] text-stone lg:justify-self-end lg:pb-2">
          {children}
        </div>
      )}
    </Reveal>
  );
}

type ButtonProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "outline" | "light";
  arrow?: boolean;
  className?: string;
};

export function Button({
  href,
  children,
  variant = "primary",
  arrow,
  className,
}: ButtonProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        variant === "primary" && "bg-ink text-paper hover:bg-ink-2",
        variant === "outline" &&
          "border border-ink bg-transparent text-ink hover:bg-ink/[0.04]",
        variant === "light" && "bg-day text-night hover:bg-white",
        className,
      )}
    >
      {children}
      {arrow && (
        <ArrowRight
          size={16}
          className="transition-transform group-hover:translate-x-0.5"
        />
      )}
    </Link>
  );
}

/** Text link with an arrow, as under the feature cards. */
export function ArrowLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1.5 text-[14px] font-medium text-ink"
    >
      <span className="link-underline">{children}</span>
      <ArrowRight
        size={14}
        className="transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** A light UI card floating on a brush panel. */
export function Sheet({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[8px] border border-rule/70 bg-chalk text-ink shadow-[0_1px_2px_rgb(18_17_15/0.06),0_18px_40px_-12px_rgb(18_17_15/0.28)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
