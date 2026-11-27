import { createContext, type ReactNode, useContext, useEffect } from "react";
import { AlertTriangle, Spinner } from "@/components/icons";
import { cn } from "@/lib/utils";

/* ------------------------------ Breadcrumbs ------------------------------- */

type CrumbSetter = (label: string | null) => void;
export const CrumbContext = createContext<CrumbSetter>(() => {});

/** Detail pages name themselves in the top bar ("Repositories / acme/api"). */
export function useBreadcrumb(label: string | null | undefined) {
  const set = useContext(CrumbContext);
  useEffect(() => {
    set(label ?? null);
    return () => set(null);
  }, [label, set]);
}

/* ------------------------------- Page header ------------------------------ */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="eyebrow mb-2.5 text-muted-foreground">{eyebrow}</div>
        )}
        <h1 className="font-display text-[30px] leading-[1.1] tracking-[-0.02em] text-foreground sm:text-[34px]">
          {title}
        </h1>
        {description && (
          <div className="mt-2 text-[14.5px] text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}

/* --------------------------------- Panels --------------------------------- */

export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[10px] border border-transparent bg-card shadow-edge",
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[14px] font-semibold text-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Column headings for list panels. Hidden on small screens. */
export function ListHead({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "eyebrow hidden border-b border-border bg-muted/50 px-5 py-2 text-[10.5px] text-muted-foreground md:grid",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Underlined tabs. Render the active panel yourself. */
export function TabBar<T extends string>({
  label,
  tabs,
  value,
  onChange,
  className,
}: {
  label: string;
  tabs: { key: T; label: ReactNode }[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("flex gap-5", className)}
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "-mb-px inline-flex items-center gap-1.5 border-b-2 pb-3 text-[13.5px] transition-colors",
            value === t.key
              ? "border-foreground font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------- Stats --------------------------------- */

export function StatStrip({
  items,
}: {
  items: {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    tone?: "danger";
  }[];
}) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-transparent bg-card shadow-edge lg:grid-cols-4">
      {items.map((s, i) => (
        <div
          key={s.label}
          className={cn(
            "border-border px-5 py-4",
            i % 2 === 0 && "border-r",
            i < items.length - 2 && "border-b lg:border-b-0",
            "lg:border-r lg:last:border-r-0",
          )}
        >
          <div className="eyebrow text-[10.5px] text-muted-foreground">
            {s.label}
          </div>
          <div
            className={cn(
              "tabular mt-2 font-display text-[34px] leading-none tracking-[-0.02em]",
              s.tone === "danger" ? "text-status-failed" : "text-foreground",
            )}
          >
            {s.value}
          </div>
          {s.hint && (
            <div className="mt-2 text-[12.5px] text-muted-foreground">
              {s.hint}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Empty & states ---------------------------- */

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: React.ComponentType<{ className?: string; size?: number }>;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="grid size-11 place-items-center rounded-[10px] border border-transparent bg-background text-muted-foreground shadow-edge">
        <Icon size={19} />
      </div>
      <h3 className="mt-4 font-display text-[21px] tracking-[-0.01em] text-foreground">
        {title}
      </h3>
      {children && (
        <div className="mt-1.5 max-w-[420px] text-[14px] leading-relaxed text-muted-foreground">
          {children}
        </div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Loading({ className }: { className?: string }) {
  return (
    <div className={cn("flex justify-center py-20", className)}>
      <Spinner className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-[8px] border px-3.5 py-2.5 text-[13.5px] leading-relaxed",
        tone === "info" && "border-border bg-muted/60 text-foreground",
        tone === "success" &&
          "border-status-completed/25 bg-status-completed-muted text-foreground",
        tone === "warning" &&
          "border-status-pending/30 bg-status-pending-muted text-foreground",
        tone === "danger" &&
          "border-status-failed/25 bg-status-failed-muted text-foreground",
        className,
      )}
    >
      {(tone === "warning" || tone === "danger") && (
        <AlertTriangle
          size={15}
          className={cn(
            "mt-[3px] shrink-0",
            tone === "warning" ? "text-status-pending" : "text-status-failed",
          )}
        />
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* --------------------------------- Forms ---------------------------------- */

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent-brand/25",
        checked ? "bg-accent-brand" : "bg-input",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/** A labelled row inside a settings panel: text left, control right. */
export function SettingRow({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-foreground">{title}</div>
        {description && (
          <div className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/** Settings page section: heading on the left, panel on the right. */
export function SettingsSection({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="grid scroll-mt-20 gap-4 border-t border-border py-8 first:border-t-0 first:pt-0 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10"
    >
      <div>
        <h2 className="font-display text-[21px] tracking-[-0.01em] text-foreground">
          {title}
        </h2>
        {description && (
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function Avatar({
  name,
  image,
  size = 28,
  className,
}: {
  name: string;
  image?: string | null;
  size?: number;
  className?: string;
}) {
  if (image) {
    return (
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={cn(
          "shrink-0 rounded-full object-cover outline -outline-offset-1 outline-black/10 dark:outline-white/10",
          className,
        )}
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-accent-brand font-medium text-accent-brand-foreground",
        className,
      )}
    >
      {name?.charAt(0)?.toUpperCase() || "?"}
    </span>
  );
}

/** A GitHub user or organisation avatar, by login. Size it with className. */
export function GithubAvatar({
  login,
  className,
}: {
  login: string;
  className?: string;
}) {
  return (
    <img
      src={`https://github.com/${encodeURIComponent(login)}.png?size=40`}
      alt=""
      className={cn(
        "size-6 shrink-0 rounded-[5px] bg-muted outline -outline-offset-1 outline-black/10 dark:outline-white/10",
        className,
      )}
    />
  );
}
