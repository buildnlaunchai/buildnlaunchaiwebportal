"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { toolAccessGrantedEmail } from "@/lib/email";
import { notifyUser } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error: string } | { ok: true };

function revalidateUser(userId: string) {
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

/**
 * Lever 2: grant one specific tool to one specific user (§7 step 3, the per-user
 * override). This is the checkbox in the access matrix.
 */
export async function grantTool(
  userId: string,
  toolId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient(); // admin RLS allows writes to user_tool_access

  const { error } = await supabase.from("user_tool_access").upsert(
    { user_id: userId, tool_id: toolId, source: "manual", granted_by: admin.id },
    { onConflict: "user_id,tool_id" },
  );
  if (error) return { error: "Couldn't grant that tool. Try again." };

  await supabase.rpc("log_audit", {
    p_action: "tool.grant",
    p_entity_type: "tool",
    p_entity_id: toolId,
    p_target_user: userId,
  });

  // Tell the member their new tool is ready (§11).
  const svc = createAdminClient();
  const [{ data: profile }, { data: tool }] = await Promise.all([
    svc.from("profiles").select("email").eq("id", userId).maybeSingle(),
    svc.from("tools").select("name, slug").eq("id", toolId).maybeSingle(),
  ]);
  if (profile && tool) {
    await notifyUser({
      userId,
      title: `${tool.name} unlocked`,
      body: "I've granted you access to this tool.",
      href: `/dashboard/tools/${tool.slug}`,
      email: { to: profile.email, ...toolAccessGrantedEmail(tool.name, tool.slug) },
    });
  }

  revalidateUser(userId);
  return { ok: true };
}

/** Revoke a per-user grant. Does not touch membership-based access. */
export async function revokeTool(
  userId: string,
  toolId: string,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("user_tool_access")
    .delete()
    .eq("user_id", userId)
    .eq("tool_id", toolId);
  if (error) return { error: "Couldn't revoke that tool. Try again." };

  await supabase.rpc("log_audit", {
    p_action: "tool.revoke",
    p_entity_type: "tool",
    p_entity_id: toolId,
    p_target_user: userId,
  });
  revalidateUser(userId);
  return { ok: true };
}

/**
 * Grant a membership directly, by name, from /admin/users/[id] — the one lever
 * that stays after the free apply flow is retired for paid Paddle subs (§1: the
 * admin can gift access to anyone).
 *
 * `durationDays` decides the shape:
 *   - omitted / 0 / not a positive number  → a PERMANENT comp (status='active',
 *     never expires). The original gift behaviour, unchanged.
 *   - a positive whole number N            → an N-day TRIAL (status='trialing',
 *     expires_at = now + N days).
 *
 * Either way it's a direct grant with NO Paddle and NO code to distribute, and it
 * writes only to `memberships` — the access engine (can_access_tool /
 * user_tool_access) is never touched. Expiry needs no cron: has_active_membership()
 * already gates on `expires_at > now()`, so a lapsed trial simply stops granting.
 */
export async function giftMembership(
  userId: string,
  durationDays?: number,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const days =
    typeof durationDays === "number" && Number.isFinite(durationDays)
      ? Math.floor(durationDays)
      : 0;
  const isTrial = days > 0;
  const expiresAt = isTrial
    ? new Date(Date.now() + days * 86_400_000).toISOString()
    : null;

  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("is_default", true)
    .order("sort_order")
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("memberships").upsert(
    {
      user_id: userId,
      plan_id: plan?.id ?? null,
      status: isTrial ? "trialing" : "active",
      is_gift: true,
      source: "gift",
      granted_by: admin.id,
      started_at: new Date().toISOString(),
      expires_at: expiresAt,
    },
    { onConflict: "user_id" },
  );
  if (error) return { error: "Couldn't grant that membership. Try again." };

  await supabase.rpc("log_audit", {
    p_action: isTrial ? "membership.trial" : "membership.gift",
    p_entity_type: "membership",
    p_target_user: userId,
    p_metadata: isTrial ? { duration_days: days } : null,
  });
  revalidateUser(userId);
  return { ok: true };
}

/**
 * Revoke a membership. Destructive and affects someone else, so the UI requires
 * typed confirmation (DESIGN.md §9). We set status='revoked' rather than delete,
 * so the row's history survives.
 */
export async function revokeMembership(userId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("memberships")
    .update({ status: "revoked" })
    .eq("user_id", userId);
  if (error) return { error: "Couldn't revoke that membership. Try again." };

  await supabase.rpc("log_audit", {
    p_action: "membership.revoke",
    p_entity_type: "membership",
    p_target_user: userId,
  });
  revalidateUser(userId);
  return { ok: true };
}

/**
 * Suspend / unsuspend. profiles.is_suspended is column-grant-blocked for
 * `authenticated` (Phase 1), so this write goes through the SERVICE ROLE — after
 * requireAdmin re-verifies. A suspended user fails can_access_tool for everything
 * and is bounced to /suspended.
 */
export async function setSuspended(
  userId: string,
  suspended: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from("profiles")
    .update({ is_suspended: suspended })
    .eq("id", userId);
  if (error) return { error: "Couldn't update that account. Try again." };

  // Log with the user session so actor_id is the admin, not null.
  const supabase = await createClient();
  await supabase.rpc("log_audit", {
    p_action: suspended ? "user.suspend" : "user.unsuspend",
    p_entity_type: "profile",
    p_target_user: userId,
  });
  revalidateUser(userId);
  return { ok: true };
}
