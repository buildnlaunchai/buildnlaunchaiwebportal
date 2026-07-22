import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CatalogCard } from "@/components/marketing/catalog-card";
import { CatalogHero } from "@/components/marketing/catalog-hero";
import { CatalogSection } from "@/components/marketing/catalog-section";
import { Button } from "@/components/ui/button";
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
  const { featured, featuredStats, tools, newCutoff } = await getPublicCatalog();

  return (
    <>
      {/* The "Spark" brand gradient — the reference's lime-bloom ground, scoped to
          the catalog (the landing keeps its own hero glow). Fixed, behind content. */}
      <div className="spark-bg" aria-hidden />
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
            The first tools land here soon. Apply for access and you&apos;ll be
            first in line.
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
            Access is by application — free while I build in public. I just like to
            know who&apos;s using what.
          </p>
        </div>
        <Link href="/apply" className="sm:ml-auto">
          <Button variant="primary">Become a member</Button>
        </Link>
      </div>
      </div>
    </>
  );
}
