"use client";

import { Button } from "@/components/ui/button";

export type TopUpOption = { slug: string; credits: number; priceUsdCents: number };

/**
 * The buy buttons.
 *
 * A client component for one reason, and it is the same reason useSubscribe
 * ends in `window.location.href`: /api/checkout is a Route Handler that answers
 * 307 to Creem's hosted page. The App Router client cannot navigate to one — it
 * expects an RSC payload, and it would not follow a redirect to a third-party
 * origin. A full-page navigation is what actually leaves the app, so these
 * cannot be <Link>s.
 *
 * Nothing about the purchase travels in that URL except the package slug, which
 * names a row in credit_packages. The product id, the price, the buyer and the
 * credit amount are all resolved server-side. See app/api/checkout/route.ts.
 */
export function TopUpButtons({ options }: { options: TopUpOption[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o, i) => (
        <Button
          key={o.slug}
          // The first is the cheapest and the recommended way in, so it carries
          // the screen's one accent (DESIGN.md §2). The rest are secondary —
          // three primary buttons would be three answers to one question.
          variant={i === 0 ? "primary" : "secondary"}
          onClick={() => {
            window.location.href = `/api/checkout?kind=credit_topup&package=${encodeURIComponent(o.slug)}`;
          }}
        >
          {/* Explicit spaces. A bare space between an expression and the text
              next to it does not survive JSX reliably — this button shipped
              reading "50,000credits · $5", on the control someone presses to
              spend money. */}
          {o.credits.toLocaleString()}
          {" credits "}
          &middot;{" "}
          {`$${(o.priceUsdCents / 100).toFixed(0)}`}
        </Button>
      ))}
    </div>
  );
}
