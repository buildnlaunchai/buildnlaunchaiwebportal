import Link from "next/link";

/**
 * The landing hero, matched to the reference design (the owner's original).
 * Faithful to the reference's visual language:
 *  - a bright cobalt sky (`.glow`) filling the top and fading into the navy
 *    ground, with soft light beams (`.hero-beams`);
 *  - a CENTERED headline with one serif-italic emphasis word;
 *  - a light primary CTA + a dark secondary, matching the reference buttons;
 *  - a row of dark floating glass cards straddling the glow-to-dark boundary,
 *    the center one raised and largest — a cluster, not one panel.
 *
 * What stays ours (deliberately): branding, the type system, the copy, and the
 * content inside the cards — our runs, our tools, our providers.
 */
export function Hero({ shipped }: { shipped: number }) {
  return (
    <section className="relative overflow-hidden">
      <div className="glow" aria-hidden />
      <div className="hero-beams" aria-hidden />

      {/* ---- centered copy ---- */}
      <div className="relative z-10 mx-auto flex max-w-[720px] flex-col items-center px-2 pt-20 text-center sm:pt-24 lg:pt-28">
        <span className="inline-flex items-center gap-2 rounded-pill border border-line-strong bg-surface/60 px-3 py-1.5 text-mono-chip text-text-muted backdrop-blur">
          <span aria-hidden className="run-dot size-1.5 rounded-pill bg-illuminate" />
          Shipping a new tool every week
        </span>

        <h1 className="text-display-l sm:text-display-xl mt-6 text-balance">
          AI tools that do the work,
          <br />
          built in{" "}
          <em className="font-serif font-normal italic tracking-normal text-text">
            public
          </em>
          .
        </h1>

        <p className="mt-6 max-w-[54ch] text-body text-text-muted">
          I ship a new automation tool every week. Approved members run them with
          their own API keys — you pay your provider directly, and nothing runs
          through my bill.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/apply"
            className="rounded-md bg-text px-5 py-3 text-body-strong text-canvas transition-colors duration-micro ease-default hover:bg-white"
          >
            Apply for access
          </Link>
          <Link
            href="/tools"
            className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface/50 px-5 py-3 text-body-strong text-text backdrop-blur transition-colors duration-micro ease-default hover:bg-elevated"
          >
            Browse the tools
            <span aria-hidden>→</span>
          </Link>
        </div>

        {shipped > 0 && (
          <p className="mt-6 text-small text-text-faint">
            <span className="tabular text-text-muted">{shipped}</span>{" "}
            {shipped === 1 ? "tool" : "tools"} shipped so far, and counting.
          </p>
        )}
      </div>

      {/* ---- the floating card cluster, straddling the glow boundary ---- */}
      <div className="relative z-10 mx-auto mt-14 flex max-w-[1000px] flex-col items-stretch gap-4 px-4 pb-24 sm:mt-16 sm:flex-row sm:items-start sm:justify-center sm:gap-0 sm:pb-32 lg:pb-40">
        <StatCard className="sm:mt-10 sm:w-[248px]" />
        <RunsCard className="z-20 sm:-mx-3 sm:w-[320px]" />
        <ActivityCard className="sm:mt-10 sm:w-[248px]" />
      </div>
    </section>
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
      {/* a tiny ascending sparkline of blue bars */}
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
        {/* donut — blue + azure segments over a faint track */}
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
