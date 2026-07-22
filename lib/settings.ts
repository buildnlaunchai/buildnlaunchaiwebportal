import "server-only";

import { createPublicClient } from "@/lib/supabase/public";

/**
 * The admin-uploaded site logo URL, or null to fall back to the built-in daisy
 * mark. Reads the public settings view, so it resolves for anonymous visitors
 * (the marketing header) as well as signed-in members and admins.
 */
export async function getLogoUrl(): Promise<string | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("app_settings_public")
    .select("logo_url")
    .maybeSingle();
  return data?.logo_url ?? null;
}
