import { Sparkles } from "lucide-react";
import type { Metadata } from "next";

import { SubscribeButton } from "@/components/billing/subscribe-button";
import { SparkBackground } from "@/components/brand/spark-background";
import { CatalogCard } from "@/components/marketing/catalog-card";
import { CatalogHero } from "@/components/marketing/catalog-hero";
import { CatalogSection } from "@/components/marketing/catalog-section";
import { getSubscribePriceId } from "@/lib/billing";
import { getPublicCatalog } from "@/lib/tools";

// ISR: the catalog renders from the database, so refresh the static HTML
// periodically. A tool published (or featured) from the admin appears here within
// this window; the tool actions also revalidate '/tools' for near-instant updates.
export const revalidate = 300;
export const metadata: Metadata = {
  title: "Tools — Build & Launch AI",
  description:
    "The full catalog of AI automation tools. Apply for access, connect your own keys, and run them.",
};

export default async function ToolsCatalogPage() {
  const [{ featured, featuredStats, tools, newCutoff }, priceId] =
    await Promise.all([getPublicCatalog(), getSubscribePriceId()]);

  return (
    <>
      {/* The "Spark" ambient background — gradient + orbit arcs, behind content. */}
      <SparkBackground />
      <div className="mx-auto w-full max-w-[1200px] px-5 py-14 lg:px-8">
      {featured ? (
        <CatalogSection
          tools={tools}
          newCutoff={newCutoff}
          featuredSlot={<CatalogHero tool={featured} stats={featuredStats} />}
        />
      ) : (
        // No published tool yet — a calm placeholder, plus any coming-soon tools.
        <div>
          <h1 className="text-display-l">The tools</h1>
          <p className="mt-4 max-w-[52ch] text-body text-text-muted">
            The first tools land here soon. Subscribe and you&apos;ll be first to
            run them.
          </p>
          {tools.length > 0 && (
            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((tool) => (
                <CatalogCard key={tool.slug} tool={tool} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Membership CTA */}
      <div className="mt-12 flex flex-col items-start gap-5 rounded-[18px] border border-line-strong bg-surface px-6 py-6 sm:flex-row sm:items-center sm:px-8">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-pill border border-[color:rgba(200,242,79,0.3)] bg-accent-quiet text-accent">
          <Sparkles aria-hidden className="size-6" strokeWidth={1.8} />
        </span>
        <div>
          <h2 className="text-h2">Want access to all tools?</h2>
          <p className="mt-1 text-small text-text-muted">
            One membership, the whole catalog. $10/month, and you bring your own
            API keys.
          </p>
        </div>
        <SubscribeButton priceId={priceId} className="shrink-0 sm:ml-auto" />
      </div>
      </div>
    </>
  );
}
