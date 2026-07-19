import type { LucideIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Panel — the standard content surface of the authenticated app.
 *
 * The cohesion lever (DESIGN.md §6, §"two intensities"): calm at rest, but
 * unmistakably from the same hand as the tool card and the shell. `rounded-lg`
 * to match the flagship card, a hairline border, and a light-catching top edge
 * (`--line-strong` on the top border only) so it reads as lit from above — the
 * motif shared by the card, the glass footer, and the shell. No shadow: static
 * content does not float (§6). No hover: a panel is not a button (§9 Card).
 *
 * `flush` drops the padding and clips its corners — for list/table containers
 * whose rows carry their own padding and hairline dividers.
 */
export function Panel({
  className,
  flush = false,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { flush?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-surface [border-top-color:var(--line-strong)]",
        flush ? "overflow-hidden" : "p-5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * SectionHeader — a titled lead for a panel or a page section. Carries the
 * icon-tile motif from the shell and card so a section head reads as part of
 * the same system, not a bare heading.
 */
export function SectionHeader({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-elevated text-text-muted [border-top-color:var(--line-strong)]">
            <Icon aria-hidden className="size-[18px]" strokeWidth={1.6} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-h3">{title}</h2>
          {description && (
            <p className="mt-0.5 text-small text-text-muted">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
