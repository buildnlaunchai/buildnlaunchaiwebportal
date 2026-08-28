import { Webhook } from "@creem_io/nextjs";
import { NextRequest, NextResponse } from "next/server";

import {
  idOf,
  metadataOf,
  processCreemEvent,
  userIdFromMetadata,
} from "@/lib/creem/access";
import {
  CREDIT_TOPUP_UNMAPPED_EVENT_TYPE,
  checkoutCompletedEventType,
  readCheckoutKind,
} from "@/lib/creem/checkout-kind";
import { fulfilCreditTopup } from "@/lib/creem/credit-fulfilment";

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
    //
    // Three of the four are unconditional: a subscription going active, trialing
    // or paid is a membership by definition, whatever else is in the account.
    // `checkout.completed` is the exception and now decides its own event type
    // from the checkout's metadata — see the note on that callback.

    /**
     * THE ONLY EVENT THAT IS NOT SELF-DESCRIBING, AND THE ONLY ONE THAT HAS TO
     * ASK WHAT IT WAS.
     *
     * Creem fires `checkout.completed` for every product in the account, and
     * process_creem_event turns that one string into a full membership —
     * `status='active'`, `expires_at=null`, plan `member`, no expiry. With a
     * credit top-up about to go on sale through the same Creem checkout, an
     * unconditional grant here means $5 of credit buys a permanent free
     * membership. That is the bug this branch exists to close.
     *
     * So the kind decides the event type, and the event type decides the effect:
     * only `membership` is recorded as the literal `checkout.completed` the SQL
     * grants on. Everything else — a credit top-up, or metadata we cannot read —
     * is recorded under its own type and falls through the RPC's `else` branch,
     * which claims the event id and touches no membership.
     *
     * ABSENT METADATA IS TREATED AS NOT-A-MEMBERSHIP, deliberately — a checkout
     * that cannot prove what it bought does not get a membership.
     *
     * BE PRECISE ABOUT WHAT BACKS THAT UP, because the obvious answer is wrong.
     * The tempting claim is "a membership checkout is a subscription, so
     * `subscription.active` will grant it anyway". Production says otherwise:
     * onSubscriptionActive has been wired since the first Creem commit
     * (2026-08-08) and `subscription.active` has NEVER ARRIVED — zero rows in
     * creem_events across every purchase. Do not rely on it.
     *
     * What actually co-arrives with a subscription checkout is
     * `subscription.paid`, which is also a grant. It is confirmed on the
     * 2026-08-26 live purchase, where it landed on the same transaction
     * timestamp as `checkout.completed`. That is the real backstop, and it is
     * evidenced once rather than proven — earlier purchases predate
     * onSubscriptionPaid being wired (2026-08-24), so their silence proves
     * nothing either way.
     *
     * The residual risk is therefore narrow and worth stating plainly: a
     * MEMBERSHIP checkout already in flight at the moment this deploys carries
     * no kind, so it will not be granted by this event, and depends on
     * `subscription.paid` to arrive. If one is ever stranded, the console.warn
     * below names the webhook id and the fix is a single UPDATE on memberships.
     * A credit top-up has no subscription and therefore no second chance, which
     * is exactly the asymmetry we want.
     */
    onCheckoutCompleted: async (data) => {
      // Both places the discriminator can ride, same as the user id below: on
      // the checkout's own metadata, or on the subscription it created.
      const kind =
        readCheckoutKind(data.metadata) ??
        readCheckoutKind(metadataOf(data.subscription));

      let eventType = checkoutCompletedEventType(kind);

      const userId =
        userIdFromMetadata(data.metadata) ??
        userIdFromMetadata(metadataOf(data.subscription));

      // ─── CREDIT: FULFIL BEFORE RECORDING ──────────────────────────────────
      //
      // Deliberately the opposite order to the membership path, and safe only
      // because credit_topup is idempotent on the webhook id. The full argument
      // is in lib/creem/credit-fulfilment.ts; the short version is that
      // recording first would let a crash in between leave a paying buyer with
      // nothing and a retry that dedupes into silence.
      if (kind === "credit_topup") {
        const result = await fulfilCreditTopup({
          webhookId: data.webhookId,
          userId,
          productId: data.product?.id,
          units: data.units,
        });

        if (result.status === "failed") {
          // Throwing is the point: the SDK answers 500, Creem retries, and the
          // event is not recorded as done. A transient database failure must not
          // become a purchase nobody delivers.
          throw new Error(
            `[creem] credit top-up ${data.webhookId} failed for user=${userId ?? "none"}: ${result.reason}`,
          );
        }

        if (result.status === "unmapped" || result.status === "no_user") {
          // Money taken, nothing delivered, and a retry cannot help — no amount
          // of redelivery will add a row to credit_packages or a referenceId to
          // a checkout that left without one. So it is recorded under a type
          // that can be searched for, logged with everything needed to fix it by
          // hand, and answered 200. The fix is credit_admin_adjust.
          eventType = CREDIT_TOPUP_UNMAPPED_EVENT_TYPE;
          console.error(
            `[creem] CREDIT TOP-UP NOT DELIVERED (${data.webhookId}): ${result.status} ` +
              `user=${userId ?? "none"} product=${data.product?.id ?? "none"} ` +
              `units=${data.units ?? "?"} — grant it by hand from /admin/credits`,
          );
        } else {
          if (data.units !== 1) {
            console.warn(
              `[creem] credit top-up ${data.webhookId} had units=${data.units} ` +
                `— delivered ${result.credits} credits for ${result.packageSlug}`,
            );
          }
          console.log(
            `[creem] credit top-up ${data.webhookId} ${result.status}: ` +
              `${result.credits} credits (${result.packageSlug}) to ${userId}`,
          );
        }
      } else if (kind !== "membership") {
        // Loud, and it carries the user and subscription because this is the
        // line someone reads while fixing a stranded membership by hand. A
        // checkout we cannot identify and a membership that did not activate
        // look identical from the outside; both need the ids to act on.
        console.warn(
          `[creem] checkout.completed (${data.webhookId}) kind=${kind ?? "unknown"} ` +
            `user=${userId ?? "none"} subscription=${idOf(data.subscription) ?? "none"} ` +
            `— recorded, no membership granted`,
        );
      }

      // `data.id` here is the CHECKOUT id, not the subscription — using it as
      // provider_subscription_id would silently break every later revoke, which
      // matches on that column. The subscription is nested.
      await apply(eventType, data.webhookId, userId, idOf(data.subscription));
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

    // ---- RECORD ONLY -----------------------------------------------------
    // These three DO call apply(). They fall through process_creem_event's
    // `else` branch, which claims the event id and records it without touching
    // the membership — so they change no access, but they stop being lost.
    //
    // Why that matters more than it sounds: an unwired callback is not an
    // error. The SDK calls `options.onX?.(...)`, so it is a no-op, and the
    // route still answers 200. Creem marks the delivery successful and never
    // retries, and the event is gone with no row in creem_events and no trace
    // anywhere. Silent loss behind a success response is worse than a failure,
    // because nothing surfaces it.

    /**
     * Still explicitly NOT a revoke, and the SQL agrees — process_creem_event's
     * `else` branch names this case directly: "scheduled_cancel in particular
     * MUST NOT revoke". The subscription stays active until the period ends and
     * subscription.expired lands then; cutting access here would take away a
     * month the member has already paid for.
     *
     * What changes is only that it now leaves a row. Previously this callback
     * logged and returned, so the last of the 13 registered events still
     * vanished behind a 200 — and this is the one you most want a record of,
     * because it is the event that says a member has decided to leave.
     */
    onSubscriptionScheduledCancel: async (data) => {
      console.log(
        `[creem] subscription.scheduled_cancel (${data.id}) — access retained until expiry`,
      );
      await apply(
        "subscription.scheduled_cancel",
        data.webhookId,
        userIdFromMetadata(data.metadata),
        data.id,
      );
    },

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
