"use client";

import { ArrowRight, Lock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";

import { ToolIcon } from "@/components/tools/tool-icon";
import type { ToolCardData } from "@/lib/tools";

/** Friendly one-word label for a runtime, shown as the small badge on the cover. */
const RUNTIME_LABEL: Record<ToolCardData["runtime"], string> = {
  edge_function: "Automation",
  internal: "App",
  iframe: "App",
  external_link: "Link",
};

/** The neon-lime glowing border + depth shadow while the card floats on hover. */
const HOVER_GLOW = [
  "0 0 0 1.5px rgba(203,231,92,0.9)", // bright lime hairline border
  "0 0 22px -2px rgba(203,231,92,0.55)", // tight glow
  "0 0 64px 4px rgba(160,220,70,0.26)", // wide bloom
  "0 34px 64px -20px rgba(0,0,0,0.8)", // depth
].join(", ");

/** Lower section: a gradient from the cover's green into near-black, for depth. */
const CARD_BG =
  "linear-gradient(180deg,#0e2a1e 0%,#0a2016 42%,#06130c 74%,#020a06 100%)";

/**
 * The public tool card (redesigned §catalog): an image-forward 16:9 thumbnail
 * card that floats in 3D toward the cursor and lights up with a lime glowing
 * border on hover. A small runtime badge sits on the cover; the category and
 * access live as chips in the body; the lower section fades into near-black.
 */
export function CatalogCard({ tool }: { tool: ToolCardData }) {
  const category = (tool.category ?? RUNTIME_LABEL[tool.runtime]).toUpperCase();
  const runsFree =
    tool.access_type === "public_preview" && tool.required_providers.length === 0;

  const ref = useRef<HTMLElement>(null);
  // Lazily cached prefers-reduced-motion, read on first interaction (no state,
  // so no render churn and no setState-in-effect).
  const reduced = useRef<boolean | null>(null);
  const motionOk = () => {
    if (reduced.current === null) {
      reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return !reduced.current;
  };

  // Imperative tilt via the ref, so cursor movement doesn't re-render the card.
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || !motionOk()) return;
    const r = el.getBoundingClientRect();
    const ry = ((e.clientX - r.left) / r.width - 0.5) * 12; // rotateY
    const rx = (0.5 - (e.clientY - r.top) / r.height) * 12; // rotateX
    el.style.transform = `perspective(1000px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-8px) scale(1.02)`;
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
    <article
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        background: CARD_BG,
        transition: "transform 160ms ease-out, box-shadow 260ms ease",
        willChange: "transform",
      }}
      className="group flex flex-col overflow-hidden rounded-[20px] border border-line"
    >
      {/* cover — the 16:9 thumbnail, with a small runtime badge in the corner */}
      <div className="relative aspect-video overflow-hidden bg-elevated">
        {tool.cover_image_url ? (
          <Image
            src={tool.cover_image_url}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 440px"
            className="object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-[radial-gradient(70%_90%_at_50%_30%,rgba(200,242,79,0.12),transparent_60%)] text-text-faint">
            <ToolIcon name={tool.icon} className="size-10 opacity-60" />
          </div>
        )}
      </div>

      {/* body — name, full tagline, then category + access chips */}
      <div className="flex flex-1 flex-col px-6 pb-6 pt-5">
        <h3 className="font-display text-[22px] font-semibold leading-tight tracking-[-0.01em] text-text">
          {tool.name}
        </h3>
        <p className="mt-2 line-clamp-2 text-body text-text-muted">{tool.tagline}</p>

        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-mono-chip inline-flex items-center gap-1.5 rounded-pill border border-[color:rgba(200,242,79,0.4)] bg-accent-quiet px-3 py-1.5 uppercase tracking-[0.06em] text-accent">
            <ToolIcon name={tool.icon} className="size-3.5" />
            {category}
          </span>
          <span aria-hidden className="size-1 rounded-pill bg-text-faint" />
          {runsFree ? (
            <span className="text-mono-chip inline-flex items-center gap-1.5 rounded-pill border border-line-strong px-3 py-1.5 uppercase tracking-[0.06em] text-live">
              <span aria-hidden className="size-1.5 rounded-pill bg-live" />
              Runs free
            </span>
          ) : (
            <span className="text-mono-chip inline-flex items-center gap-1.5 rounded-pill border border-line-strong px-3 py-1.5 uppercase tracking-[0.06em] text-text-muted">
              <Lock aria-hidden className="size-3.5" strokeWidth={1.8} />
              Members only
            </span>
          )}
        </div>

        {/* footer — the prominent View details action */}
        <div className="mt-auto flex justify-end pt-6">
          <Link
            href={`/tools/${tool.slug}`}
            className="inline-flex items-center gap-2.5 rounded-[14px] border border-line-strong bg-[var(--sunken)] px-6 py-3.5 text-body-strong text-text transition-colors duration-micro ease-default hover:border-accent hover:text-accent"
          >
            View details
            <ArrowRight
              aria-hidden
              className="size-[17px] transition-transform duration-micro ease-default group-hover:translate-x-0.5"
              strokeWidth={2}
            />
          </Link>
        </div>
      </div>
    </article>
  );
}
