"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error: string } | { ok: true };

/**
 * A status from one of the credit RPCs, turned into something a person can act
 * on.
 *
 * "Couldn't change that. Try again." was what this screen said for every
 * failure, and it was worse than unhelpful: the failure it was actually
 * reporting — a permission denied by the column grant — was one that trying
 * again could never fix, so the message sent an admin round a loop with no exit.
 * Every sentence below says what went wrong AND whether repeating the action is
 * worth anything.
 */
function explain(status: unknown, fallback: string): string {
  switch (typeof status === "string" ? status : null) {
    case "not_admin":
      // The session is authenticated but not an admin — a demotion, or an
      // expired session that got refreshed as somebody else. Retrying is
      // pointless; signing in again is the only thing that changes it.
      return "This session isn't an admin session. Sign out and back in, then try again.";
    case "no_such_user":
      return "That member no longer exists. Reload the list.";
    case "invalid":
      return "That isn't a change this can make. Check the number and the member.";
    default:
      return fallback;
  }
}

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
  const { data: status, error } = await supabase.rpc("credit_admin_adjust", {
    p_user_id: userId,
    p_credits: credits,
    p_actor: admin.id,
    p_note: trimmed,
  });
  // Two different failures with two different answers: `error` is the database
  // being unreachable or refusing the call, which a retry can genuinely fix;
  // `status` is the function saying no, which it will keep saying.
  if (error) {
    return { error: "Couldn't reach the database. Try again in a moment." };
  }
  if (status !== "ok") {
    return { error: explain(status, "That balance couldn't be adjusted.") };
  }

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
 * What credit_set_mode_override reports back: whether it was allowed, what it
 * replaced, and whether that was a change at all.
 *
 * Hand-parsed because the RPC returns jsonb and the type generator can only
 * call that `Json` — it cannot see the shape a plpgsql function builds. Narrow
 * it once, here, rather than casting at the call site: an unexpected shape
 * becomes an unknown status, which `explain()` already turns into a sentence,
 * instead of a property read on something that might not be an object.
 */
function readOverrideResult(data: unknown): {
  status: string;
  from: boolean | null;
  changed: boolean;
} {
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    status: typeof row.status === "string" ? row.status : "unknown",
    from: typeof row.from === "boolean" ? row.from : null,
    changed: row.changed === true,
  };
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

  // Through the RPC, NOT a table update — and this is the bug that shipped.
  //
  // `profiles` grants UPDATE on three columns to `authenticated`, and
  // credit_mode_override is deliberately not one of them. A grant is checked
  // before RLS and knows nothing about roles, so it refused the ADMIN too: every
  // press of these buttons came back 42501. The earlier test proved a member
  // could not write the column and never asked whether an admin could.
  //
  // The fix is not a wider grant — that would hand every member their own
  // spending authority. It is a security-definer function that checks is_admin
  // itself, called with the admin's OWN session so log_audit still records who
  // they are. See 20260828140000.
  const { data, error } = await supabase.rpc("credit_set_mode_override", {
    p_user_id: userId,
    // The generator types every function argument as non-null, because Postgres
    // does not say otherwise in the catalogue. Here NULL is not a missing value
    // — it is the default state, "follow the global switch", and the function
    // documents that it deliberately does not null-check this parameter. The
    // cast is about the generator, not about the contract.
    p_value: value as boolean,
  });
  // Two different failures with two different answers: `error` is the database
  // being unreachable or refusing the call, which a retry can genuinely fix;
  // `status` is the function saying no, which it will keep saying.
  if (error) {
    return { error: "Couldn't reach the database. Try again in a moment." };
  }
  const result = readOverrideResult(data);
  if (result.status !== "ok") {
    return { error: explain(result.status, "That couldn't be changed.") };
  }

  // ─── THE AUDIT ROW IS THE DATABASE'S ACCOUNT, NOT A SEPARATE ONE ───────────
  //
  // `from` comes back from the same statement that did the write, under the
  // row's lock, so it is what this change actually replaced. It used to be a
  // SELECT of its own a round trip earlier, which is a value that WAS true
  // rather than the value that was overwritten — a difference that is invisible
  // with one admin and permanent once there are two.
  //
  // And a press that changed nothing writes nothing. An audit log is only worth
  // reading if every row in it is an event; "set to true, was already true" is a
  // row that has to be read and discarded, and enough of them make the real ones
  // hard to see.
  if (result.changed) {
    await supabase.rpc("log_audit", {
      p_action: "credit.mode_override",
      p_entity_type: "profile",
      p_entity_id: userId,
      p_target_user: userId,
      p_metadata: { from: result.from, to: value },
    });
  }

  revalidateCredits(userId);
  return { ok: true };
}
