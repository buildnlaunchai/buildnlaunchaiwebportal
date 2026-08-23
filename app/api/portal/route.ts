import { Portal } from "@creem_io/nextjs";
import { NextRequest, NextResponse } from "next/server";

import { getMyMembership } from "@/lib/member";
import { createClient } from "@/lib/supabase/server";

// Same shape as app/api/checkout/route.ts, and for the same reasons: the Creem
// SDK is Node-targeted, and a route that reads the session must never be
// statically rendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTINGS = "/dashboard/settings";

/**
 * Creem customer portal — where a member sees their invoices, updates their
 * card, and cancels.
 *
 * This is what makes the public site honest. /terms §4 and the Refund Policy
 * both say "You can cancel your membership at any time from your account
 * settings", and until this route existed there was no such thing anywhere in
 * the product. The claim came first; this is the code catching up to it.
 *
 * A GET handler, like /api/checkout: the SDK's Portal reads its parameter from
 * the query string and answers with a redirect to Creem's hosted page. An
 * ordinary <a href> is the whole client integration — and it must be an <a>,
 * not next/link, because the App Router client cannot navigate to a Route
 * Handler (it expects an RSC payload, and would not follow a redirect to a
 * third-party origin).
 *
 * WHY THIS IS WRAPPED RATHER THAN RE-EXPORTED
 * ------------------------------------------------------------------
 * Read the SDK's Portal implementation before changing anything here:
 *
 *     const customerId = req.nextUrl.searchParams.get("customerId")
 *     ... creem.customers.generateBillingLinks({ customerId })
 *
 * That is the ENTIRE authorization story in the SDK's version — there is none.
 * `customerId` is client-supplied and unauthenticated, so re-exporting Portal
 * bare (which is what its README shows) would publish an endpoint where anyone
 * who can guess or observe a `cust_…` id gets a working billing portal for a
 * stranger: their invoices, their billing address, their card's last four, and
 * a button that cancels their subscription. That is a full account-takeover of
 * someone's billing, reachable from a browser address bar.
 *
 * So the request the SDK sees is BUILT HERE and nothing the caller sent
 * survives into it. The URL is rebuilt rather than cloned — a clone would carry
 * the caller's `customerId` straight through and re-open the hole. This is the
 * same rule, and the same failure mode, as CLAUDE.md §13's "never accept a
 * user_id from the client and trust it".
 *
 * The chain that replaces it: session → our own memberships row (RLS-scoped to
 * that user) → the subscription id WE recorded from a signed webhook → Creem's
 * own answer for which customer owns it. Every link is server-side.
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.CREEM_API_KEY;
  if (!apiKey) {
    console.error("[creem] CREEM_API_KEY is not set");
    return new NextResponse("not configured", { status: 500 });
  }

  // Test vs live is env-driven, never hardcoded, and defaults to TEST — the
  // same rule as checkout. Here it also decides which API host we ask, so a
  // mismatch would look up a test subscription against the live API and 404.
  const testMode = process.env.CREEM_TEST_MODE !== "false";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(SETTINGS)}`, req.nextUrl.origin),
    );
  }

  // RLS scopes this to the caller's own row, so there is no way to ask for
  // someone else's subscription by editing the request.
  const membership = await getMyMembership();

  // Deliberately NOT gated on isMembershipActive(). A member who has already
  // cancelled keeps access until the period ends and may want to re-subscribe
  // or fetch a receipt; someone whose subscription lapsed may want last month's
  // invoice. Neither can see anything but their own billing, so refusing them
  // would protect nothing and lose a real use case. What IS required is a Creem
  // subscription to point at — a gifted or manually-granted membership has no
  // billing to manage, and sending that member to Creem would be a dead end.
  if (membership?.provider !== "creem" || !membership.provider_subscription_id) {
    return NextResponse.redirect(new URL(SETTINGS, req.nextUrl.origin));
  }

  const customerId = await resolveCustomerId(
    membership.provider_subscription_id,
    apiKey,
    testMode,
  );

  if (!customerId) {
    // Their membership is real but Creem won't tell us who owns it. Send them
    // back rather than handing the SDK an empty id and rendering its raw JSON
    // error at them.
    return NextResponse.redirect(new URL(`${SETTINGS}?billing=unavailable`, req.nextUrl.origin));
  }

  // Built fresh. The only parameter is one we resolved server-side.
  const url = new URL(req.nextUrl.pathname, req.nextUrl.origin);
  url.searchParams.set("customerId", customerId);

  const handler = Portal({ apiKey, testMode });
  return handler(new NextRequest(url, req));
}

/**
 * Which Creem customer owns this subscription?
 *
 * We store `provider_subscription_id` on `memberships` but never a customer id,
 * so it has to be resolved per request. Done with plain fetch against Creem's
 * REST API rather than by importing the `creem` package: that package is a
 * transitive dependency of @creem_io/nextjs, not one we declare, and reaching
 * past a direct dependency into its own tree is the kind of thing that breaks
 * silently on a minor bump. The hosts are the same two the SDK itself uses.
 *
 * `customer` comes back either expanded or as a bare id string — the SDK types
 * it `CustomerEntity | string` — so both are handled, exactly as idOf() does in
 * lib/creem/access.ts.
 *
 * If this ever becomes hot, the fix is a `provider_customer_id` column written
 * by the webhook, not a cache here.
 */
async function resolveCustomerId(
  subscriptionId: string,
  apiKey: string,
  testMode: boolean,
): Promise<string | null> {
  const base = testMode ? "https://test-api.creem.io" : "https://api.creem.io";

  try {
    const res = await fetch(
      `${base}/v1/subscriptions?subscription_id=${encodeURIComponent(subscriptionId)}`,
      { headers: { "x-api-key": apiKey }, cache: "no-store" },
    );

    if (!res.ok) {
      console.error(`[creem] subscription lookup failed (${res.status}) for ${subscriptionId}`);
      return null;
    }

    const body: unknown = await res.json();
    const customer = (body as { customer?: unknown }).customer;

    if (typeof customer === "string") return customer || null;
    const id = (customer as { id?: unknown } | null | undefined)?.id;
    return typeof id === "string" && id ? id : null;
  } catch (error) {
    // Never let a provider outage throw an unhandled 500 at a member who only
    // wanted to cancel. The caller redirects them somewhere with an explanation.
    console.error("[creem] subscription lookup threw", error);
    return null;
  }
}
