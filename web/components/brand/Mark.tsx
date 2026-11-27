import { cn } from "@/lib/utils";

/**
 * The OpenVScan mark: a "V" cut into scan lines. The two arms meet as the lines
 * move down, the way scanner noise narrows to the few findings that matter.
 * Drawn on a 72×56 grid and filled with currentColor.
 */
const MARK_VIEWBOX = "0 0 72 56";
const MARK_PATHS = [
  "M0 0H21.5L26.85 10.7H4.6Z",
  "M50.5 0H72L67.4 10.7H45.15Z",
  "M6.49 15.1H29.05L34.4 25.8H11.09Z",
  "M42.95 15.1H65.51L60.91 25.8H37.6Z",
  "M12.99 30.2H59.01L54.41 40.9H17.59Z",
  "M19.48 45.3H52.52L47.92 56H24.08Z",
];

export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      fill="currentColor"
      className={cn("h-[14px] w-[18px] shrink-0", className)}
      aria-hidden="true"
    >
      {MARK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** Mark + wordmark. Size it with font-size; the mark scales with it. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.42em] leading-none",
        className,
      )}
    >
      <Mark className="h-[0.78em] w-[1em] text-brand" />
      <span className="font-display tracking-[-0.02em]">OpenVScan</span>
    </span>
  );
}
