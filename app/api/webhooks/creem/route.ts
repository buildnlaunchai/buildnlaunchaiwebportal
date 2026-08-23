import { Webhook } from "@creem_io/nextjs";
import { NextRequest, NextResponse } from "next/server";

import {
  idOf,
  metadataOf,
  processCreemEvent,
  userIdFromMetadata,
} from "@/lib/creem/access";

// Sits under app/api/webhooks/, which proxy.ts excludes from the session
// middleware — a webhook carries no session cookie, so the refresh is wasted
// work, and its guard is in the route, not in middleware.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Creem webhook. Two steps, and their order IS the security model:
 *   1. HMAC-verify the RAW body — reject before touching anything. The SDK does
 *      this first, comparing an HMAC-SHA256 of the raw body against the
 *      `creem-signature` header, and 400s on a mismatch.
 *   2. Hand the event to process_creem_event(), which claims it (the creem_events
 *      PK is the concurrency gate) and applies the membership effect in ONE
 *      transaction. A concurrent duplicate returns 'deduped' without
 *      re-processing; any failure rolls the claim back, so a 500 here lets
 *      Creem's retry re-run cleanly.
 *
 * There is NO IP allowlist, and its absence is deliberate rather than an
 * omission. Creem's docs are explicit: "Creem does not provide static source IP
 * addresses for outbound webhooks in either Test Mode or production" — they
 * direct you to verify the signature instead. Hardcoding a guessed list would
 * silently drop real deliveries the day Creem changed egress. Signature-only is
 * the whole guard, which is why step 1 above runs before anything else.
 *
 * WHY NOT onGrantAccess / onRevokeAccess
 * ------------------------------------------------------------------
 * The SDK offers those two convenience callbacks, and they are the obvious thing
 * to reach for. They cannot be used for the membership write, for one decisive
 * reason: the SDK invokes them as `{ reason, ...event.object }` and does NOT
 * pass `webhookId`. Every granular callback below DOES get it. `webhookId` is
 * Creem's per-delivery event id, and the key the creem_events primary key
 * dedupes on. Driving grants from
 * onGrantAccess would mean having no idempotency key at the moment we need one,
 * which is the entire point of the pattern.
 *
 * Their coverage is also narrower than the mapping this integration needs:
 * onGrantAccess fires for active/trialing/paid (never checkout.completed), and
 * onRevokeAccess fires ONLY for paused/expired — not canceled, unpaid, past_due,
 * refund or dispute. So they are wired to logging, where they are genuinely
 * useful, and the granular callbacks below own the writes.
 */
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.CREEM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[creem] CREEM_WEBHOOK_SECRET is not set");
    return new NextResponse("not configured", { status: 500 });
  }

  /**
   * One call site for every event: claim by webhookId, let the SQL decide the
   * effect. Throwing on failure is intentional — the SDK catches it and answers
   * 500, which is what tells Creem to retry.
   */
  const apply = async (
    eventType: string,
    webhookId: string,
    userId: string | null,
    subscriptionId: string | null,
  ) => {
    const result = await processCreemEvent({
      eventId: webhookId,
      eventType,
      userId,
      subscriptionId,
    });
    // 'no_user' is not an error — it is a recorded, terminal outcome that says
    // the event carried no referenceId we could attach a membership to. Worth a
    // loud log, because it means a paying customer got nothing.
    if (result === "no_user") {
      console.error(
        `[creem] ${eventType} (${webhookId}) had no usable referenceId — no membership attached`,
      );
    }
    return result;
  };

  const handler = Webhook({
    webhookSecret,

    // ---- GRANT -----------------------------------------------------------
    // The four types the SQL maps to a grant. The SQL holds the mapping; the
    // route only supplies (event type, event id, user, subscription).

    onCheckoutCompleted: async (data) => {
      // `data.id` here is the CHECKOUT id, not the subscription — using it as
      // provider_subscription_id would silently break every later revoke, which
      // matches on that column. The subscription is nested.
      await apply(
        "checkout.completed",
        data.webhookId,
        userIdFromMetadata(data.metadata) ??
          userIdFromMetadata(metadataOf(data.subscription)),
        idOf(data.subscription),
      );
    },

    onSubscriptionActive: async (data) => {
      await apply(
        "subscription.active",
        data.webhookId,
        userIdFromMetadata(data.metadata),
        data.id,
      );
    },

    onSubscriptionTrialing: async (data) => {
      await apply(
        "subscription.trialing",
        data.webhookId,
        userIdFromMetadata(data.metadata),
        data.id,
      );
    },

    /**
     * The recovery path, and the reason a paying member does not get stranded.
     *
     * process_creem_event has listed 'subscription.paid' as a GRANT since
     * migration 20260808130000, but nothing ever emitted it — this callback was
     * missing, so that SQL branch was unreachable and the failure the migration
     * was written to prevent was live anyway:
     *
     *   card fails      -> subscription.past_due -> membership revoked
     *   Creem retries, payment SUCCEEDS -> subscription.paid -> ...nothing
     *
     * The member is paying and locked out, permanently, because nothing else in
     * the system will ever restore them. subscription.active is documented as a
     * CREATION event and is not relied on to re-fire after past_due.
     *
     * This also lands on every ordinary renewal, where the upsert simply
     * rewrites an already-active membership to the same values — which is why
     * wiring it is safe as well as necessary.
     */
    onSubscriptionPaid: async (data) => {
      await apply(
        "subscription.paid",
        data.webhookId,
        userIdFromMetadata(data.metadata),
        data.id,
      );
    },

    // ---- REVOKE ----------------------------------------------------------

    onSubscriptionCanceled: async (data) => {
      await apply(
        "subscription.canceled",
        data.webhookId,
        userIdFromMetadata(data.metadata),
        data.id,
      );
    },

    onSubscriptionExpired: async (data) => {
      await apply(
        "subscription.expired",
        data.webhookId,
        userIdFromMetadata(data.metadata),
        data.id,
      );
    },

    onSubscriptionUnpaid: async (data) => {
      await apply(
        "subscription.unpaid",
        data.webhookId,
        userIdFromMetadata(data.metadata),
        data.id,
      );
    },

    onSubscriptionPastDue: async (data) => {
      await apply(
        "subscription.past_due",
        data.webhookId,
        userIdFromMetadata(data.metadata),
        data.id,
      );
    },

    onRefundCreated: async (data) => {
      // A refund entity's own `id` is the refund id. The subscription is either
      // expanded on the refund or referenced by the transaction.
      await apply(
        "refund.created",
        data.webhookId,
        userIdFromMetadata(metadataOf(data.subscription)),
        idOf(data.subscription) ?? data.transaction?.subscription ?? null,
      );
    },

    onDisputeCreated: async (data) => {
      await apply(
        "dispute.created",
        data.webhookId,
        userIdFromMetadata(metadataOf(data.subscription)),
        idOf(data.subscription) ?? data.transaction?.subscription ?? null,
      );
    },

    // ---- OBSERVE ONLY ----------------------------------------------------
    // No webhookId, so no idempotency key, so no write. See the header comment.
    onGrantAccess: async ({ reason }) => {
      console.log(`[creem] onGrantAccess (${reason}) — handled by the granular callback`);
    },
    onRevokeAccess: async ({ reason }) => {
      console.log(`[creem] onRevokeAccess (${reason}) — handled by the granular callback`);
    },

    // Explicitly NOT a revoke: the subscription stays active until the period
    // ends, and subscription.expired lands then. Revoking here would cut off a
    // member who has already paid for the rest of the month.
    onSubscriptionScheduledCancel: async (data) => {
      console.log(
        `[creem] subscription.scheduled_cancel (${data.id}) — access retained until expiry`,
      );
    },

    // ---- RECORD ONLY -----------------------------------------------------
    // These two DO call apply(). They fall through process_creem_event's `else`
    // branch, which claims the event id and records it without touching the
    // membership — so they change no access, but they stop being lost.
    //
    // Why that matters more than it sounds: an unwired callback is not an
    // error. The SDK calls `options.onX?.(...)`, so it is a no-op, and the
    // route still answers 200. Creem marks the delivery successful and never
    // retries, and the event is gone with no row in creem_events and no trace
    // anywhere. Silent loss behind a success response is worse than a failure,
    // because nothing surfaces it.

    /**
     * Paused is NOT treated as a revoke here, and that is an open question
     * rather than a settled answer: a paused subscription is not being billed,
     * so a paused member currently keeps full access for free. Recording it
     * first means the decision can be made on real data instead of guesses.
     */
    onSubscriptionPaused: async (data) => {
      console.log(`[creem] subscription.paused (${data.id}) — recorded, access unchanged`);
      await apply(
        "subscription.paused",
        data.webhookId,
        userIdFromMetadata(data.metadata),
        data.id,
      );
    },

    /** Plan/quantity/metadata changes. No access effect today. */
    onSubscriptionUpdate: async (data) => {
      await apply(
        "subscription.update",
        data.webhookId,
        userIdFromMetadata(data.metadata),
        data.id,
      );
    },
  });

  return handler(req);
}
