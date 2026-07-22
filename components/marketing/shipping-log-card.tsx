"use client";

import { ArrowRight, CalendarDays } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";

import { formatShipDate } from "@/lib/format";
import type { ToolCardData } from "@/lib/tools";
import { cn } from "@/lib/utils";

/** Lime glow behind the card on hover, plus a depth shadow. */
const HOVER_GLOW = [
  "0 0 0 1px rgba(203,231,92,0.5)",
  "0 0 48px 2px rgba(203,231,92,0.42)",
  "0 26px 54px -16px rgba(0,0,0,0.72)",
].join(", ");

/**
 * One shipping-log entry's card. Floats in 3D toward the cursor on hover and
 * lights up with a lime glow behind it. Client component (the rail + node stay
 * server-rendered in ShippingLog). A gentle tilt — these cards are wide.
 */
export function ShippingLogCard({
  tool,
  newest,
}: {
  tool: ToolCardData;
  newest: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useRef<boolean | null>(null);
  const motionOk = () => {
    if (reduced.current === null) {
      reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return !reduced.current;
  };

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || !motionOk()) return;
    const r = el.getBoundingClientRect();
    const ry = ((e.clientX - r.left) / r.width - 0.5) * 6; // gentle, wide card
    const rx = (0.5 - (e.clientY - r.top) / r.height) * 6;
    el.style.transform = `perspective(1300px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-6px) scale(1.01)`;
  };
  const onEnter = () => {
    const el = ref.current;
    if (el) el.style.boxShadow = HOVER_GLOW;
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "";
    el.style.boxShadow = "";
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        transition: "transform 160ms ease-out, box-shadow 260ms ease",
        willChange: "transform",
      }}
      className={cn(
        "flex flex-col gap-4 rounded-[16px] border p-4 sm:flex-row sm:items-start sm:gap-6 sm:p-5",
        newest
          ? "border-[color:rgba(200,242,79,0.35)] bg-surface/50 shadow-[0_0_36px_-12px_rgba(200,242,79,0.28)]"
          : "border-line bg-surface/30",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-mono inline-flex items-center gap-2 text-accent">
          <CalendarDays aria-hidden className="size-3.5" strokeWidth={1.8} />
          {tool.launched_at ? formatShipDate(tool.launched_at) : ""}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <h3 className="text-h3 text-[17px]">{tool.name}</h3>
          {tool.version && (
            <span className="text-mono-chip rounded-pill border border-[color:rgba(200,242,79,0.35)] bg-accent-quiet px-2 py-0.5 text-accent">
              v{tool.version}
            </span>
          )}
        </div>

        <p className="mt-2 max-w-[46ch] text-small text-text-muted">{tool.tagline}</p>

        <Link
          href={`/tools/${tool.slug}`}
          className="group/link mt-3 inline-flex items-center gap-2 text-small font-medium text-accent"
        >
          <span className="flex size-7 items-center justify-center rounded-full border border-[color:rgba(200,242,79,0.4)] transition-colors duration-micro ease-default group-hover/link:bg-accent-quiet">
            <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
          </span>
          See the tool
        </Link>
      </div>

      {tool.cover_image_url && (
        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg border border-line sm:w-[40%] sm:max-w-[320px]">
          <Image
            src={tool.cover_image_url}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 320px"
            className="object-cover"
          />
        </div>
      )}
    </div>
  );
}
