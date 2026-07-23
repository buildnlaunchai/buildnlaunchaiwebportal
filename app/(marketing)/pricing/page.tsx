import {
  Check,
  CreditCard,
  KeyRound,
  Package,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";

import { SubscribeButton } from "@/components/billing/subscribe-button";
import { SparkBackground } from "@/components/brand/spark-background";
import { CatalogCard } from "@/components/marketing/catalog-card";
import { getSubscribePriceId } from "@/lib/billing";
import { getPublicTools } from "@/lib/tools";

// ISR: the tool catalog on this page is pulled live from the database, so refresh
// the static HTML periodically — a tool published from the admin appears here
// within the window, with no redeploy. The price id is read from plans, too.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Pricing — Build & Launch AI",
  description:
    "One membership, every tool. $10/month, cancel anytime. You bring your own API keys — you pay your provider directly, nothing runs through my bill.",
};

const INCLUDED = [
  "Every tool in the catalog — and every one I ship next",
  "A new automation tool shipped every week",
  "Run on your own API keys — no markup, no middleman",
  "Full run history, kept for you",
  "Cancel anytime — no lock-in, no contract",
];

const STEPS = [
  {
    icon: CreditCard,
    title: "Subscribe",
    body: "$10/month, one click. No application, no waiting for approval.",
  },
  {
    icon: KeyRound,
    title: "Connect your keys",
    body: "Add a provider key once. It's encrypted, and no screen can show it back.",
  },
  {
    icon: Rocket,
    title: "Run",
    body: "Fill in the form, hit run, get your result. That's the whole job.",
  },
];

const FAQ = [
  {
    q: "What do I actually get?",
    a: "Access to every tool in the catalog, plus every new one I ship — and I ship a new automation tool every week. One flat price covers all of it.",
  },
  {
    q: "Do I need my own API keys?",
    a: "Yes — this is bring-your-own-keys. Tools run on your own provider keys (OpenAI, Google, and so on), so you pay your provider directly, at cost, with nothing marked up or running through my bill. A few tools run free with no key at all — try those first.",
  },
  {
    q: "Why bring my own keys instead of paying for usage?",
    a: "Two reasons. It's cheaper — you pay the provider at cost with no middleman. And it's safer — your key is encrypted before it's stored, no screen in the product can show it back (not even to me), and it never touches software I don't control.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel in one click, no contract and no lock-in. You keep access until the end of the period you've paid for.",
  },
  {
    q: "Who handles the payment?",
    a: "Paddle — our merchant of record. Paddle securely processes the payment, sends your receipt, and handles any applicable sales tax or VAT. I never see or store your card details.",
  },
  {
    q: "What happens to my data?",
    a: "Your run inputs, outputs, and history are yours. Files from a run are kept for 30 days, then age out; everything else is kept for you. Your API keys are encrypted at rest and only ever decrypted for the length of a single run.",
  },
];

export default async function PricingPage() {
  const [priceId, tools] = await Promise.all([
    getSubscribePriceId(),
    getPublicTools(),
  ]);

  return (
    <>
      <SparkBackground />
      <div className="mx-auto w-full max-w-[1200px] px-5 py-16 lg:px-8">
        {/* Hero */}
        <section className="mx-auto max-w-[52ch] text-center">
          <span className="text-eyebrow inline-flex items-center gap-2 rounded-pill border border-[color:rgba(200,242,79,0.28)] bg-accent-quiet px-3 py-1.5 text-accent">
            <Package aria-hidden className="size-3.5" strokeWidth={2} />
            Membership
          </span>
          <h1 className="text-display-xl mt-5 text-balance">
            One membership.{" "}
            <span className="text-accent">Every tool.</span>
          </h1>
          <p className="mt-5 text-body text-text-muted">
            A new automation tool every week, all yours for $10/month. You bring
            your own API keys — you pay your provider directly, and nothing runs
            through my bill.
          </p>
        </section>

        {/* Pricing card */}
        <section className="mt-14 flex justify-center">
          <div className="relative w-full max-w-md rounded-[24px] border border-line-strong bg-surface p-8 shadow-float [border-top-color:rgba(200,242,79,0.3)]">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-px rounded-[24px] shadow-[0_0_70px_-20px_rgba(200,242,79,0.5)]"
            />
            <div className="relative">
              <p className="text-eyebrow text-text-faint">Full membership</p>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-[52px] font-semibold leading-none text-text">
                  $10
                </span>
                <span className="text-body text-text-muted">/month</span>
              </div>
              <p className="mt-2 text-small text-text-muted">
                Everything, one price. Cancel anytime.
              </p>

              <ul className="mt-6 flex flex-col gap-3">
                {INCLUDED.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-pill bg-accent-quiet">
                      <Check
                        aria-hidden
                        className="size-3.5 text-accent"
                        strokeWidth={2.5}
                      />
                    </span>
                    <span className="text-small text-text">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7">
                <SubscribeButton
                  priceId={priceId}
                  label="Get instant access"
                  size="lg"
                  block
                />
              </div>
              <p className="text-mono-chip mt-3 flex items-center justify-center gap-1.5 text-text-faint">
                <ShieldCheck aria-hidden className="size-3.5" strokeWidth={1.8} />
                Secure checkout via Paddle · no card stored by us
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-24">
          <div className="rounded-[24px] border border-line bg-surface/25 p-6 sm:p-10 [border-top-color:rgba(200,242,79,0.14)]">
            <p className="text-eyebrow text-accent">How it works</p>
            <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <div key={title} className="relative flex flex-col items-start">
                  <span className="text-body-strong flex size-9 items-center justify-center rounded-pill border border-[color:rgba(200,242,79,0.5)] bg-canvas font-semibold text-accent shadow-[0_0_16px_-2px_rgba(200,242,79,0.55)]">
                    {i + 1}
                  </span>
                  <div className="relative mt-4 flex size-[88px] items-center justify-center rounded-[18px] border border-line bg-surface/50 shadow-[inset_0_0_36px_-12px_rgba(200,242,79,0.4)] [border-top-color:rgba(200,242,79,0.2)]">
                    <Icon
                      aria-hidden
                      className="size-9 text-accent [filter:drop-shadow(0_0_10px_rgba(200,242,79,0.6))]"
                      strokeWidth={1.4}
                    />
                  </div>
                  <h3 className="mt-5 text-h3">{title}</h3>
                  <p className="mt-2 text-small text-text-muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Live tool catalog — pulled from the database, not hardcoded */}
        {tools.length > 0 && (
          <section className="pb-24">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-eyebrow text-text-faint">In the catalog now</p>
                <h2 className="text-display-l mt-3 text-balance">
                  What your membership unlocks.
                </h2>
              </div>
              <span className="text-mono-chip hidden shrink-0 text-text-faint sm:block">
                {tools.length} {tools.length === 1 ? "tool" : "tools"} · growing
                weekly
              </span>
            </div>
            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((tool) => (
                <CatalogCard key={tool.slug} tool={tool} />
              ))}
            </div>
          </section>
        )}

        {/* FAQ — native <details>, no client JS */}
        <section className="pb-24">
          <h2 className="text-display-l text-balance">Questions.</h2>
          <div className="mt-8 flex flex-col gap-3">
            {FAQ.map(({ q, a }) => (
              <details
                key={q}
                className="group rounded-[16px] border border-line bg-surface/40 px-5 py-4 [border-top-color:rgba(200,242,79,0.12)]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-body-strong text-text marker:content-['']">
                  {q}
                  <span
                    aria-hidden
                    className="text-text-faint transition-transform duration-micro ease-default group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-small text-text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Paddle merchant-of-record note */}
        <section className="border-t border-line pt-10 text-center">
          <p className="prose-measure mx-auto text-small text-text-faint">
            Payments are processed by <span className="text-text-muted">Paddle</span>,
            our merchant of record. Paddle handles billing, your receipt, and any
            applicable sales tax or VAT. Prices are in USD. You can cancel anytime
            from your receipt link or your dashboard.
          </p>
        </section>
      </div>
    </>
  );
}
