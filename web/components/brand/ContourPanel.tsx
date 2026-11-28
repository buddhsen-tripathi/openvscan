import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A soft gradient ground with topographic contour lines, for the hero and
 * the feature cards. Colours are the --color-glow-* tokens in styles.css,
 * which the dark theme remaps. Pure CSS and SVG: nothing to download.
 */
export function ContourPanel({
  className,
  children,
  variant = 0,
}: {
  className?: string;
  children?: ReactNode;
  /** Moves the light so neighbouring panels don't repeat. */
  variant?: 0 | 1 | 2;
}) {
  const glows = [
    "radial-gradient(60% 70% at 18% 22%, var(--color-glow-ochre) 0%, transparent 62%), radial-gradient(55% 65% at 82% 18%, var(--color-glow-mist) 0%, transparent 60%), radial-gradient(70% 80% at 62% 92%, var(--color-glow-leaf) 0%, transparent 65%), radial-gradient(80% 90% at 30% 85%, var(--color-glow-pine) 0%, transparent 70%)",
    "radial-gradient(65% 75% at 80% 25%, var(--color-glow-ochre) 0%, transparent 60%), radial-gradient(60% 70% at 15% 30%, var(--color-glow-leaf) 0%, transparent 62%), radial-gradient(75% 85% at 50% 100%, var(--color-glow-pine) 0%, transparent 68%)",
    "radial-gradient(60% 70% at 50% 0%, var(--color-glow-mist) 0%, transparent 60%), radial-gradient(70% 80% at 10% 90%, var(--color-glow-ochre) 0%, transparent 62%), radial-gradient(70% 80% at 90% 80%, var(--color-glow-pine) 0%, transparent 66%)",
  ];
  return (
    <div
      className={cn("relative isolate overflow-hidden", className)}
      style={{
        backgroundColor: "var(--color-glow-base)",
        backgroundImage: glows[variant],
      }}
    >
      <Contours seed={variant} />
      {children}
    </div>
  );
}

/** Wavy, roughly parallel lines, like a topographic map. Deterministic. */
function Contours({ seed }: { seed: number }) {
  const lines: string[] = [];
  const count = 44;
  for (let i = 0; i < count; i++) {
    const y0 = -160 + i * 24;
    const a = 38 + ((i * 7 + seed * 11) % 14);
    const k = 0.0046 + ((i + seed) % 3) * 0.0002;
    const phase = i * 0.18 + seed * 1.7;
    let d = "";
    for (let x = -40; x <= 1240; x += 40) {
      const y =
        y0 +
        Math.sin(x * k + phase) * a +
        Math.sin(x * k * 2.3 + phase * 0.6) * (a * 0.35) +
        x * 0.12;
      d += `${x === -40 ? "M" : "L"}${x} ${y.toFixed(1)} `;
    }
    lines.push(d);
  }
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 size-full"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
    >
      <g
        fill="none"
        strokeWidth="1"
        strokeLinejoin="round"
        style={{ stroke: "var(--color-glow-line)" }}
      >
        {lines.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}
