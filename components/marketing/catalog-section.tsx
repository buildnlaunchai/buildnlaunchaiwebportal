"use client";

import { Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { CatalogCard } from "@/components/marketing/catalog-card";
import type { ToolCardData } from "@/lib/tools";
import { cn } from "@/lib/utils";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The interactive catalog (redesigned §catalog). Owns the filter-tab state that
 * drives the grid, so the tabs (top-left) and the grid (below) live together.
 * The featured hero is server-rendered and handed in as `featuredSlot` so its
 * cover image and stats stay on the server. `newCutoff` (epoch ms) comes from
 * the server so the "New" filter is a pure comparison, not a Date.now() call.
 */
export function CatalogSection({
  tools,
  featuredSlot,
  newCutoff,
}: {
  tools: ToolCardData[];
  featuredSlot: React.ReactNode;
  newCutoff: number;
}) {
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of tools) if (t.category) set.add(t.category);
    return Array.from(set);
  }, [tools]);

  const [active, setActive] = useState<string>("all");

  const filtered = useMemo(() => {
    if (active === "all") return tools;
    if (active === "__new") {
      return tools.filter(
        (t) => t.launched_at && new Date(t.launched_at).getTime() >= newCutoff,
      );
    }
    return tools.filter((t) => t.category === active);
  }, [tools, active, newCutoff]);

  const tabs = [
    { key: "all", label: "All" },
    ...categories.map((c) => ({ key: c, label: cap(c) })),
    { key: "__new", label: "New", dot: true },
  ];

  return (
    <>
      {/* top row: headline + filters (left) · featured hero (right) */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.68fr)] lg:items-stretch">
        <div className="flex flex-col">
          <span className="text-eyebrow inline-flex items-center gap-2 self-start rounded-pill border border-[color:rgba(200,242,79,0.22)] bg-accent-quiet px-3 py-1.5 text-accent">
            <Sparkles aria-hidden className="size-3.5" strokeWidth={2} />
            AI Tool Catalog
          </span>
          <h1 className="text-display-l mt-5">
            Run production-ready{" "}
            <span className="font-semibold text-accent">AI tools</span>
          </h1>
          <p className="mt-4 max-w-[36ch] text-body text-text-muted">
            Every tool I&apos;ve shipped, and a few on the way — run them with your
            own keys, so you pay your provider directly and nothing runs through my
            bill.
          </p>

          <div
            role="tablist"
            aria-label="Filter tools"
            className="mt-auto flex flex-wrap gap-2 pt-8"
          >
            {tabs.map((tab) => {
              const on = active === tab.key;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActive(tab.key)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-pill border px-4 py-2 text-label transition-colors duration-micro ease-default",
                    on
                      ? "border-[color:rgba(200,242,79,0.45)] bg-accent-quiet text-accent"
                      : "border-transparent text-text-muted hover:text-text",
                  )}
                >
                  {tab.dot && (
                    <span aria-hidden className="size-1.5 rounded-pill bg-accent" />
                  )}
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>{featuredSlot}</div>
      </div>

      {/* the grid */}
      {filtered.length === 0 ? (
        <p className="mt-10 text-small text-text-faint">
          No tools in this filter yet — check back soon.
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tool) => (
            <CatalogCard key={tool.slug} tool={tool} />
          ))}
        </div>
      )}
    </>
  );
}
