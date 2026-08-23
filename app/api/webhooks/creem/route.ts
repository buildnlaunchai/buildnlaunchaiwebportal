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
    // The three types the brief maps to a grant. The SQL holds the mapping; the
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
  });

  return handler(req);
}
