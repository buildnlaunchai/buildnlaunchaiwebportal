"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAdmin, requireUser } from "@/lib/access";
import { pingDiscord } from "@/lib/discord";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";
import { applicationSchema } from "@/lib/validation/application";
import type { Database } from "@/lib/database.types";

type ApplicationStatus = Database["public"]["Enums"]["application_status"];

export type SubmitResult = { error: string };

/** First forwarded IP, for the per-IP rate-limit bucket. */
async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

/**
 * Submit an application. Order is cheapest-and-most-likely-to-fail first, so a
 * bot burns as little as possible before being turned away.
 *
 * On success this redirects and never returns; it only returns on a rejection
 * the user should see.
 */
export async function submitApplication(
  raw: unknown,
  turnstileToken: string | undefined,
  honeypot: string | undefined,
): Promise<SubmitResult> {
  // 0. Honeypot. A human never fills a field they cannot see. Pretend success —
  //    telling a bot it was caught just teaches it to adapt.
  if (honeypot && honeypot.trim() !== "") {
    redirect("/apply/thanks");
  }

  // 1. Auth. Applying requires an account (the locked-in decision). user_id and
  //    the contact fields come from the SESSION, never from the payload.
  const user = await requireUser("/apply");

  // 2. Applications must be open.
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("app_settings")
    .select("applications_open")
    .eq("id", true)
    .single();
  if (settings && settings.applications_open === false) {
    return { error: "Applications are closed right now. Check back soon." };
  }

  // 3. Per-IP rate limit (Postgres, §6.13). Abuse guard only.
  const ip = await clientIp();
  const { data: underLimit } = await admin.rpc("rate_limit_take", {
    p_bucket: `apply:ip:${ip}`,
    p_limit: 5,
    p_window: "1 hour",
  });
  if (underLimit === false) {
    return { error: "Too many attempts from your network. Try again in a bit." };
  }

  // 4. Turnstile. Verified server-side against Cloudflare with the secret key.
  const ok = await verifyTurnstile(turnstileToken, ip);
  if (!ok) {
    return { error: "That anti-spam check didn't pass. Reload and try again." };
  }

  // 5. Validate the answers with the SAME schema the client used.
  const parsed = applicationSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your answers." };
  }
  const input = parsed.data;

  // 6. Insert as the user (RLS insert-own is the backstop). Contact fields come
  //    from the profile, so a client can't apply as someone else.
  const supabase = await createClient();
  const { error } = await supabase.from("applications").insert({
    user_id: user.id,
    email: user.email,
    full_name: user.profile.full_name ?? user.email,
    use_case: input.use_case,
    tools_wanted: input.tools_wanted ?? null,
    willingness_to_pay: input.willingness_to_pay ?? null,
    heard_from: input.heard_from ?? null,
    role_title: input.role_title ?? null,
    company: input.company ?? null,
    website_url: input.website_url ?? null,
    socials: input.socials ?? null,
  });

  if (error) {
    // The partial unique index (one pending per user) surfaces as 23505.
    if (error.code === "23505") {
      return { error: "You already have an application in review." };
    }
    return { error: "Something went wrong saving that. Try again." };
  }

  // 7. Nudge Discord. Best-effort — a Discord failure must not fail the apply.
  const wtp = input.willingness_to_pay ? ` · would pay ${input.willingness_to_pay}` : "";
  await pingDiscord(
    `**New application** — ${user.profile.full_name ?? user.email} (${user.email})${wtp}\n> ${input.use_case.slice(0, 300)}`,
  );

  revalidatePath("/admin/applications");
  redirect("/apply/thanks");
}

/**
 * Admin review. Phase 3 only sets the status and records the reviewer — creating
 * a membership on approval is Phase 4. Guarded by requireAdmin (the third check,
 * §13), and it writes with the admin's own session so RLS applies.
 */
export async function reviewApplication(
  applicationId: string,
  status: Exclude<ApplicationStatus, "pending">,
  adminNote?: string,
): Promise<{ error: string } | { ok: true }> {
  const admin = await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("applications")
    .update({
      status,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      admin_note: adminNote?.trim() || null,
    })
    .eq("id", applicationId);

  if (error) return { error: "Couldn't update that application. Try again." };

  revalidatePath("/admin/applications");
  return { ok: true };
}
