import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Pings the admin's Discord webhook when something worth a glance happens
 * (CLAUDE.md §11 — a new application goes to Discord, not email).
 *
 * The URL lives in app_settings.discord_webhook_url, never in env, and never in
 * a client — so it's read with the service role. Best-effort by design: a
 * Discord outage must NEVER fail a member's action. Every path here swallows
 * its own errors and returns void.
 */
export async function pingDiscord(content: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_settings")
      .select("discord_webhook_url")
      .eq("id", true)
      .single();

    const url = data?.discord_webhook_url;
    if (!url) return; // not configured yet — silently skip

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    // Log, never throw. The caller's mutation has already succeeded.
    console.error("Discord ping failed (non-fatal):", err);
  }
}
