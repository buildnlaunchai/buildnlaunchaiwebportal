import { Check, Infinity as InfinityIcon, Sparkles, Zap } from "lucide-react";

import { HeroCta } from "@/components/marketing/hero-cta";
import { cn } from "@/lib/utils";

/**
 * The landing hero — copy on the left, a glowing "energy cube" visual on the
 * right (orbit rings, floating provider tiles, and a "new tool shipped" card),
 * with the live stat cards below. The cube is a CSS approximation of a rendered
 * 3D asset; swap in a real render (an <img>) when there is one.
 */
export function Hero({ shipped }: { shipped: number }) {
  return (
    <section className="relative overflow-hidden">
      <div className="glow" aria-hidden />
      <div className="hero-beams" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-5 pt-16 lg:px-8 lg:pt-24">
        {/* top: copy (left) · visual (right) */}
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-6">
          <div className="flex flex-col items-start">
            <span className="text-mono-chip inline-flex items-center gap-2 rounded-pill border border-line-strong bg-surface/60 px-3 py-1.5 text-text-muted backdrop-blur">
              <Zap aria-hidden className="size-3.5 text-accent" fill="currentColor" strokeWidth={1.5} />
              Shipping a new tool every week
            </span>

            <h1 className="text-display-l sm:text-display-xl mt-6 text-balance">
              AI tools that do the work,{" "}
              <span className="font-semibold text-accent">
                built in{" "}
                <em className="relative font-serif font-normal italic tracking-normal">
                  public
                  <span
                    aria-hidden
                    className="absolute -bottom-1 left-0 h-[3px] w-full rounded-pill bg-[linear-gradient(90deg,var(--accent),transparent)]"
                  />
                </em>
                .
              </span>
            </h1>

            <p className="mt-6 max-w-[52ch] text-body text-text-muted">
              I ship a new automation tool every week. Members run them with their
              own API keys for $10/month — you pay your provider directly, and
              nothing runs through my bill.
            </p>

            <div className="mt-8">
              <HeroCta />
            </div>

            {shipped > 0 && (
              <div className="mt-7 flex items-center gap-3">
                <div className="flex -space-x-2" aria-hidden>
                  {[
                    "from-accent-hover to-accent",
                    "from-illuminate to-live",
                    "from-live to-accent",
                    "from-accent to-illuminate",
                  ].map((g, i) => (
                    <span
                      key={i}
                      className={cn(
                        "size-8 rounded-pill border-2 border-canvas bg-gradient-to-br",
                        g,
                      )}
                    />
                  ))}
                </div>
                <p className="text-small text-text-muted">
                  <span className="tabular font-semibold text-text">{shipped}</span>{" "}
                  {shipped === 1 ? "tool" : "tools"} shipped, building in public.
                </p>
              </div>
            )}
          </div>

          <HeroVisual />
        </div>

        {/* below: the live stat cards */}
        <div className="mt-14 flex flex-col items-stretch gap-4 pb-24 sm:flex-row sm:items-start sm:justify-center sm:gap-0 sm:pb-32 lg:pb-40">
          <StatCard className="sm:mt-10 sm:w-[248px]" />
          <RunsCard className="z-20 sm:-mx-3 sm:w-[320px]" />
          <ActivityCard className="sm:mt-10 sm:w-[248px]" />
        </div>
      </div>
    </section>
  );
}

/* ---- the right-side visual: a glowing cube, orbit rings, floating tiles ---- */

function HeroVisual() {
  return (
    <div aria-hidden className="relative mx-auto aspect-square w-full max-w-[440px]">
      {/* orbit rings */}
      <svg viewBox="0 0 440 440" className="absolute inset-0 size-full" fill="none">
        <ellipse cx="220" cy="248" rx="206" ry="86" stroke="rgba(200,242,79,0.16)" strokeWidth="1" />
        <ellipse cx="220" cy="248" rx="146" ry="60" stroke="rgba(200,242,79,0.1)" strokeWidth="1" />
      </svg>

      {/* pedestal glow */}
      <div className="absolute bottom-[24%] left-1/2 h-24 w-72 -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse,rgba(200,242,79,0.4),transparent_70%)] blur-md" />

      {/* the energy cube */}
      <div className="absolute left-1/2 top-[42%] flex size-40 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[24px] border border-[color:rgba(200,242,79,0.6)] bg-[linear-gradient(150deg,rgba(200,242,79,0.6),rgba(120,180,55,0.3))] shadow-[0_0_80px_-4px_rgba(200,242,79,0.7),inset_0_2px_22px_-6px_rgba(255,255,255,0.65)] [transform:perspective(720px)_rotateX(14deg)_rotateY(-16deg)]">
        <Zap
          className="size-16 text-[color:#0b241d] [filter:drop-shadow(0_0_10px_rgba(255,255,255,0.6))]"
          fill="currentColor"
          strokeWidth={1.4}
        />
      </div>

      {/* floating provider tiles */}
      <Tile className="left-[10%] top-[9%]">
        <Sparkles className="size-6" strokeWidth={1.6} />
      </Tile>
      <Tile className="left-[3%] top-[42%]">
        <span className="text-[17px] font-bold">A</span>
      </Tile>
      <Tile className="bottom-[24%] right-[6%]">
        <InfinityIcon className="size-6" strokeWidth={1.8} />
      </Tile>
      <Tile className="bottom-[16%] left-[16%]">
        <Zap className="size-5" fill="currentColor" strokeWidth={1.5} />
      </Tile>

      {/* "new tool shipped" card */}
      <div className="absolute right-0 top-0 w-56 rounded-2xl border border-line-strong bg-[var(--glass)] p-4 shadow-float backdrop-blur-md">
        <div className="flex items-center gap-2 text-small font-semibold text-text">
          <span className="run-dot size-2 rounded-pill bg-live" />
          New tool shipped
        </div>
        <p className="mt-2 text-small text-text-muted">
          You run it. You pay your provider.
        </p>
        <p className="text-mono-chip mt-2.5 inline-flex items-center gap-1.5 text-text-faint">
          <Check className="size-3.5 text-live" strokeWidth={2} />
          No middleman. No extra fees.
        </p>
      </div>
    </div>
  );
}

function Tile({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "absolute flex size-14 items-center justify-center rounded-2xl border border-line-strong bg-[var(--glass)] text-accent shadow-[0_12px_34px_-14px_rgba(0,0,0,0.7)] backdrop-blur-md",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ---- the three cards. Decorative product previews → aria-hidden. ---- */

function StatCard({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`glass rounded-xl p-5 ${className}`}>
      <p className="text-mono-chip text-text-faint">SHIPPED</p>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-display-l leading-none text-text">4</span>
        <span className="mb-1 inline-flex items-center gap-1 rounded-pill bg-live-quiet px-1.5 py-0.5 text-mono-chip text-live">
          +1 this week
        </span>
      </div>
      <p className="mt-1 text-small text-text-muted">tools in the catalog</p>
      <div className="mt-4 flex h-10 items-end gap-1.5">
        {[26, 34, 30, 44, 52, 48, 64].map((h, i) => (
          <span
            key={i}
            className="flex-1 rounded-[3px] bg-accent/70"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function RunsCard({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`glass rounded-xl p-5 ${className}`}>
      <div className="flex items-center justify-between">
        <p className="text-mono-chip text-text-faint">THIS MONTH</p>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-live-quiet px-2 py-1 text-mono-chip text-live">
          <span className="run-dot size-1.5 rounded-pill bg-live" />
          live
        </span>
      </div>

      <div className="mt-4 flex items-center gap-5">
        <div className="relative size-[92px] shrink-0">
          <div
            className="size-full rounded-pill"
            style={{
              background:
                "conic-gradient(var(--accent) 0 68%, var(--illuminate) 68% 86%, var(--line) 86% 100%)",
              WebkitMask:
                "radial-gradient(circle 27px at center, transparent 98%, #000 100%)",
              mask: "radial-gradient(circle 27px at center, transparent 98%, #000 100%)",
            }}
          />
        </div>
        <div>
          <div className="text-display-l leading-none text-text">1,284</div>
          <p className="mt-1.5 text-small text-text-muted">successful runs</p>
          <p className="mt-0.5 text-mono-chip text-illuminate">▲ 18% vs last month</p>
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-3 text-mono-chip text-text-faint">
        every run on the member&apos;s own keys
      </div>
    </div>
  );
}

function ActivityCard({ className = "" }: { className?: string }) {
  const bars = [40, 62, 48, 78, 58, 88, 70];
  return (
    <div aria-hidden className={`glass rounded-xl p-5 ${className}`}>
      <p className="text-mono-chip text-text-faint">RUNS · LAST 7 DAYS</p>
      <div className="mt-4 flex h-[72px] items-end gap-2">
        {bars.map((h, i) => (
          <span
            key={i}
            className="flex-1 rounded-[4px]"
            style={{
              height: `${h}%`,
              background:
                i === bars.length - 2
                  ? "var(--illuminate)"
                  : "color-mix(in srgb, var(--accent) 72%, transparent)",
            }}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-mono-chip text-text-faint">
        <span>Mon</span>
        <span>Sun</span>
      </div>
    </div>
  );
}
