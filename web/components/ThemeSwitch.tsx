import { type Icon, Laptop, Moon, Sun } from "@/components/icons";
import { type ThemePreference, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemePreference; label: string; icon: Icon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
];

/**
 * Three-way Light / Dark / System switch.
 *
 * `tone="night"` is for surfaces that stay dark in both themes (the footer).
 * `labels` shows the words next to the icons (the dashboard sidebar).
 */
export function ThemeSwitch({
  className,
  tone = "auto",
  labels = false,
}: {
  className?: string;
  tone?: "auto" | "night";
  labels?: boolean;
}) {
  const { preference, setTheme } = useTheme();
  return (
    <fieldset
      className={cn(
        "inline-flex items-center gap-0.5 rounded-[7px] border p-0.5",
        tone === "night" ? "border-white/15" : "border-border bg-card",
        labels && "w-full",
        className,
      )}
    >
      <legend className="sr-only">Theme</legend>
      {OPTIONS.map(({ value, label, icon: OptionIcon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            aria-label={labels ? undefined : `${label} theme`}
            title={`${label} theme`}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex h-7 items-center justify-center gap-1.5 rounded-[5px] text-[12.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              labels ? "flex-1 px-2" : "w-7",
              tone === "night"
                ? active
                  ? "bg-white/12 text-white"
                  : "text-white/50 hover:text-white"
                : active
                  ? "bg-accent text-foreground shadow-[0_0_0_1px_var(--border)]"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            <OptionIcon size={14} />
            {labels && label}
          </button>
        );
      })}
    </fieldset>
  );
}
