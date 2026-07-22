import { Package } from "lucide-react";
import type { Metadata } from "next";

import { ShippingLog } from "@/components/marketing/shipping-log";
import { getShippingLog } from "@/lib/tools";

export const metadata: Metadata = {
  title: "Changelog — Build & Launch AI",
  description: "Every tool launch, newest first.",
};

// ISR so a newly-launched tool appears without a redeploy.
export const revalidate = 300;

/**
 * The public changelog (§8). Scoped to LAUNCHES only — the schema records
 * launched_at, not an update history, so there is nothing honest to render for
 * per-update entries. It reads straight from the tools table, same source as the
 * landing page's shipping log.
 */
export default async function ChangelogPage() {
  const launches = await getShippingLog();

  return (
    <div className="mx-auto w-full max-w-[1120px] px-5 py-16 lg:px-8">
      <span className="text-eyebrow inline-flex items-center gap-2 rounded-pill border border-[color:rgba(200,242,79,0.28)] bg-accent-quiet px-3 py-1.5 text-accent">
        <Package aria-hidden className="size-3.5" strokeWidth={2} />
        The shipping log
      </span>
      <h1 className="text-display-l mt-4 max-w-[62ch] text-balance">
        Everything I&apos;ve shipped,{" "}
        <span className="text-accent">newest first.</span>
      </h1>
      <p className="mt-4 max-w-[60ch] text-body text-text-muted">
        No roadmap promises. Just a dated list of what actually went live.
      </p>

      <div className="mt-12">
        {launches.length === 0 ? (
          <p className="text-small text-text-faint">The first launch lands here soon.</p>
        ) : (
          <ShippingLog tools={launches} />
        )}
      </div>
    </div>
  );
}
