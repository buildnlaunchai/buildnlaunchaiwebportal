import "server-only";

/**
 * What a Creem checkout is buying.
 *
 * WHY THIS FILE EXISTS
 * ------------------------------------------------------------------
 * `checkout.completed` is not self-describing. Creem sends the same event for
 * every product in the account, and process_creem_event maps that one event type
 * to a membership grant — `status='active'`, `expires_at=null`, plan `member`.
 *
 * That was correct while a membership subscription was the only thing for sale.
 * It stops being correct the moment a second product ships: a $5 credit top-up
 * would fire `checkout.completed` and hand the buyer a permanent free
 * membership. The webhook has no way to tell the two apart, because nothing in
 * the event says which one it was.
 *
 * So the checkout says. The discriminator rides in checkout metadata, which
 * app/api/checkout/route.ts writes server-side (never from the client, §13) and
 * Creem echoes back on the webhook. BOTH DIRECTIONS GO THROUGH THIS FILE, so the
 * key and the vocabulary cannot drift between the writer and the reader — which
 * is the only failure mode that would quietly reopen the bug.
 *
 * This module holds the vocabulary and nothing else. Which product id a kind
 * checks out is lib/billing.ts's job; what a kind does to a membership is the
 * SQL's. Keeping those apart is why `credit_topup` can be named here, and
 * recognised by the webhook, before any of the credit feature is built.
 */

/**
 * Every kind of checkout this product can start or receive.
 *
 * `credit_topup` is listed although nothing sells it yet, and that is deliberate
 * rather than speculative: the webhook has to RECOGNISE it today so a top-up
 * bought before the rest of the feature lands is recorded under its own name
 * instead of falling into `unknown`. Naming it costs nothing and makes the
 * eventual credit work additive.
 */
export const CHECKOUT_KINDS = ["membership", "credit_topup"] as const;

export type CheckoutKind = (typeof CHECKOUT_KINDS)[number];

/**
 * The metadata key the kind travels under.
 *
 * Half of a contract with checkouts that may already be in flight when this
 * deploys, and with every checkout Creem has already recorded. Renaming it means
 * every in-flight checkout reads as `unknown` — which fails closed (no
 * membership), so it is safe, but it is still a renaming that costs someone a
 * membership they paid for. If it ever must change, read both spellings for one
 * release first.
 */
export const CHECKOUT_KIND_KEY = "checkoutKind";

export function isCheckoutKind(value: unknown): value is CheckoutKind {
  return (
    typeof value === "string" &&
    (CHECKOUT_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Read the kind back off a Creem entity's metadata.
 *
 * Returns null for BOTH "absent" and "present but unrecognised", and callers
 * must treat the two identically: not a membership purchase. Collapsing them is
 * the point — a checkout that cannot prove what it bought does not get a
 * membership. Fail-closed is the whole fix.
 *
 * Deliberately loose in its parameter type. Creem's metadata is
 * `Record<string, string | number | null>` on the happy path, but it is also
 * whatever someone typed into a checkout created by hand in the Creem dashboard,
 * so this normalises rather than trusts.
 */
export function readCheckoutKind(metadata: unknown): CheckoutKind | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>)[CHECKOUT_KIND_KEY];
  return isCheckoutKind(raw) ? raw : null;
}

/**
 * The event type a completed checkout is recorded under.
 *
 * THIS FUNCTION IS THE GRANT DECISION, and it is written as one line so the
 * decision has exactly one home. `process_creem_event` grants on the literal
 * string `checkout.completed` and records everything else through its `else`
 * branch, so returning anything but that string is what makes a checkout
 * non-granting.
 *
 * The return value is one of exactly three strings — never interpolated from
 * caller data — because `creem_events.event_type` is free text and metadata is
 * not fully ours to trust. `readCheckoutKind` has already narrowed anything
 * unrecognised to null by the time it reaches here.
 *
 *   membership   -> 'checkout.completed'                 GRANTS (unchanged)
 *   credit_topup -> 'checkout.completed.credit_topup'    records only
 *   null         -> 'checkout.completed.unknown'         records only
 */
/**
 * A credit top-up we took money for and could not map to a package.
 *
 * Its own event type rather than an interpolated string, for the reason the
 * function below is written the way it is: `creem_events.event_type` is free
 * text, and every value that reaches it comes from this file. It is not a grant
 * — it falls through process_creem_event's `else` branch like the others — but
 * it is the one an admin greps for, because it means a buyer paid and received
 * nothing until somebody acts.
 */
export const CREDIT_TOPUP_UNMAPPED_EVENT_TYPE =
  "checkout.completed.credit_topup.unmapped";

export function checkoutCompletedEventType(kind: CheckoutKind | null): string {
  if (kind === "membership") return "checkout.completed";
  if (kind === "credit_topup") return "checkout.completed.credit_topup";
  return "checkout.completed.unknown";
}
