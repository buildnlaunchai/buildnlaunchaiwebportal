import {
  ArrowRight,
  CreditCard,
  KeyRound,
  LayoutGrid,
  Package,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { SubscribeButton } from "@/components/billing/subscribe-button";
import { CatalogCard } from "@/components/marketing/catalog-card";
import { Hero } from "@/components/marketing/hero";
import { ShippingLog } from "@/components/marketing/shipping-log";
import { getSubscribePriceId } from "@/lib/billing";
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
    icon: Package,
    title: "A new tool on a cadence",
    body: "I build automation tools in public and ship them here. The catalog gets longer every week; your $10/month covers all of it.",
  },
  {
    icon: KeyRound,
    title: "Your keys, your bill",
    body: "Tools run on your own provider API keys. You pay OpenAI or Google directly, at cost — the $10/month is for the tools, not the compute.",
  },
  {
    icon: ShieldCheck,
    title: "No lock-in",
    body: "Ten dollars a month, and you can cancel in a click. No annual commitment, and your keys are yours to remove any time.",
  },
];

const HOW_IT_WORKS = [
  { step: "1", icon: CreditCard, title: "Subscribe", body: "$10/month, one click. No application, no waiting for approval." },
  { step: "2", icon: KeyRound, title: "Connect your keys", body: "Add a provider key once. It's encrypted, and no screen can show it back." },
  { step: "3", icon: Rocket, title: "Run", body: "Fill in the form, hit run, get your result. That's the whole job." },
];

export default async function LandingPage() {
  const [shippingLog, tools, priceId] = await Promise.all([
    getShippingLog(),
    getPublicTools(),
    getSubscribePriceId(),
  ]);

  return (
    <>
      {/* 1 — Hero (full-bleed: the cobalt sky spans the whole viewport) */}
      <Hero shipped={shippingLog.length} priceId={priceId} />

      <div className="mx-auto w-full max-w-[1200px] px-5 lg:px-8">
      {/* 2 — The Shipping Log (the signature) */}
      {shippingLog.length > 0 && (
        <section className="py-24">
          <span className="text-eyebrow inline-flex items-center gap-2 rounded-pill border border-[color:rgba(200,242,79,0.28)] bg-accent-quiet px-3 py-1.5 text-accent">
            <Package aria-hidden className="size-3.5" strokeWidth={2} />
            The shipping log
          </span>
          <h2 className="text-display-l mt-4 max-w-[62ch] text-balance">
            Everything I&apos;ve shipped,{" "}
            <span className="text-accent">newest first.</span>
          </h2>
          <p className="prose-measure mt-4 text-body text-text-muted">
            No roadmap promises. Just a dated list of what actually went live.
          </p>
          <div className="mt-12">
            <ShippingLog tools={shippingLog.slice(0, 3)} />
          </div>
          {shippingLog.length > 0 && (
            <div className="mt-10 flex justify-center">
              <Link
                href="/changelog"
                className="text-body-strong inline-flex items-center gap-2.5 rounded-pill border border-line-strong bg-surface/50 px-6 py-3.5 text-text transition-colors duration-micro ease-default hover:border-accent hover:text-accent"
              >
                <LayoutGrid aria-hidden className="size-4" strokeWidth={1.8} />
                See all shipped tools
                <ArrowRight aria-hidden className="size-4" strokeWidth={1.8} />
              </Link>
            </div>
          )}
        </section>
      )}

      {/* 3 — What you get: glowing feature cards (icon + heading + copy) */}
      <section className="py-24">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {WHAT_YOU_GET.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="relative flex items-center gap-5 rounded-[20px] border border-line bg-surface/40 p-6 shadow-[0_0_50px_-20px_rgba(200,242,79,0.2)] [border-top-color:rgba(200,242,79,0.16)]"
            >
              <span className="relative flex size-24 shrink-0 items-center justify-center">
                <span
                  aria-hidden
                  className="absolute inset-1 rounded-full bg-[radial-gradient(circle,rgba(200,242,79,0.22),transparent_68%)]"
                />
                <Icon
                  aria-hidden
                  className="relative size-11 text-accent [filter:drop-shadow(0_0_12px_rgba(200,242,79,0.65))]"
                  strokeWidth={1.4}
                />
              </span>
              <div className="min-w-0">
                <span aria-hidden className="block h-0.5 w-7 rounded-pill bg-accent" />
                <h3 className="mt-3 text-h3">{title}</h3>
                <p className="mt-2 text-small text-text-muted">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4 — How access works: a numbered step flow with connectors */}
      <section className="py-24">
        <div className="rounded-[24px] border border-line bg-surface/25 p-6 sm:p-10 [border-top-color:rgba(200,242,79,0.14)]">
          <p className="text-eyebrow text-accent">How access works</p>
          <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {HOW_IT_WORKS.map(({ step, icon: Icon, title, body }, i) => (
              <div key={step} className="relative flex flex-col items-start">
                <span className="text-body-strong flex size-9 items-center justify-center rounded-pill border border-[color:rgba(200,242,79,0.5)] bg-canvas font-semibold text-accent shadow-[0_0_16px_-2px_rgba(200,242,79,0.55)]">
                  {step}
                </span>

                <div className="relative mt-4 flex size-[88px] items-center justify-center rounded-[18px] border border-line bg-surface/50 shadow-[inset_0_0_36px_-12px_rgba(200,242,79,0.4)] [border-top-color:rgba(200,242,79,0.2)]">
                  <Icon
                    aria-hidden
                    className="size-9 text-accent [filter:drop-shadow(0_0_10px_rgba(200,242,79,0.6))]"
                    strokeWidth={1.4}
                  />
                  {i < HOW_IT_WORKS.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute left-full top-1/2 hidden h-px w-[204px] -translate-y-1/2 bg-[color:rgba(200,242,79,0.3)] lg:block"
                    >
                      <span className="absolute left-0 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-pill border border-[color:rgba(200,242,79,0.6)] bg-canvas" />
                      <span className="absolute right-0 top-1/2 size-2 -translate-y-1/2 translate-x-1/2 rounded-pill border border-[color:rgba(200,242,79,0.6)] bg-canvas" />
                    </span>
                  )}
                </div>

                <h3 className="mt-5 text-h3">{title}</h3>
                <p className="mt-2 text-small text-text-muted">{body}</p>
              </div>
            ))}
          </div>
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
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <CatalogCard key={tool.slug} tool={tool} />
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
            $10/month. Cancel anytime. Your keys, your bill.
          </p>
          <div className="mt-2">
            <SubscribeButton priceId={priceId} size="lg" />
          </div>
        </div>
      </section>
      </div>
    </>
  );
}
