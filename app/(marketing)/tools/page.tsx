import type { Metadata } from "next";
import Link from "next/link";

import { ToolCard } from "@/components/tools/tool-card";
import { Button } from "@/components/ui/button";
import { getPublicTools } from "@/lib/tools";

// ISR: the shipping log and catalog render from the database, so refresh the
// static HTML periodically. A tool published from the admin (Phase 7) appears
// publicly within this window with no redeploy — which is the whole point of a
// log that grows as you ship. Phase 7 can also revalidatePath('/') for instant.
export const revalidate = 300;
export const metadata: Metadata = {
  title: "Tools — Build & Launch AI",
  description:
    "The full catalog of AI automation tools. Apply for access, connect your own keys, and run them.",
};

export default async function ToolsCatalogPage() {
  const tools = await getPublicTools();

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-16 lg:px-8">
      <header className="prose-measure">
        <h1 className="text-display-l">The tools</h1>
        <p className="mt-4 text-body text-text-muted">
          Every tool I&apos;ve shipped, and a few on the way. You run them with
          your own API keys — so you pay your provider directly, and nothing runs
          through my bill.
        </p>
      </header>

      {tools.length === 0 ? (
        <p className="mt-12 text-small text-text-faint">
          The first tools land here soon.
        </p>
      ) : (
        // §4: 16px between cards in a grid.
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <ToolCard key={tool.slug} tool={tool} />
          ))}
        </div>
      )}

      <div className="mt-16 flex flex-col items-center gap-4 rounded-md border border-line bg-surface px-6 py-10 text-center">
        <h2 className="text-h2">Want in?</h2>
        <p className="prose-measure text-small text-text-muted">
          Access is by application. It&apos;s free while I build in public — I just
          like to know who&apos;s using what.
        </p>
        <Link href="/apply">
          <Button variant="primary">Apply for access</Button>
        </Link>
      </div>
    </div>
  );
}
