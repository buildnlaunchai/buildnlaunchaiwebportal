"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error: string } | { ok: true };

function revalidateCredits(userId: string) {
  revalidatePath("/admin/credits");
  revalidatePath(`/admin/users/${userId}`);
  // The member's own page, so a grant they were told about is there when they
  // look rather than a cache-length later.
  revalidatePath("/dashboard/credits");
}

/**
 * Move a member's balance by hand.
 *
 * Goes through `credit_admin_adjust`, never a direct UPDATE, because the RPC
 * does three things a table write would not: it takes the balance row's lock,
 * it writes the ledger entry, and it stamps that entry with the rate and margin
 * in force at the time. Editing `credit_balances.balance` directly would move
 * the number and leave the ledger disagreeing with it forever — and the ledger
 * is the only thing that can answer "where did my credit go".
 *
 * `credits` is signed: positive grants, negative takes back.
 */
export async function adjustCredits(
  userId: string,
  credits: number,
  note: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  if (!Number.isInteger(credits) || credits === 0) {
    return { error: "Enter a whole number of credits, positive or negative." };
  }
  // A cap on the FORM, not on the system: credit_admin_adjust will happily move
  // any number, and a typo with three extra zeros is a lot of money moved by an
  // accident nobody notices. Deliberately generous enough for a real refund.
  if (Math.abs(credits) > 5_000_000) {
    return { error: "That is more than this form will move in one go." };
  }
  const trimmed = note.trim();
  if (!trimmed) {
    // Required, and it is not bureaucracy: an unexplained adjustment is
    // indistinguishable from a bug six months later, and the member can read
    // this note on their own page.
    return { error: "Say why. The member sees this on their credits page." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("credit_admin_adjust", {
    p_user_id: userId,
    p_credits: credits,
    p_actor: admin.id,
    p_note: trimmed,
  });
  if (error) return { error: "Couldn't adjust that balance. Try again." };

  await supabase.rpc("log_audit", {
    p_action: "credit.adjust",
    p_entity_type: "credit_balance",
    p_target_user: userId,
    p_metadata: { credits, note: trimmed },
  });

  revalidateCredits(userId);
  return { ok: true };
}

/**
 * Turn credit mode on or off for ONE member, or hand them back to the switch.
 *
 * ─── WHY THIS ONE IS AUDITED WITH ITS OLD VALUE ─────────────────────────────
 *
 * Granting an override is granting an authority to spend the platform's money:
 * from that moment every call that member makes is billed to us and charged to
 * their balance. That is the same class of act as granting a role, and §13 says
 * every admin mutation is logged.
 *
 * The metadata records what it was as well as what it became, because "who
 * turned this on" is only half the question anybody ever asks — the other half
 * is "and what was it before", which a log of the new value alone cannot
 * answer.
 *
 * `value` is a tri-state and null is a real choice, not a missing one: it means
 * "follow the global switch", which is where every member starts and where most
 * should stay. See credit_mode_for().
 */
export async function setCreditOverride(
  userId: string,
  value: boolean | null,
): Promise<ActionResult> {
  await requireAdmin();

  const supabase = await createClient();

  // Read first, so the audit row can say what changed rather than only what it
  // is now. A failure here is not fatal to the write; it costs the log its
  // "from", which is worth less than refusing the admin's action over it.
  const { data: before } = await supabase
    .from("profiles")
    .select("credit_mode_override")
    .eq("id", userId)
    .maybeSingle();

  const { error } = await supabase
    .from("profiles")
    .update({ credit_mode_override: value })
    .eq("id", userId);
  if (error) return { error: "Couldn't change that. Try again." };

  await supabase.rpc("log_audit", {
    p_action: "credit.mode_override",
    p_entity_type: "profile",
    p_entity_id: userId,
    p_target_user: userId,
    p_metadata: { from: before?.credit_mode_override ?? null, to: value },
  });

  revalidateCredits(userId);
  return { ok: true };
}
