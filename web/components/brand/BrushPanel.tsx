import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Tone colours are the --color-brush-<tone>-* tokens in styles.css. */
export type BrushTone = "moss" | "pine" | "umber" | "sand";

const tone = (t: BrushTone, part: "base" | "stroke" | "wash") =>
  `var(--color-brush-${t}-${part})`;

/**
 * A dry-brush illustration panel: a tinted ground with a few stippled strokes,
 * used behind product UI cards. `variant` moves the strokes so neighbouring
 * panels don't repeat.
 */
export function BrushPanel({
  id,
  tone: t = "moss",
  variant = 0,
  className,
  children,
}: {
  id: string;
  tone?: BrushTone;
  variant?: 0 | 1 | 2;
  className?: string;
  children?: ReactNode;
}) {
  const strokes = [
    [
      ["M-80 520 C 180 380, 380 640, 640 470 S 1060 300, 1300 420", 190, 0.78],
      ["M-60 120 C 160 60, 260 260, 520 170", 120, 0.55],
      ["M860 720 C 960 600, 1120 640, 1280 560", 140, 0.6],
    ],
    [
      ["M-100 180 C 200 120, 420 320, 760 220 S 1100 120, 1320 200", 170, 0.7],
      ["M300 760 C 520 600, 760 700, 1000 600", 150, 0.6],
    ],
    [
      ["M-60 640 C 240 560, 420 720, 700 600", 160, 0.7],
      ["M620 60 C 820 20, 980 200, 1300 120", 150, 0.62],
      ["M-80 280 C 60 240, 120 340, 260 300", 90, 0.45],
    ],
  ] as const;

  return (
    <div
      className={cn("relative isolate overflow-hidden", className)}
      style={{ backgroundColor: tone(t, "base") }}
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 size-full"
        viewBox="0 0 1200 700"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <filter id={`${id}-dry`} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.012 0.09"
              numOctaves="4"
              seed={7 + variant}
              result="streaks"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="streaks"
              scale="70"
              xChannelSelector="R"
              yChannelSelector="G"
              result="warped"
            />
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="2"
              seed="3"
              result="speckle"
            />
            <feColorMatrix
              in="speckle"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.55"
              result="mask"
            />
            <feComposite in="warped" in2="mask" operator="in" />
          </filter>
          <filter id={`${id}-soft`}>
            <feGaussianBlur stdDeviation="60" />
          </filter>
        </defs>
        <ellipse
          cx={variant === 1 ? 300 : 900}
          cy="140"
          rx="420"
          ry="220"
          filter={`url(#${id}-soft)`}
          opacity="0.9"
          style={{ fill: tone(t, "wash") }}
        />
        <g
          filter={`url(#${id}-dry)`}
          fill="none"
          strokeLinecap="round"
          style={{ stroke: tone(t, "stroke") }}
        >
          {strokes[variant].map(([d, w, o]) => (
            <path key={d} d={d} strokeWidth={w} opacity={o} />
          ))}
        </g>
      </svg>
      {children}
    </div>
  );
}
