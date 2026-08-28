/**
 * Selling credit: the price list, the fulfilment gate, and the order of the two.
 *
 * ─── WHAT THIS IS DEFENDING ─────────────────────────────────────────────────
 *
 * Three failures, each of which costs somebody money in a different direction:
 *
 *   1. A MEMBER EDITING THE PRICE LIST. credit_packages says how many credits a
 *      $5 product delivers. A write policy here would be a member setting their
 *      own balance.
 *   2. FULFILLING WHAT WAS NOT BOUGHT. The credit amount comes from the Creem
 *      PRODUCT ID via our own table — never from checkout metadata, which Creem
 *      echoes back verbatim and which anyone creating a checkout by hand in the
 *      Creem dashboard can write.
 *   3. TAKING MONEY AND DELIVERING NOTHING. The membership gate sits at the
 *      checkout, before Creem is reached; fulfilment runs unconditionally,
 *      because by then it has been paid for. Getting that backwards is not a
 *      guard, it is keeping someone's money.
 *
 * ─── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────
 *
 * It never actually tops anything up. credit_ledger is append-only, so an
 * account with a topup row cannot be deleted, and a probe that grants real
 * credit strands accounts in production — which is exactly what happened to
 * verify-credits (see its header). The one assertion that has to write is proved
 * inside migration 20260828190000, in a subtransaction that rolls back.
 */
import { readFileSync } from "node:fs";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !ANON || !SVC) {
  console.error("  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(2);
}

let pass = 0, fail = 0;
const check = (ok, label, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (ok) pass++; else fail++;
};
const read = (p) => readFileSync(p, "utf8");
const anon = (path, init = {}) =>
  fetch(`${URL_}${path}`, {
    ...init,
    headers: { apikey: ANON, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
const svc = (path, init = {}) =>
  fetch(`${URL_}${path}`, {
    ...init,
    headers: {
      apikey: SVC,
      Authorization: `Bearer ${SVC}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

console.log("\n  The price list");
{
  const res = await anon("/rest/v1/credit_packages?select=slug,credits,price_usd_cents,provider_product_id&order=sort_order");
  const rows = await res.json();
  check(Array.isArray(rows) && rows.length === 3, "anon can read it — it is a price list", JSON.stringify(rows?.length));

  const want = { topup_5: [50000, 500], topup_20: [200000, 2000], topup_50: [500000, 5000] };
  for (const [slug, [credits, cents]] of Object.entries(want)) {
    const row = (rows ?? []).find((r) => r.slug === slug);
    check(
      row?.credits === credits && row?.price_usd_cents === cents,
      `${slug} is ${credits.toLocaleString()} credits for $${cents / 100}`,
      JSON.stringify(row),
    );
  }

  // Not an oversight: nothing is sellable until the Creem products exist, and
  // the checkout route answers 501 rather than inventing an id.
  const configured = (rows ?? []).filter((r) => r.provider_product_id).length;
  console.log(`        (${configured}/3 have a Creem product id)`);
}

console.log("\n  Nobody but the service role may write it");
{
  for (const [who, headers] of [
    ["anon", { apikey: ANON }],
    // No session here, so this is the anon role twice over — the point being
    // that there is NO policy for any client role, so no session could help.
    ["authenticated-shaped", { apikey: ANON, Authorization: `Bearer ${ANON}` }],
  ]) {
    const res = await fetch(`${URL_}/rest/v1/credit_packages?slug=eq.topup_5`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ credits: 999999999 }),
    });
    check(res.status === 401 || res.status === 403 || res.status === 404,
      `a ${who} write is refused`, `HTTP ${res.status}`);
  }
  const after = await (await anon("/rest/v1/credit_packages?select=credits&slug=eq.topup_5")).json();
  check(after?.[0]?.credits === 50000, "and the price list is unchanged");
}

console.log("\n  The membership gate is the DEFAULT, and only the webhook opts out");
{
  // A real account with no active membership. Asserted with a real amount, so
  // it is the gate answering and not the amount check — and 'no_membership'
  // writes no ledger row, so nothing is stranded.
  const nonMember = await (
    await svc("/rest/v1/profiles?select=id&limit=50")
  ).json();
  let subject = null;
  for (const p of nonMember ?? []) {
    const active = await (
      await svc("/rest/v1/rpc/has_active_membership", {
        method: "POST",
        body: JSON.stringify({ uid: p.id }),
      })
    ).json();
    if (active === false) { subject = p.id; break; }
  }

  if (!subject) {
    console.log("        (everyone has an active membership — gate assertion skipped)");
  } else {
    const res = await svc("/rest/v1/rpc/credit_topup", {
      method: "POST",
      body: JSON.stringify({
        p_user_id: subject,
        p_credits: 1000,
        p_source: "verify",
        p_reference: `verify-topup-${subject}`,
      }),
    });
    const body = await res.json();
    check(body === "no_membership", "a non-member cannot be topped up by default", JSON.stringify(body));

    const ledger = await (
      await svc(`/rest/v1/credit_ledger?select=id&reference=eq.verify-topup-${subject}`)
    ).json();
    check(Array.isArray(ledger) && ledger.length === 0, "and nothing was written");
  }
  // The other direction — p_require_membership:false fulfilling anyway — is
  // asserted inside migration 20260828190000, in a subtransaction that rolls
  // back. It cannot be asserted here without leaving a topup row in production
  // that no delete can remove.
  console.log("        (p_require_membership:false is proved in 20260828190000, rolled back)");
}

console.log("\n  The order money moves in");
{
  const CHECKOUT = read("app/api/checkout/route.ts");
  const WEBHOOK = read("app/api/webhooks/creem/route.ts");
  const FULFIL = read("lib/creem/credit-fulfilment.ts");
  const PAGE = read("app/(app)/dashboard/credits/page.tsx");

  // The gate must run BEFORE the product is resolved: a non-member must never
  // reach a Creem session at all.
  const gateAt = CHECKOUT.indexOf("has_active_membership");
  const productAt = CHECKOUT.indexOf("await productIdForKind");
  check(gateAt > 0 && gateAt < productAt, "the checkout gates on membership before creating a session");
  check(
    /package=\$\{|searchParams.get\("package"\)/.test(CHECKOUT),
    "and the package is named by slug, resolved server-side",
  );

  // Fulfilment before recording. If this ever inverts, a crash in between
  // leaves a paid buyer with nothing and a retry that dedupes into silence.
  const fulfilAt = WEBHOOK.indexOf("fulfilCreditTopup");
  const applyAt = WEBHOOK.indexOf("await apply(eventType");
  check(fulfilAt > 0 && fulfilAt < applyAt, "the webhook fulfils before it records the event");
  check(
    /p_reference: params.webhookId/.test(FULFIL),
    "and fulfilment is idempotent on the Creem webhook id, which is what makes that safe",
  );

  // The amount comes from the product id, never from metadata.
  check(
    /creditsForProductId/.test(FULFIL) && !/readCheckoutKind|metadata/.test(FULFIL.replace(/\/\*[\s\S]*?\*\//g, "")),
    "the credit amount is resolved from the product id, not from event metadata",
  );
  check(
    /p_require_membership: false/.test(FULFIL),
    "and a purchase that has been paid for is delivered regardless of membership",
  );

  // The page must not offer a package it cannot sell.
  check(
    /providerProductId !== null/.test(PAGE),
    "the page only offers packages that have a Creem product id",
  );
  check(
    /credits.available > 0/.test(PAGE) && /Renew membership/.test(PAGE),
    "and a lapsed member out of credit is offered the way through, not a refusal",
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
