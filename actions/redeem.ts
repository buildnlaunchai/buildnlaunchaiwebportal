"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

/**
 * Redeem an access code. Auth first (§13), then the whole grant happens in the
 * redeem_access_code RPC — one transaction, security definer, granting ONLY
 * through memberships / user_tool_access. The member has no direct write to any
 * of those tables, so this Server Action is the only path and a crafted request
 * can't self-grant.
 */
export async function redeemCode(
  code: string,
): Promise<{ error: string } | { ok: true; kind: string }> {
  await requireUser("/dashboard/redeem");
  const trimmed = code.trim();
  if (!trimmed) return { error: "Enter a code." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_access_code", {
    p_code: trimmed,
  });

  if (error) {
    // Map the RPC's raised errors to plain, honest copy (§12).
    const msg = error.message || "";
    if (msg.includes("invalid code")) return { error: "That code isn't valid." };
    if (msg.includes("expired")) return { error: "That code has expired." };
    if (msg.includes("fully used")) return { error: "That code has been fully used." };
    if (msg.includes("already redeemed")) return { error: "You've already redeemed this code." };
    return { error: "Couldn't redeem that code. Try again." };
  }

  revalidatePath("/dashboard");
  const kind = (data as { kind?: string } | null)?.kind ?? "membership";
  return { ok: true, kind };
}
