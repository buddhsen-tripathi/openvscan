import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[6px] text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out outline-none [-webkit-tap-highlight-color:transparent] active:scale-[0.97] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus-visible:ring-3 focus-visible:ring-accent-brand/25 focus-visible:border-accent-brand",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] hover:bg-primary/88",
        destructive:
          "border border-destructive/30 bg-transparent text-destructive hover:bg-destructive/[0.07]",
        outline:
          "border border-transparent bg-card text-foreground shadow-edge hover:bg-accent hover:shadow-edge-hover",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 gap-1.5 px-3 text-[13px]",
        lg: "h-11 px-5 text-[15px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button };
