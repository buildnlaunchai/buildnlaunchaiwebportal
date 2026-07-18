"use client";

import { Moon, Sun } from "lucide-react";

import { useHydrated, useTheme } from "@/hooks/use-theme";

/** Icon-tile treatment (DESIGN.md §10 — the app shell). Matches the bell tile. */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const hydrated = useHydrated();

  // The real theme is only knowable on the client — it came from localStorage in
  // a pre-paint script. Hold the icon back for one frame so the server and client
  // never disagree about which one to draw. The tile renders at full size
  // immediately, so nothing shifts.
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      // §13: icon-only buttons have an aria-label.
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="inline-flex size-[34px] items-center justify-center rounded-[9px] border border-line bg-surface/70 text-text-muted transition-colors duration-micro ease-default hover:border-line-strong hover:bg-elevated hover:text-text"
    >
      {hydrated &&
        (theme === "dark" ? (
          <Sun aria-hidden className="size-4" strokeWidth={1.6} />
        ) : (
          <Moon aria-hidden className="size-4" strokeWidth={1.6} />
        ))}
    </button>
  );
}
