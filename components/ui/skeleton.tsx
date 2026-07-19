import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Skeleton (DESIGN.md §9) — an `--elevated` block at the exact dimensions of
 * what's coming, pulsing opacity 0.5 → 0.8 → 0.5 over 1.6s (`run-skeleton`).
 * Never a shimmer-sweep gradient. Loading is the shape of the answer, not a
 * spinner (§14).
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("run-skeleton rounded-sm bg-elevated", className)}
      {...props}
    />
  );
}
