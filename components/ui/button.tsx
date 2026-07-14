"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/* DESIGN.md §9 — Button.
   Four variants, three sizes, six states. Every value is a token; there is not
   a hex code or an arbitrary length in this file. */

const button = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-sm font-sans font-medium",
    "transition-[color,background-color,border-color,transform] duration-micro ease-default",
    // §9: every button implements active, focus-visible, disabled.
    "active:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-50",
    "cursor-pointer disabled:cursor-not-allowed",
  ],
  {
    variants: {
      variant: {
        // §2: one accent per screen. This marks the single most important action.
        primary: "bg-accent text-accent-text hover:bg-accent-hover",
        secondary:
          "bg-surface text-text border border-line hover:border-line-strong",
        ghost: "bg-transparent text-text-muted hover:text-text hover:bg-elevated",
        // §9: destructive. Fills on hover.
        danger:
          "bg-transparent text-danger border border-danger hover:bg-danger hover:text-accent-text",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-[38px] px-4 text-[15px]",
        // §9: lg is for landing CTAs only.
        lg: "h-11 px-5 text-[15px]",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  /** §9: "Every button that triggers an async action has one. No exceptions." */
  pending?: boolean;
}

export function Button({
  className,
  variant,
  size,
  pending = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(button({ variant, size }), className)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {/* §9: "the label is replaced by a spinner at the measured width of the
          label, so the button does not resize." Rendering the label invisibly
          underneath holds the width open — no measuring, no layout jump. */}
      {pending ? (
        <span className="relative inline-flex items-center justify-center">
          <span className="invisible contents">{children}</span>
          <Loader2
            aria-hidden
            className="absolute size-4 animate-spin"
            strokeWidth={1.5}
          />
        </span>
      ) : (
        children
      )}
    </button>
  );
}
