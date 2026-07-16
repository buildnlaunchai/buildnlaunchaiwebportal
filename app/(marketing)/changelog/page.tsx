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
    <div className="mx-auto w-full max-w-[720px] px-5 py-16 lg:px-8">
      <p className="text-eyebrow text-text-faint">Changelog</p>
      <h1 className="text-display-l mt-3">Everything I&apos;ve shipped.</h1>
      <p className="mt-4 text-body text-text-muted">
        Every tool launch, newest first. No roadmap promises — just what actually
        went live.
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
