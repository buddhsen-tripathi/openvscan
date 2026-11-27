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
 */
export function ThemeSwitch({
  className,
  tone = "auto",
}: {
  className?: string;
  tone?: "auto" | "night";
}) {
  const { preference, setTheme } = useTheme();
  return (
    <fieldset
      className={cn(
        "inline-flex items-center gap-0.5 rounded-[7px] border p-0.5",
        tone === "night" ? "border-white/15" : "border-border bg-card",
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
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-[5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
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
          </button>
        );
      })}
    </fieldset>
  );
}
