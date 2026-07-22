import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The Paddle Billing webhook processor. It writes ONLY to `memberships`, using
 * the same columns every other grant path uses (see actions/admin-users.ts
 * giftMembership) plus the two payment columns that already exist on the table
 * (`provider`, `provider_subscription_id`). It adds NO access logic anywhere —
 * can_access_tool / has_active_membership read `memberships` unchanged, so a
 * Paddle member and a grandfathered member are indistinguishable to the engine.
 *
 * Two schema realities shape this, both deliberate:
 *   - membership_status is (trialing|active|expired|revoked). There is no
 *     'canceled' or 'past_due'. Since has_active_membership grants only on
 *     active/trialing, every deactivation collapses to 'expired' — the engine
 *     needs zero changes. The Paddle event type is preserved in paddle_events.
 *   - memberships has provider_subscription_id but no customer-id column, so the
 *     Paddle customer id is intentionally not stored (it is needed for none of
 *     the events handled here — all key off custom_data.user_id / the sub id).
 */

type PaddleEvent = {
  event_id: string;
  event_type: string;
  data: {
    id?: string; // sub_… on subscription.*; txn_… on transaction.*
    status?: string;
    subscription_id?: string; // present on transaction.*
    custom_data?: { user_id?: string } | null;
  };
};

/** Activate (or refresh) a membership from a subscription that is now live. */
async function activateMembership(
  admin: ReturnType<typeof createAdminClient>,
  data: PaddleEvent["data"],
): Promise<void> {
  const userId = data.custom_data?.user_id;
  if (!userId) {
    // Our checkout always sets custom_data.user_id (§Phase 3), so this is a
    // misconfiguration, not a transient error. Retrying can't fix it — ack it.
    console.error("[paddle] subscription event has no custom_data.user_id; skipping");
    return;
  }

  const { data: plan } = await admin
    .from("plans")
    .select("id")
    .eq("slug", "member")
    .maybeSingle();

  const { error } = await admin.from("memberships").upsert(
    {
      user_id: userId,
      plan_id: plan?.id ?? null,
      status: "active",
      source: "paddle",
      is_gift: false,
      granted_by: null,
      started_at: new Date().toISOString(),
      expires_at: null, // Paddle owns the lifecycle; cancel/past_due arrive as events
      provider: "paddle",
      provider_subscription_id: data.id ?? null,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`memberships upsert failed: ${error.message}`);
}

/**
 * Deactivate a membership on cancel / past_due. Keyed by the SUBSCRIPTION id, not
 * the user: if the member has since started a new subscription, a late event for
 * the old sub finds no matching row and correctly leaves the new one alone.
 */
async function deactivateMembership(
  admin: ReturnType<typeof createAdminClient>,
  data: PaddleEvent["data"],
): Promise<void> {
  const subId = data.id ?? null;
  const userId = data.custom_data?.user_id ?? null;

  let query = admin.from("memberships").update({ status: "expired" as const });
  if (subId) query = query.eq("provider_subscription_id", subId);
  else if (userId) query = query.eq("user_id", userId);
  else {
    console.error("[paddle] cancel/past_due event has no subscription id or user_id");
    return;
  }

  const { error } = await query;
  if (error) throw new Error(`memberships status update failed: ${error.message}`);
}

/** Route one verified, not-yet-processed event to its membership effect. */
export async function processPaddleEvent(event: PaddleEvent): Promise<void> {
  const admin = createAdminClient();

  switch (event.event_type) {
    case "subscription.created":
    case "subscription.activated":
      await activateMembership(admin, event.data);
      break;

    case "subscription.canceled":
    case "subscription.past_due":
      // Both map to 'expired' — the enum has no 'canceled'/'past_due'. If the
      // payment recovers, subscription.activated re-activates the row.
      await deactivateMembership(admin, event.data);
      break;

    case "transaction.completed":
      // Renewal confirmation. The subscription.* events own membership state, so
      // there is nothing to write here — recorded in paddle_events, logged here.
      console.log(
        `[paddle] transaction.completed (sub ${event.data.subscription_id ?? "?"})`,
      );
      break;

    default:
      // Unhandled type — acknowledged and recorded, no membership effect.
      break;
  }
}
