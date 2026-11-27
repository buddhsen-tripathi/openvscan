import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Pick one of a few options; each option is a toggle button. */
export function SegmentedControl<T extends string | null>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  /** Accessible name for the group. */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <fieldset
      aria-label={label}
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
      className={cn(
        "grid min-w-0 gap-1 rounded-[8px] bg-muted p-1 text-[13px]",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[6px] px-2 py-1.5 transition-colors",
            value === o.value
              ? "bg-card font-medium text-foreground shadow-card"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}
