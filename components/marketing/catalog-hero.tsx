import { ArrowRight, Clock, Play, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { ToolCardData, ToolStats } from "@/lib/tools";

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function formatAvg(ms: number | null): string {
  if (ms == null) return "—";
  const s = ms / 1000;
  return s >= 1 ? `${Math.round(s)}s` : "<1s";
}

/**
 * The catalog featured hero (redesigned §catalog). One showcased tool: cover art
 * bleeding in from the right behind a left-anchored scrim, with category chips,
 * real run stats (§decision: runs + avg time, no rating), and a launch CTA.
 */
export function CatalogHero({
  tool,
  stats,
}: {
  tool: ToolCardData;
  stats: ToolStats | null;
}) {
  const chips = [
    tool.category,
    ...(tool.required_providers.length
      ? tool.required_providers
      : ["No key needed"]),
  ]
    .filter(Boolean)
    .slice(0, 3) as string[];

  return (
    <div className="relative flex min-h-[340px] flex-col overflow-hidden rounded-[20px] border border-line-strong">
      {/* cover */}
      {tool.cover_image_url ? (
        <Image
          src={tool.cover_image_url}
          alt=""
          fill
          sizes="(max-width: 1024px) 100vw, 800px"
          className="object-cover object-right"
          priority
        />
      ) : (
        <div className="absolute inset-0 bg-[linear-gradient(120deg,#16281a,#243a1f_45%,#3a5a2a_72%,#5c7a38_100%)]" />
      )}
      {/* left scrim so the copy stays legible over any image */}
      <div className="absolute inset-0 bg-[linear-gradient(100deg,var(--canvas)_0%,var(--canvas)_30%,rgba(11,36,29,0.72)_46%,rgba(11,36,29,0.12)_66%,transparent_80%)]" />

      <div className="relative z-10 flex flex-1 flex-col p-7 lg:max-w-[62%]">
        <span className="text-eyebrow inline-flex items-center gap-2 self-start rounded-pill border border-[color:rgba(200,242,79,0.22)] bg-accent-quiet px-3 py-1.5 text-accent">
          <Sparkles aria-hidden className="size-3.5" strokeWidth={2} />
          Featured
        </span>

        <h2 className="font-display mt-3 text-[32px] font-semibold leading-[1.05] tracking-[-0.01em]">
          {tool.name}
        </h2>
        <p className="mt-2.5 max-w-[42ch] text-body text-[color:#d7e6c9]">
          {tool.tagline}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map((c) => (
            <span
              key={c}
              className="rounded-[9px] border border-line-strong bg-[var(--backdrop)] px-3 py-2 text-[12.5px] font-medium text-[color:#dcebc9] backdrop-blur-sm"
            >
              {c}
            </span>
          ))}
        </div>

        <div className="mt-auto flex flex-wrap items-end gap-x-7 gap-y-4 pt-6">
          {stats && stats.runCount > 0 ? (
            <>
              <Stat icon={<Play className="size-4" strokeWidth={2} />} value={formatCount(stats.runCount)} label="Runs" />
              <Stat icon={<Clock className="size-4" strokeWidth={2} />} value={formatAvg(stats.avgMs)} label="Avg. time" />
            </>
          ) : (
            <span className="text-small inline-flex items-center gap-2 self-center rounded-pill border border-line-strong bg-[var(--backdrop)] px-3.5 py-2 text-text-muted backdrop-blur-sm">
              <Sparkles aria-hidden className="size-3.5 text-accent" strokeWidth={2} />
              Just launched
            </span>
          )}
          <Link
            href={`/tools/${tool.slug}`}
            className="ml-auto inline-flex items-center gap-2 rounded-pill bg-accent px-5 py-3 text-body-strong font-bold text-accent-text shadow-[0_10px_28px_-12px_rgba(200,242,79,0.6)] transition-transform duration-micro ease-default hover:-translate-y-0.5"
          >
            Open tool
            <ArrowRight aria-hidden className="size-4" strokeWidth={2} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[18px] font-bold text-text">
        <span className="text-accent">{icon}</span>
        <span className="tabular">{value}</span>
      </div>
      <div className="mt-0.5 text-small text-text-muted">{label}</div>
    </div>
  );
}
