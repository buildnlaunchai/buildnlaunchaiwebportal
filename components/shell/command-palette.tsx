"use client";

import { Moon, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

export type PaletteTool = { slug: string; name: string };
export type PaletteUser = { id: string; name: string; email: string };

type Item = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  keywords: string;
  run: () => void;
};

/** Subsequence fuzzy match with a crude quality score. No dependency needed. */
function score(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return t.startsWith(q) ? 3 : 2;
  // subsequence: all query chars appear in order
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length ? 1 : 0;
}

export function CommandPalette({
  open,
  onOpenChange,
  isAdmin,
  tools,
  users,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  tools: PaletteTool[];
  users: PaletteUser[];
}) {
  const router = useRouter();
  const { toggleTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    onOpenChange(false);
    setQuery("");
    setActive(0);
  }, [onOpenChange]);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => {
      router.push(href);
      close();
    };
    const nav: Item[] = [
      { id: "n-apps", label: "Apps", group: "Go to", keywords: "dashboard home tools", run: go("/dashboard") },
      { id: "n-runs", label: "Run history", group: "Go to", keywords: "runs history", run: go("/dashboard/runs") },
      { id: "n-keys", label: "Keys", group: "Go to", keywords: "keys api vault byok", run: go("/dashboard/keys") },
      { id: "n-settings", label: "Settings", group: "Go to", keywords: "settings profile", run: go("/dashboard/settings") },
      { id: "n-catalog", label: "Tool catalog", group: "Go to", keywords: "tools browse catalog", run: go("/tools") },
    ];
    const adminNav: Item[] = isAdmin
      ? [
          { id: "a-overview", label: "Admin · Overview", group: "Admin", keywords: "admin overview metrics", run: go("/admin") },
          { id: "a-apps", label: "Admin · Applications", group: "Admin", keywords: "admin applications review queue", run: go("/admin/applications") },
          { id: "a-users", label: "Admin · Users", group: "Admin", keywords: "admin users members", run: go("/admin/users") },
          { id: "a-tools", label: "Admin · Tools", group: "Admin", keywords: "admin tools editor", run: go("/admin/tools") },
          { id: "a-audit", label: "Admin · Audit log", group: "Admin", keywords: "admin audit log", run: go("/admin/audit") },
        ]
      : [];
    const toolItems: Item[] = tools.map((t) => ({
      id: `t-${t.slug}`,
      label: t.name,
      hint: t.slug,
      group: "Tools",
      keywords: `${t.name} ${t.slug}`,
      run: go(`/tools/${t.slug}`),
    }));
    const userItems: Item[] = isAdmin
      ? users.map((u) => ({
          id: `u-${u.id}`,
          label: u.name,
          hint: u.email,
          group: "Users",
          keywords: `${u.name} ${u.email}`,
          run: go(`/admin/users/${u.id}`),
        }))
      : [];
    const actions: Item[] = [
      { id: "act-theme", label: "Toggle theme", group: "Actions", keywords: "theme dark light", run: () => { toggleTheme(); close(); } },
    ];
    return [...nav, ...adminNav, ...toolItems, ...userItems, ...actions];
  }, [router, close, isAdmin, tools, users, toggleTheme]);

  const results = useMemo(() => {
    return items
      .map((it) => ({ it, s: Math.max(score(query, it.label), score(query, it.keywords) - 0.5) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((r) => r.it);
  }, [items, query]);

  // ⌘K lives in the shell (it owns `open`). Here we just focus on open.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[active]?.run();
    } else if (e.key === "Escape") {
      close();
    }
  };

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div
        className="fixed inset-0 bg-backdrop"
        onClick={close}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-[560px] overflow-hidden rounded-lg border border-line bg-elevated shadow-modal"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search aria-hidden className="size-4 shrink-0 text-text-faint" strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0); // reset selection as results change (no effect needed)
            }}
            onKeyDown={onListKey}
            placeholder="Search tools, pages, people…"
            className="h-12 w-full bg-transparent text-body text-text placeholder:text-text-faint focus:outline-none"
            aria-label="Search"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-small text-text-faint">
              Nothing matches “{query}”.
            </p>
          ) : (
            results.map((it, i) => {
              const header = it.group !== lastGroup ? it.group : null;
              lastGroup = it.group;
              return (
                <div key={it.id}>
                  {header && (
                    <p className="text-eyebrow px-4 pb-1 pt-3 text-text-faint">
                      {header}
                    </p>
                  )}
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => it.run()}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2 text-left",
                      i === active ? "bg-accent-quiet" : "",
                    )}
                  >
                    <span className={cn("truncate text-body", i === active ? "text-accent" : "text-text")}>
                      {it.label}
                    </span>
                    {it.hint && (
                      <span className="text-mono ml-auto truncate text-text-faint">
                        {it.hint}
                      </span>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-small text-text-faint">
          <span className="flex items-center gap-1">
            <Moon aria-hidden className="size-3" strokeWidth={1.5} /> ⌘K to toggle
          </span>
          <span className="ml-auto">↑↓ to move · ↵ to open · esc to close</span>
        </div>
      </div>
    </div>
  );
}
