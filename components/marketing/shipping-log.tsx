import { ShippingLogCard } from "@/components/marketing/shipping-log-card";
import type { ToolCardData } from "@/lib/tools";
import { cn } from "@/lib/utils";

/**
 * The Shipping Log (DESIGN.md §10, §1) — a vertical timeline of launch cards,
 * newest first. The rail + nodes are server-rendered here; each card
 * (ShippingLogCard) is a client component that floats in 3D and glows on hover.
 *
 * Rail alignment: the `pl-9` lives on each <li>, NOT the <ol>, so the node
 * (`left-[9px]` in the li) and the rail (`left-[9px]` in the ol) land on the
 * same line; the li's padding only pushes the card to the right.
 */
export function ShippingLog({ tools }: { tools: ToolCardData[] }) {
  if (tools.length === 0) return null;

  return (
    <ol className="relative flex flex-col gap-2.5">
      {/* the rail — a single hairline down the left; nodes sit on top of it */}
      <span aria-hidden className="absolute bottom-6 left-[9px] top-8 w-px bg-line" />

      {tools.map((tool, i) => {
        const newest = i === 0;
        return (
          <li key={tool.slug} className="relative pl-9">
            {/* node — on the rail */}
            <span
              aria-hidden
              className={cn(
                "absolute left-[9px] top-[30px] z-10 size-3 -translate-x-1/2 rounded-full",
                newest
                  ? "bg-accent shadow-[0_0_12px_2px_rgba(200,242,79,0.6)]"
                  : "border-2 border-line-strong bg-elevated",
              )}
            />

            <ShippingLogCard tool={tool} newest={newest} />
          </li>
        );
      })}
    </ol>
  );
}
