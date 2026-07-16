"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireUser } from "@/lib/access";
import { shippedRequestEmail } from "@/lib/email";
import { notifyUser } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result = { error: string } | { ok: true };

const STATUSES = ["open", "planned", "building", "shipped", "declined"] as const;
type Status = (typeof STATUSES)[number];

/** Submit a feature request. RLS insert-own is the backstop; user_id from the
    session, never the client. */
export async function submitFeatureRequest(
  title: string,
  body: string,
): Promise<Result> {
  const user = await requireUser("/dashboard/requests");
  if (title.trim().length < 4) return { error: "Give it a short, clear title." };

  const supabase = await createClient();
  const { error } = await supabase.from("feature_requests").insert({
    user_id: user.id,
    title: title.trim(),
    body: body.trim() || null,
  });
  if (error) return { error: "Couldn't submit that. Try again." };

  revalidatePath("/dashboard/requests");
  revalidatePath("/admin/requests");
  return { ok: true };
}

/** Toggle a vote. Engagement, not access — no grant table is touched. */
export async function toggleVote(
  requestId: string,
): Promise<{ error: string } | { ok: true; voted: boolean }> {
  const user = await requireUser("/dashboard/requests");
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("feature_request_votes")
    .select("request_id")
    .eq("request_id", requestId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("feature_request_votes")
      .delete()
      .eq("request_id", requestId)
      .eq("user_id", user.id);
    revalidatePath("/dashboard/requests");
    return { ok: true, voted: false };
  }

  const { error } = await supabase
    .from("feature_request_votes")
    .insert({ request_id: requestId, user_id: user.id });
  if (error) return { error: "Couldn't record your vote. Try again." };

  revalidatePath("/dashboard/requests");
  return { ok: true, voted: true };
}

/**
 * Admin: set a request's status and optionally link the tool that shipped it.
 * When it ships with a tool linked, notify the requester AND everyone who
 * upvoted — "you asked for this, it's live" (§11), through the Phase 8 path.
 */
export async function setRequestStatus(
  requestId: string,
  status: Status,
  shippedToolId?: string | null,
): Promise<Result> {
  await requireAdmin();
  if (!STATUSES.includes(status)) return { error: "Unknown status." };

  const svc = createAdminClient();
  const { error } = await svc
    .from("feature_requests")
    .update({
      status,
      shipped_tool_id: status === "shipped" ? shippedToolId ?? null : null,
    })
    .eq("id", requestId);
  if (error) return { error: "Couldn't update the request. Try again." };

  await svc.rpc("log_audit", { p_action: `request.${status}`, p_entity_type: "feature_request", p_entity_id: requestId });

  if (status === "shipped" && shippedToolId) {
    await notifyShipped(requestId, shippedToolId);
  }

  revalidatePath("/admin/requests");
  revalidatePath("/dashboard/requests");
  return { ok: true };
}

async function notifyShipped(requestId: string, toolId: string): Promise<void> {
  const svc = createAdminClient();
  const [{ data: request }, { data: tool }, { data: votes }] = await Promise.all([
    svc.from("feature_requests").select("user_id, title").eq("id", requestId).maybeSingle(),
    svc.from("tools").select("name, slug").eq("id", toolId).maybeSingle(),
    svc.from("feature_request_votes").select("user_id").eq("request_id", requestId),
  ]);
  if (!request || !tool) return;

  // Requester + every upvoter, de-duplicated.
  const userIds = new Set<string>([request.user_id, ...(votes ?? []).map((v) => v.user_id)]);
  const { data: profiles } = await svc
    .from("profiles")
    .select("id, email")
    .in("id", [...userIds]);

  for (const p of profiles ?? []) {
    await notifyUser({
      userId: p.id,
      title: "You asked for this — it's live",
      body: `${tool.name} shipped, from your request "${request.title}".`,
      href: `/dashboard/tools/${tool.slug}`,
      email: { to: p.email, ...shippedRequestEmail(request.title, tool.name, tool.slug) },
    });
  }
}
