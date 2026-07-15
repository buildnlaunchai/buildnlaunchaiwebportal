import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type Application = Database["public"]["Tables"]["applications"]["Row"];
export type ApplicationStatus = Database["public"]["Enums"]["application_status"];

/** The signed-in user's most recent application, or null. RLS scopes it to them. */
export async function getMyLatestApplication(): Promise<Application | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("applications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Are applications open? Reads the public settings view. */
export async function getApplicationsOpen(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings_public")
    .select("applications_open")
    .maybeSingle();
  // Default to open if the row is somehow missing — better to accept an
  // application we can review than to silently turn people away.
  return data?.applications_open ?? true;
}

/**
 * The admin review queue, newest first, optionally filtered by status. Relies on
 * the admin RLS policy — the caller (the admin page) has already run requireAdmin.
 */
export async function getApplicationsForAdmin(
  status?: ApplicationStatus,
): Promise<Application[]> {
  const supabase = await createClient();
  let query = supabase
    .from("applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Counts per status, for the admin filter tabs. */
export async function getApplicationCounts(): Promise<
  Record<ApplicationStatus, number>
> {
  const supabase = await createClient();
  const { data } = await supabase.from("applications").select("status");

  const counts: Record<ApplicationStatus, number> = {
    pending: 0,
    approved: 0,
    waitlisted: 0,
    rejected: 0,
  };
  for (const row of data ?? []) counts[row.status] += 1;
  return counts;
}
