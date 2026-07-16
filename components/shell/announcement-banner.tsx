"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { useHydrated } from "@/hooks/use-theme";
import type { Announcement } from "@/lib/announcements";
import { cn } from "@/lib/utils";

const VARIANT = {
  info: "border-accent bg-accent-quiet text-text",
  success: "border-live bg-live-quiet text-text",
  warning: "border-warn bg-warn-quiet text-text",
} as const;

/**
 * The announcements banner (§10, §6.10). Dismissible per-announcement via
 * localStorage keyed on the id, so dismissing one doesn't hide the next. Renders
 * nothing until mounted, so a dismissed banner never flashes.
 */
export function AnnouncementBanner({ announcement }: { announcement: Announcement | null }) {
  const hydrated = useHydrated();
  const [dismissed, setDismissed] = useState(false);

  // Render nothing until hydrated, so a dismissed banner never flashes; then read
  // localStorage during render (client-only) rather than in an effect.
  if (!hydrated || !announcement || dismissed) return null;
  let stored = false;
  try {
    stored = localStorage.getItem(`ann-dismissed-${announcement.id}`) === "1";
  } catch {
    stored = false;
  }
  if (stored) return null;

  const variant = (VARIANT as Record<string, string>)[announcement.variant] ?? VARIANT.info;

  const dismiss = () => {
    try {
      localStorage.setItem(`ann-dismissed-${announcement.id}`, "1");
    } catch {
      /* private mode — dismiss for this session only */
    }
    setDismissed(true);
  };

  return (
    <div className={cn("mb-6 flex items-center gap-3 rounded-md border px-4 py-3", variant)}>
      <div className="min-w-0 flex-1">
        <span className="text-small font-medium">{announcement.title}</span>
        {announcement.body && (
          <span className="ml-2 text-small text-text-muted">{announcement.body}</span>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 text-text-muted transition-colors duration-micro ease-default hover:text-text"
      >
        <X aria-hidden className="size-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
