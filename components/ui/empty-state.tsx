import type { LucideIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * EmptyState (DESIGN.md §9) — "not a shrug." A centered block, max 400px: a
 * quiet icon tile, an `h3`, one line explaining what goes here, and one action.
 * The copy sells and directs (§12); it never says "No data".
 *
 * The icon sits in the same lit tile the shell and card use, so an empty screen
 * still feels like the product rather than a gap in it.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  description: React.ReactNode;
  /** One primary action, per §9. Optional — some terminal states have none. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-[400px] flex-col items-center gap-5 py-16 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-xl border border-line bg-surface text-text-faint [border-top-color:var(--line-strong)]">
        <Icon aria-hidden className="size-6" strokeWidth={1.5} />
      </span>
      <div className="flex flex-col gap-2">
        <h3 className="text-h3">{title}</h3>
        <p className="text-small text-text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
