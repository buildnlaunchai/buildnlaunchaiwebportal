import { Checkout } from "@creem_io/nextjs";
import { NextRequest, NextResponse } from "next/server";

import { getSubscribePriceId } from "@/lib/billing";
import { getCreditPackage } from "@/lib/credit-packages";
import {
  CHECKOUT_KIND_KEY,
  type CheckoutKind,
  isCheckoutKind,
} from "@/lib/creem/checkout-kind";
import { createClient } from "@/lib/supabase/server";

// A webhook is not the only sanctioned route any more: this one exists because
// Creem's checkout is a server-side redirect (create a session with the secret
// API key, 302 to the hosted page), which a Server Action cannot express.
// node:crypto is not needed here, but the Creem SDK is Node-targeted and this
// must never be statically rendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Creem checkout.
 *
 * This is a GET handler, not POST: the SDK's Checkout reads its parameters from
 * the query string and answers with a 307 to Creem's hosted page. A <Link> or a
 * router.push at it is the whole client integration.
 *
 * WHY THIS IS WRAPPED RATHER THAN RE-EXPORTED
 * ------------------------------------------------------------------
 * The SDK's handler takes productId, referenceId, metadata, customer, units and
 * discountCode straight off `req.nextUrl.searchParams`, with no authentication.
 * Re-exported bare — which is what the SDK's own README shows — that means:
 *
 *   * `referenceId` is client-supplied, and referenceId is precisely what the
 *     webhook reads to decide WHOSE membership to activate. That is
 *     "accept a user_id from the client and trust it", which CLAUDE.md §13
 *     forbids in as many words.
 *   * `discountCode` is client-supplied, so anyone could apply any active code.
 *   * `units` is client-supplied, so a membership could be bought at qty 7.
 *   * `productId` is client-supplied, so the endpoint would check out any
 *     product in the Creem account.
 *
 * So the request the SDK sees is BUILT HERE, from scratch, and nothing the caller
 * sent survives into it. The user comes from the Supabase session and from
 * nowhere else. Note the URL is rebuilt rather than cloned — a clone would carry
 * the caller's parameters through and re-open every hole above.
 *
 * THE ONE THING THE CALLER MAY INFLUENCE, AND WHY IT IS SAFE
 * ------------------------------------------------------------------
 * `?kind=` selects WHICH of our own checkouts to start. It is not passed through
 * to Creem: it is validated against a closed enum, and everything that actually
 * reaches the SDK — the product id, the metadata — is then looked up server-side
 * from that enum. An unrecognised value is a 400, not a default, so the query
 * string can pick between our products but can never introduce one.
 *
 * That distinction is the whole reason this is not the `productId` hole above.
 * A client naming a product checks out anything in the Creem account; a client
 * naming a KIND picks a row out of a table this file owns.
 */

/**
 * Which Creem product each kind of checkout buys.
 *
 * Both kinds resolve from the database, never from code: `membership` reads
 * plans.provider_price_id, `credit_topup` reads credit_packages. Moving
 * test\u2192live, changing a price, or retiring a package is an UPDATE.
 *
 * A package with no `provider_product_id` returns null and the route answers
 * 501 rather than inventing an id \u2014 the same rule the membership plan has
 * always followed. That is the state the three rows ship in, so this endpoint is
 * complete and unsellable until the Creem products exist.
 */
async function productIdForKind(
  kind: CheckoutKind,
  packageSlug: string | null,
): Promise<string | null> {
  if (kind === "membership") return getSubscribePriceId();
  if (!packageSlug) return null;
  const pkg = await getCreditPackage(packageSlug);
  return pkg?.providerProductId ?? null;
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.CREEM_API_KEY;
  if (!apiKey) {
    console.error("[creem] CREEM_API_KEY is not set");
    return new NextResponse("not configured", { status: 500 });
  }

  // Test vs live is env-driven, never hardcoded. Default to TEST: the failure
  // mode of a missing var should be "sandbox money", not "real money".
  const testMode = process.env.CREEM_TEST_MODE !== "false";

  // What is being bought. Absent means membership, which is what every existing
  // CTA sends (useSubscribe navigates to a bare /api/checkout) and what this
  // route has always done — so the default preserves today's behaviour exactly.
  //
  // The default is safe HERE and would not be safe in the webhook, and the
  // asymmetry is the fix: this side is choosing what to sell, where guessing
  // "membership" costs nothing; that side is deciding what to grant, where
  // guessing "membership" is the bug.
  const rawKind = req.nextUrl.searchParams.get("kind");
  if (rawKind !== null && !isCheckoutKind(rawKind)) {
    return new NextResponse("unknown checkout kind", { status: 400 });
  }
  const kind: CheckoutKind = rawKind ?? "membership";

  // WHICH package, for a top-up. Same shape of parameter as `kind` and safe for
  // the same reason: it names a row in a table this app owns, and everything
  // that reaches Creem is looked up from that row. A slug that resolves to
  // nothing is a 400, never a default \u2014 defaulting to a package would mean
  // charging someone for a product they did not pick.
  const packageSlug = req.nextUrl.searchParams.get("package");
  if (kind === "credit_topup" && !packageSlug) {
    return new NextResponse("a package is required", { status: 400 });
  }

  // The membership must attach to a real account, so the session is the gate —
  // the same auth-before-join rule useSubscribe applies before it sends anyone here.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Back where they were going, not to a generic dashboard. Reaching this with
    // kind=credit_topup takes an expired session on /dashboard/credits — rare,
    // and precisely the moment when landing somewhere else feels like the click
    // was lost.
    const next = encodeURIComponent(
      kind === "credit_topup" ? "/dashboard/credits" : "/dashboard",
    );
    return NextResponse.redirect(new URL(`/login?next=${next}`, req.nextUrl.origin));
  }

  // The checkout target is data, not code: plans.provider_price_id on the
  // slug='member' row. Moving test→live, or switching product, is one UPDATE and
  // no redeploy — the convention lib/billing.ts was written around.
  // ─── THE MEMBERSHIP GATE FOR CREDIT, AND WHY IT IS HERE ────────────────────
  //
  // Credits are for members: while a membership is active the apps run on the
  // member\u2019s own keys, and credits are the cushion that keeps them working if
  // it lapses. Buying that cushion is therefore something you do as a member.
  //
  // The check belongs HERE, before Creem is ever reached, and NOT in
  // credit_topup, which only ever runs after the money has moved. A membership
  // that lapses between opening this checkout and the webhook landing would make
  // a fulfilment-time check refuse a purchase somebody had already paid for \u2014
  // which is not a guard, it is keeping their money. Refusing the sale costs
  // nobody anything; refusing the delivery costs them everything. See
  // 20260828190000.
  if (kind === "credit_topup") {
    const { data: active } = await supabase.rpc("has_active_membership", {
      uid: user.id,
    });
    if (active !== true) {
      // Not a bare 403: the person is signed in, on a page they were sent to by
      // an app that told them to buy credit, and the thing they can act on is a
      // membership. The credits page renders that case in full.
      return NextResponse.redirect(
        new URL("/dashboard/credits?topup=members_only", req.nextUrl.origin),
      );
    }
  }

  const productId = await productIdForKind(kind, packageSlug);
  if (!productId) {
    if (kind === "membership") {
      console.error(
        "[creem] plans.provider_price_id is empty for slug='member' — nothing to check out",
      );
      return new NextResponse("not configured", { status: 500 });
    }
    // A kind we know the name of but cannot sell yet. Distinct from the 400
    // above (which means "no such kind") and from the 500 (which means "this
    // should work and is misconfigured").
    console.error(`[creem] no product configured for checkout kind '${kind}'`);
    return new NextResponse("not available yet", { status: 501 });
  }

  // Where Creem returns the buyer after paying.
  //
  // NEXT_PUBLIC_SITE_URL is the canonical production domain and is set for the
  // Preview scope too — so on a preview deployment it would bounce the buyer to
  // the LIVE site rather than the build being tested. VERCEL_URL is the
  // deployment's own host, injected per deployment, so every preview
  // self-references with no per-deploy configuration.
  //
  // Production is unaffected: VERCEL_ENV === 'production' takes the canonical
  // domain, which is what the receipt and the Creem dashboard should show. Local
  // dev has neither var and falls through to NEXT_PUBLIC_SITE_URL.
  const siteUrl =
    process.env.VERCEL_ENV !== "production" && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin);

  // Built fresh. Every value is ours; none is the caller's.
  const url = new URL(req.nextUrl.pathname, req.nextUrl.origin);
  url.searchParams.set("productId", productId);
  // The webhook reads metadata.referenceId to find profiles.id — Creem's events
  // don't otherwise know our users. Set in both places the SDK looks.
  //
  // It also reads the kind, and that one is load-bearing: `checkout.completed`
  // grants a membership ONLY when this says `membership`. A checkout that leaves
  // without this field gets no membership from that event, so it is written here
  // for every kind, unconditionally, rather than only for the ones that need it.
  url.searchParams.set("referenceId", user.id);
  url.searchParams.set(
    "metadata",
    JSON.stringify({ referenceId: user.id, [CHECKOUT_KIND_KEY]: kind }),
  );
  if (user.email) {
    url.searchParams.set("customer", JSON.stringify({ email: user.email }));
  }
  // Quantity is ours, and fixed \u2014 for the top-up only.
  //
  // credit_packages maps a product to a number of credits per unit, so a
  // quantity the buyer could change would be a quantity that changes how much
  // they receive; the webhook multiplies correctly either way, but there is no
  // reason to offer the choice.
  //
  // NOT set for membership, deliberately. That path has been taking real money
  // since 2026-08-26 with `units` absent, and a subscription checkout is
  // quantity 1 by definition \u2014 sending a value it has never received is risk
  // with no benefit on the one flow that must not break.
  if (kind === "credit_topup") {
    url.searchParams.set("units", "1");
  }
  // ?checkout=1 lets MembershipActivationWatcher poll for the async webhook to
  // activate the membership, instead of rendering the stale pre-payment state.
  // ?topup=1 is the same idea for credit: the balance arrives with the webhook,
  // seconds after the redirect, and a page showing the old balance to someone
  // who has just paid is the one thing a buyer must never see.
  url.searchParams.set(
    "successUrl",
    kind === "credit_topup"
      // `t` is when this checkout started. The credits page uses it to ask the
      // ledger "has a top-up landed since?", which is answerable in both
      // orderings — unlike "is the balance higher than when the page rendered",
      // which the webhook wins often enough to be reliably wrong. It only drives
      // a spinner, so a buyer editing it costs nothing.
      ? `${siteUrl}/dashboard/credits?topup=1&t=${Date.now()}`
      : `${siteUrl}/dashboard?checkout=1`,
  );

  const handler = Checkout({ apiKey, testMode });
  return handler(new NextRequest(url, req));
}
