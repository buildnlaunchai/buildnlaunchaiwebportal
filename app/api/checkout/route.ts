import { Checkout } from "@creem_io/nextjs";
import { NextRequest, NextResponse } from "next/server";

import { getSubscribePriceId } from "@/lib/billing";
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
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.CREEM_API_KEY;
  if (!apiKey) {
    console.error("[creem] CREEM_API_KEY is not set");
    return new NextResponse("not configured", { status: 500 });
  }

  // Test vs live is env-driven, never hardcoded. Default to TEST: the failure
  // mode of a missing var should be "sandbox money", not "real money".
  const testMode = process.env.CREEM_TEST_MODE !== "false";

  // The membership must attach to a real account, so the session is the gate —
  // the same auth-before-join rule useSubscribe applies before it sends anyone here.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = encodeURIComponent("/dashboard");
    return NextResponse.redirect(new URL(`/login?next=${next}`, req.nextUrl.origin));
  }

  // The checkout target is data, not code: plans.provider_price_id on the
  // slug='member' row. Moving test→live, or switching product, is one UPDATE and
  // no redeploy — the convention lib/billing.ts was written around.
  const productId = await getSubscribePriceId();
  if (!productId) {
    console.error(
      "[creem] plans.provider_price_id is empty for slug='member' — nothing to check out",
    );
    return new NextResponse("not configured", { status: 500 });
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
  url.searchParams.set("referenceId", user.id);
  url.searchParams.set("metadata", JSON.stringify({ referenceId: user.id }));
  if (user.email) {
    url.searchParams.set("customer", JSON.stringify({ email: user.email }));
  }
  // ?checkout=1 lets MembershipActivationWatcher poll for the async webhook to
  // activate the membership, instead of rendering the stale pre-payment state.
  url.searchParams.set("successUrl", `${siteUrl}/dashboard?checkout=1`);

  const handler = Checkout({ apiKey, testMode });
  return handler(new NextRequest(url, req));
}
