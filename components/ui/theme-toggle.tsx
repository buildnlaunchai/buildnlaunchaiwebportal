"use client";

import { Moon, Sun } from "lucide-react";

import { useHydrated, useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const hydrated = useHydrated();

  // The real theme is only knowable on the client — it came from localStorage in
  // a pre-paint script. Hold the icon back for one frame so the server and client
  // never disagree about which one to draw. The button itself renders at full
  // size immediately, so nothing shifts.
  const next = theme === "dark" ? "light" : "dark";

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      // §13: icon-only buttons have an aria-label.
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="size-8 px-0"
    >
      {hydrated &&
        (theme === "dark" ? (
          <Sun aria-hidden className="size-4" strokeWidth={1.5} />
        ) : (
          <Moon aria-hidden className="size-4" strokeWidth={1.5} />
        ))}
    </Button>
  );
}
