import type * as React from "react";
import { ChevronsUpDown } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A native select styled like Input: keyboard, screen-reader and mobile
 * behaviour come from the browser, and the options are a fixed list.
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  ...props
}: Omit<React.ComponentProps<"select">, "value" | "onChange"> & {
  value: T;
  onChange: (value: T) => void;
  options: readonly SelectOption<T>[];
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={cn(
          "h-9 w-full cursor-pointer appearance-none rounded-[6px] border border-input bg-card py-1 pr-8 pl-3 text-sm text-foreground transition-colors",
          "focus-visible:outline-none focus-visible:border-accent-brand focus-visible:ring-3 focus-visible:ring-accent-brand/15",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronsUpDown
        size={14}
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
