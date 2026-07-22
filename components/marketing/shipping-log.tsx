import { ArrowRight, CalendarDays } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { formatShipDate } from "@/lib/format";
import type { ToolCardData } from "@/lib/tools";
import { cn } from "@/lib/utils";

/**
 * The Shipping Log (DESIGN.md §10, §1) — a vertical timeline of launch cards,
 * newest first. Each card carries the date, name + version, tagline, a "See the
 * tool" link, and the tool's cover thumbnail. The newest entry glows. It renders
 * straight from the tools table, so it grows every time a tool ships — a design
 * that gets stronger the more the work happens.
 *
 * Used both on the landing page (latest few) and the changelog (all launches).
 */
export function ShippingLog({ tools }: { tools: ToolCardData[] }) {
  if (tools.length === 0) return null;

  return (
    <ol className="relative flex flex-col gap-5 pl-9">
      {/* the rail — a single hairline down the left; nodes sit on top of it */}
      <span aria-hidden className="absolute bottom-10 left-[9px] top-10 w-px bg-line" />

      {tools.map((tool, i) => {
        const newest = i === 0;
        return (
          <li key={tool.slug} className="relative">
            {/* node */}
            <span
              aria-hidden
              className={cn(
                "absolute left-[9px] top-[34px] z-10 size-3.5 -translate-x-1/2 rounded-full",
                newest
                  ? "bg-accent shadow-[0_0_14px_2px_rgba(200,242,79,0.6)]"
                  : "border-2 border-line-strong bg-elevated",
              )}
            />

            {/* card */}
            <div
              className={cn(
                "flex flex-col gap-6 rounded-[20px] border p-5 transition-colors duration-micro ease-default sm:flex-row sm:items-center sm:p-6",
                newest
                  ? "border-[color:rgba(200,242,79,0.35)] bg-surface/50 shadow-[0_0_44px_-12px_rgba(200,242,79,0.3)]"
                  : "border-line bg-surface/30 hover:border-line-strong",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="text-mono inline-flex items-center gap-2 text-accent">
                  <CalendarDays aria-hidden className="size-4" strokeWidth={1.8} />
                  {tool.launched_at ? formatShipDate(tool.launched_at) : ""}
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-3">
                  <h3 className="text-h2">{tool.name}</h3>
                  {tool.version && (
                    <span className="text-mono-chip rounded-pill border border-[color:rgba(200,242,79,0.35)] bg-accent-quiet px-2.5 py-1 text-accent">
                      v{tool.version}
                    </span>
                  )}
                </div>

                <p className="mt-2.5 max-w-[46ch] text-body text-text-muted">
                  {tool.tagline}
                </p>

                <Link
                  href={`/tools/${tool.slug}`}
                  className="group/link mt-4 inline-flex items-center gap-2.5 text-body-strong text-accent"
                >
                  <span className="flex size-8 items-center justify-center rounded-full border border-[color:rgba(200,242,79,0.4)] transition-colors duration-micro ease-default group-hover/link:bg-accent-quiet">
                    <ArrowRight aria-hidden className="size-4" strokeWidth={2} />
                  </span>
                  See the tool
                </Link>
              </div>

              {tool.cover_image_url && (
                <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl border border-line sm:w-[46%] sm:max-w-[440px]">
                  <Image
                    src={tool.cover_image_url}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, 440px"
                    className="object-cover"
                  />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
