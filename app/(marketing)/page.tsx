import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Phase 0 renders the hero only — enough to prove the tokens, the type scale
 * and both themes are real. The Shipping Log, the tool grid and the rest of
 * DESIGN.md §10's running order arrive in Phase 2, when there are actually
 * tools in the database to render.
 *
 * Deliberately not a placeholder with lorem ipsum: the copy below is the real
 * copy, written to DESIGN.md §12. Plain sentence, active voice, no "AI-powered".
 */
export default function LandingPage() {
  return (
    <section className="mx-auto w-full max-w-[1200px] px-5 py-24 lg:px-8">
      <div className="prose-measure">
        <h1 className="text-display-l sm:text-display-xl text-balance">
          AI tools that do the work, built in public.
        </h1>

        <p className="mt-6 text-body text-text-muted">
          I ship a new automation tool every week. Members run them with their
          own API keys, so you pay your provider directly and nothing runs
          through my bill.
        </p>

        {/* §10: two buttons. No image, no video, no gradient. */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/apply">
            <Button variant="primary" size="lg">
              Apply for access
            </Button>
          </Link>
          <Link href="/tools">
            <Button variant="secondary" size="lg">
              Browse the tools
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
