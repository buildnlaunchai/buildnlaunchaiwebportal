import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";

export type Announcement = Database["public"]["Tables"]["announcements"]["Row"];

/** The latest published announcement for the banner (RLS shows only published). */
export async function getLatestPublishedAnnouncement(): Promise<Announcement | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("announcements")
    .select("*")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** All announcements for the admin composer (drafts included). */
export async function listAnnouncementsForAdmin(): Promise<Announcement[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}
