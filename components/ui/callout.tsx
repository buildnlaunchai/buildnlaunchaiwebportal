import type { LucideIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Callout — an inline, semantic notice (a tool in maintenance, a missing key, a
 * saved-draft confirmation). One shape for all of them: a lit hairline panel
 * tinted by tone, an optional leading icon, and an optional trailing action.
 * Semantic color only (§2) — the tone carries the meaning, never decoration.
 */
type Tone = "info" | "warn" | "danger" | "success";

const TONE: Record<Tone, string> = {
  info: "border-line bg-accent-quiet/40 text-text",
  warn: "border-warn/40 bg-warn-quiet text-warn",
  danger: "border-danger/40 bg-danger-quiet text-danger",
  success: "border-live/40 bg-live-quiet text-live",
};

export function Callout({
  tone = "info",
  icon: Icon,
  action,
  className,
  children,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-small [border-top-color:var(--line-strong)]",
        TONE[tone],
        className,
      )}
      role={tone === "danger" || tone === "warn" ? "alert" : undefined}
    >
      {Icon && (
        <Icon
          aria-hidden
          className={cn("mt-0.5 size-[18px] shrink-0", tone === "info" && "text-accent")}
          strokeWidth={1.6}
        />
      )}
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
