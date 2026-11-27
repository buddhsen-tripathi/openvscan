import type * as React from "react";
import { Search } from "@/components/icons";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full rounded-[6px] border border-input bg-card px-3 py-1 text-sm transition-colors",
        "placeholder:text-muted-foreground/60",
        "focus-visible:outline-none focus-visible:border-accent-brand focus-visible:ring-3 focus-visible:ring-accent-brand/15",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-[6px] border border-input bg-card px-3 py-2 text-sm leading-relaxed transition-colors",
        "placeholder:text-muted-foreground/60",
        "focus-visible:outline-none focus-visible:border-accent-brand focus-visible:ring-3 focus-visible:ring-accent-brand/15",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: generic wrapper; callers pass htmlFor.
    <label
      data-slot="label"
      className={cn(
        "text-[13px] font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
}

/** A search box with a leading icon. Needs an aria-label: the icon isn't one. */
function SearchInput({
  className,
  inputClassName,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & {
  "aria-label": string;
  inputClassName?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        size={14}
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input type="search" className={cn("pl-8", inputClassName)} {...props} />
    </div>
  );
}

/** Label above a control, with an optional element on the label's right. */
function Field({
  label,
  htmlFor,
  aside,
  children,
}: {
  label: React.ReactNode;
  htmlFor: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={htmlFor}>{label}</Label>
        {aside}
      </div>
      {children}
    </div>
  );
}

export { Field, Input, Label, SearchInput, Textarea };
