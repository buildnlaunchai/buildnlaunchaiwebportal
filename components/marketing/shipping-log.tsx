import Link from "next/link";

import { formatShipDate } from "@/lib/format";
import type { ToolCardData } from "@/lib/tools";

/**
 * The Shipping Log — the landing page's signature (DESIGN.md §10, §1). A
 * vertical hairline rail with a node at each launch, newest first. The date is
 * mono (a machine value, §3); the tool name is the headline.
 *
 * It renders straight from the tools table, so it grows every time a tool ships
 * — a design that gets better the more the work happens, which is the correct
 * design for this business.
 */
export function ShippingLog({ tools }: { tools: ToolCardData[] }) {
  if (tools.length === 0) return null;

  return (
    <ol className="relative ml-2">
      {/* The rail. A single hairline down the left; nodes sit on top of it. */}
      <span
        aria-hidden
        className="absolute bottom-2 left-0 top-2 w-px bg-line"
      />

      {tools.map((tool) => (
        <li key={tool.slug} className="relative flex gap-6 pb-10 pl-8 last:pb-0">
          <span
            aria-hidden
            className="absolute left-0 top-1.5 size-2 -translate-x-1/2 rounded-pill border border-line-strong bg-canvas"
          />

          <div className="min-w-0">
            <p className="text-mono text-text-faint">
              {tool.launched_at ? formatShipDate(tool.launched_at) : ""}
            </p>

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h3 className="text-h2">
                <Link
                  href={`/tools/${tool.slug}`}
                  className="transition-colors duration-micro ease-default hover:text-accent"
                >
                  {tool.name}
                </Link>
              </h3>
              {tool.version && (
                <span className="text-mono text-text-faint">v{tool.version}</span>
              )}
            </div>

            <p className="mt-1 text-body text-text-muted">{tool.tagline}</p>

            <Link
              href={`/tools/${tool.slug}`}
              className="mt-2 inline-block text-small text-accent transition-colors duration-micro ease-default hover:text-accent-hover"
            >
              See the tool →
            </Link>
          </div>
        </li>
      ))}
    </ol>
  );
}
