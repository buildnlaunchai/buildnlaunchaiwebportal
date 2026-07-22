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
 * The public tool card (redesigned §catalog): an image-forward 16:9 thumbnail
 * card — the cover is the hero, with a category badge over it, then a tight
 * name + access-aware footer. Presentational — safe inside the client grid.
 */
export function CatalogCard({ tool }: { tool: ToolCardData }) {
  const badge = (tool.category ?? RUNTIME_LABEL[tool.runtime]).toUpperCase();
  const runsFree =
    tool.access_type === "public_preview" && tool.required_providers.length === 0;

  return (
    <article className="group flex flex-col overflow-hidden rounded-[18px] border border-line bg-surface transition-[border-color,transform] duration-micro ease-default hover:-translate-y-0.5 hover:border-line-strong">
      {/* cover — the 16:9 thumbnail is the star */}
      <div className="relative aspect-video overflow-hidden bg-elevated">
        {tool.cover_image_url ? (
          <Image
            src={tool.cover_image_url}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 420px"
            className="object-cover transition-transform duration-layout ease-default group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-[radial-gradient(70%_90%_at_50%_30%,rgba(200,242,79,0.12),transparent_60%)] text-text-faint">
            <ToolIcon name={tool.icon} className="size-10 opacity-60" />
          </div>
        )}
        <span className="text-mono-chip absolute left-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-[8px] border border-line-strong bg-[var(--backdrop)] px-2.5 py-1.5 uppercase tracking-[0.06em] text-accent backdrop-blur-sm">
          {badge}
        </span>
      </div>

      {/* body — name + a single-line tagline */}
      <div className="flex flex-1 flex-col px-5 pt-4">
        <h3 className="text-h3 text-[18px]">{tool.name}</h3>
        <p className="mt-1.5 line-clamp-1 text-small text-text-muted">{tool.tagline}</p>
        <div className="min-h-3 flex-1" />
      </div>

      {/* footer — access state + view details */}
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
          View details
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
