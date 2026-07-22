import { ArrowRight, Lock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { ToolIcon } from "@/components/tools/tool-icon";
import type { ToolCardData } from "@/lib/tools";

/** Friendly one-word label for a runtime, used when a tool has no category. */
const RUNTIME_LABEL: Record<ToolCardData["runtime"], string> = {
  edge_function: "Automation",
  internal: "App",
  iframe: "App",
  external_link: "Link",
};

/**
 * The public catalog card (redesigned §catalog): cover-forward, with a category
 * badge over the image, a short tag row, and an access-aware footer. Presentational
 * — safe to render inside the client CatalogSection grid.
 */
export function CatalogCard({ tool }: { tool: ToolCardData }) {
  const badge = (tool.category ?? RUNTIME_LABEL[tool.runtime]).toUpperCase();
  const runsFree =
    tool.access_type === "public_preview" && tool.required_providers.length === 0;

  // Honest tags from real data: the category, then either the providers a member
  // must bring or "No key needed".
  const tags = [
    tool.category,
    ...(tool.required_providers.length
      ? tool.required_providers
      : ["No key needed"]),
  ]
    .filter(Boolean)
    .slice(0, 3) as string[];

  return (
    <article className="group flex flex-col overflow-hidden rounded-[18px] border border-line bg-surface transition-[border-color,transform] duration-micro ease-default hover:-translate-y-0.5 hover:border-line-strong">
      {/* cover */}
      <div className="relative aspect-[16/10] overflow-hidden border-b border-line bg-elevated">
        {tool.cover_image_url ? (
          <Image
            src={tool.cover_image_url}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 420px"
            className="object-cover transition-transform duration-layout ease-default group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-[radial-gradient(70%_90%_at_50%_30%,rgba(200,242,79,0.12),transparent_60%)] text-text-faint">
            <ToolIcon name={tool.icon} className="size-9 opacity-60" />
          </div>
        )}
        <span className="text-mono-chip absolute left-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-[8px] border border-line-strong bg-[var(--backdrop)] px-2.5 py-1.5 uppercase tracking-[0.06em] text-accent backdrop-blur-sm">
          {badge}
        </span>
      </div>

      {/* body */}
      <div className="flex flex-1 flex-col px-5 pt-4">
        <h3 className="text-h3 text-[18px]">{tool.name}</h3>
        <p className="mt-2 text-small text-text-muted">{tool.tagline}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-[7px] border border-line bg-[var(--sunken)] px-2.5 py-1 text-[11.5px] font-medium text-text-muted"
            >
              {t}
            </span>
          ))}
        </div>
        <div className="min-h-4 flex-1" />
      </div>

      {/* footer */}
      <div className="mt-4 flex items-center justify-between border-t border-line px-5 py-3.5">
        <span className="inline-flex items-center gap-2 text-mono-chip">
          {runsFree ? (
            <>
              <span aria-hidden className="size-1.5 rounded-pill bg-live" />
              <span className="text-live">runs free</span>
            </>
          ) : (
            <>
              <Lock aria-hidden className="size-3.5 text-text-faint" strokeWidth={1.8} />
              <span className="text-text-faint">Members only</span>
            </>
          )}
        </span>
        <Link
          href={`/tools/${tool.slug}`}
          className="inline-flex items-center gap-1.5 rounded-[11px] border border-line-strong bg-[var(--sunken)] px-3.5 py-2 text-body-strong text-text transition-colors duration-micro ease-default hover:border-accent hover:text-accent"
        >
          Open tool
          <ArrowRight
            aria-hidden
            className="size-[15px] transition-transform duration-micro ease-default group-hover:translate-x-0.5"
            strokeWidth={1.8}
          />
        </Link>
      </div>
    </article>
  );
}
