import Link from "next/link";

import { Hero } from "@/components/marketing/hero";
import { ShippingLog } from "@/components/marketing/shipping-log";
import { ToolCard } from "@/components/tools/tool-card";
import { Button } from "@/components/ui/button";
import { getPublicTools, getShippingLog } from "@/lib/tools";

// ISR: the shipping log and catalog render from the database, so refresh the
// static HTML periodically. A tool published from the admin (Phase 7) appears
// publicly within this window with no redeploy — which is the whole point of a
// log that grows as you ship. Phase 7 can also revalidatePath('/') for instant.
export const revalidate = 300;
/* DESIGN.md §10 — the landing page order is fixed, and this file follows it
   exactly: hero → shipping log → what you get → how access works → tool grid →
   one closing CTA. §4: 96px between landing sections. No image, no gradient in
   the hero — the restraint IS the statement. */

const WHAT_YOU_GET = [
  {
    title: "A new tool on a cadence",
    body: "I build automation tools in public and ship them here. The catalog gets longer every week; your membership covers all of it.",
  },
  {
    title: "Your keys, your bill",
    body: "Tools run on your own provider API keys. You pay OpenAI or Google directly, at cost, with no markup and nothing running through me.",
  },
  {
    title: "No lock-in, no card",
    body: "Membership is free while I build in public. There's no payment, no subscription to cancel, and your keys are yours to remove any time.",
  },
];

const HOW_IT_WORKS = [
  { step: "1", title: "Apply", body: "Tell me what you'd automate first. Takes a minute." },
  { step: "2", title: "Get approved", body: "I review these personally, usually within a day." },
  { step: "3", title: "Connect your keys", body: "Add a provider key once. It's encrypted, and no screen can show it back." },
  { step: "4", title: "Run", body: "Fill in the form, hit run, get your result. That's the whole job." },
];

export default async function LandingPage() {
  const [shippingLog, tools] = await Promise.all([
    getShippingLog(),
    getPublicTools(),
  ]);

  return (
    <>
      {/* 1 — Hero (full-bleed: the cobalt sky spans the whole viewport) */}
      <Hero shipped={shippingLog.length} />

      <div className="mx-auto w-full max-w-[1200px] px-5 lg:px-8">
      {/* 2 — The Shipping Log (the signature) */}
      {shippingLog.length > 0 && (
        <section className="py-24">
          <p className="text-eyebrow text-text-faint">The shipping log</p>
          <h2 className="text-display-l mt-3 max-w-[62ch] text-balance">
            Everything I&apos;ve shipped, newest first.
          </h2>
          <p className="prose-measure mt-4 text-body text-text-muted">
            No roadmap promises. Just a dated list of what actually went live.
          </p>
          <div className="mt-12 max-w-[720px]">
            <ShippingLog tools={shippingLog} />
          </div>
        </section>
      )}

      {/* 3 — What you get */}
      <section className="py-24">
        <div className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-3">
          {WHAT_YOU_GET.map((col) => (
            <div key={col.title}>
              <h3 className="text-h3">{col.title}</h3>
              <p className="mt-2 text-small text-text-muted">{col.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4 — How access works (a genuine sequence, so it's numbered) */}
      <section className="py-24">
        <p className="text-eyebrow text-text-faint">How access works</p>
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((s) => (
            <div key={s.step} className="flex flex-col gap-3">
              <span className="text-mono flex size-8 items-center justify-center rounded-sm border border-line text-text-muted">
                {s.step}
              </span>
              <h3 className="text-h3">{s.title}</h3>
              <p className="text-small text-text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5 — Tool grid */}
      {tools.length > 0 && (
        <section className="py-24">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-eyebrow text-text-faint">The catalog</p>
              <h2 className="text-display-l mt-3">Tools you can run.</h2>
            </div>
            <Link
              href="/tools"
              className="hidden shrink-0 text-small text-accent transition-colors duration-micro ease-default hover:text-accent-hover sm:inline"
            >
              See all →
            </Link>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
        </section>
      )}

      {/* 6 — One closing CTA. Same button, same words. */}
      <section className="py-24">
        <div className="flex flex-col items-center gap-4 rounded-md border border-line bg-surface px-6 py-16 text-center">
          <h2 className="text-display-l text-balance">
            Ready when you are.
          </h2>
          <p className="prose-measure text-body text-text-muted">
            Apply once. Free while I build in public.
          </p>
          <Link href="/apply" className="mt-2">
            <Button variant="primary" size="lg">
              Apply for access
            </Button>
          </Link>
        </div>
      </section>
      </div>
    </>
  );
}
