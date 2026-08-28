import "server-only";

import { creditsForProductId } from "@/lib/credit-packages";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Turning a paid Creem checkout into credit.
 *
 * ─── THE ORDER MATTERS, AND IT IS NOT THE OBVIOUS ONE ───────────────────────
 *
 * The webhook fulfils FIRST and records the event afterwards. The instinct is
 * the reverse — claim the event id, then act — and that instinct is right when
 * the action is not idempotent. Here it is: `credit_topup` takes the Creem
 * webhook id as its reference, and `credit_ledger` has a unique index on
 * (kind, reference), so a second delivery of the same event adds nothing.
 *
 * Given that, recording first is strictly worse. `process_creem_event` claims the
 * id, so a crash between the claim and the top-up leaves an event marked
 * processed, a buyer with no credit, and a retry that dedupes into a no-op —
 * silent, permanent, and only discoverable by someone comparing Creem's receipts
 * against the ledger by hand. Fulfilling first inverts every one of those: a
 * crash before the record means Creem retries, the top-up says `duplicate`, and
 * the record lands on the second pass.
 *
 * ─── AND WHY THE AMOUNT IS NOT READ FROM THE EVENT'S METADATA ───────────────
 *
 * The number of credits comes from OUR table, keyed on the Creem product id.
 * Metadata would have been easier and is echoed back verbatim by Creem, which
 * means anyone who can create a checkout in the Creem dashboard could write it.
 * The product id is the one identifier on the event that is both stable and not
 * the buyer's to choose.
 */

export type FulfilmentResult =
  | { status: "ok" | "duplicate"; credits: number; packageSlug: string }
  | { status: "unmapped" }
  | { status: "no_user" }
  | { status: "failed"; reason: string };

export async function fulfilCreditTopup(params: {
  /** Creem's per-delivery id. Doubles as the idempotency key. */
  webhookId: string;
  userId: string | null;
  /** The Creem product id from the event — never from metadata. */
  productId: string | null | undefined;
  /** How many of that product were bought. Our checkout fixes this at 1. */
  units: number | null | undefined;
}): Promise<FulfilmentResult> {
  if (!params.userId) return { status: "no_user" };

  const pkg = await creditsForProductId(params.productId);
  if (!pkg) return { status: "unmapped" };

  // Creem tells us what it charged for. Our own checkout pins units to 1, so
  // anything else means the hosted page allowed a quantity we did not expect —
  // in which case delivering what was paid for is the only correct reading, and
  // the caller logs the surprise.
  const units = Math.max(1, Math.trunc(params.units ?? 1));
  const credits = pkg.credits * units;

  const svc = createAdminClient();
  const { data, error } = await svc.rpc("credit_topup", {
    p_user_id: params.userId,
    p_credits: credits,
    p_source: "creem",
    p_reference: params.webhookId,
    p_note: units === 1 ? pkg.name : `${pkg.name} × ${units}`,
    // The membership was checked at the checkout, before any money moved. By the
    // time this runs it has been paid for, and a membership that lapsed in
    // between must not turn into a purchase that delivers nothing. See
    // 20260828190000.
    p_require_membership: false,
  });

  if (error) return { status: "failed", reason: error.message };
  if (data === "ok" || data === "duplicate") {
    return { status: data, credits, packageSlug: pkg.slug };
  }
  return { status: "failed", reason: String(data) };
}
