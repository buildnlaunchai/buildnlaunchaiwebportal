"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

/**
 * The `data-theme` attribute on <html> IS the store.
 *
 * A blocking script in app/layout.tsx puts the right value there before first
 * paint, so by the time React runs, the truth already exists in the DOM. Copying
 * it into React state would just create a second source of truth that can
 * disagree with the first for a frame — which is exactly what a theme flash is.
 *
 * So we subscribe to the attribute instead of duplicating it. No provider, no
 * effect, no setState-on-mount.
 */

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

// On the server there is no DOM. Dark is the primary mode (DESIGN.md §2), so it
// is the honest default to render before the client tells us otherwise.
function getServerSnapshot(): Theme {
  return "dark";
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Private mode or storage disabled. The theme still applies for this
      // session, it just won't be remembered. Not worth surfacing to the user.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(getSnapshot() === "dark" ? "light" : "dark");
  }, [setTheme]);

  return { theme, setTheme, toggleTheme };
}

/**
 * True only after hydration. Same trick, no setState in an effect: the store
 * never changes, but the server and client snapshots differ by definition.
 */
const neverChanges = () => () => {};

export function useHydrated() {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}
