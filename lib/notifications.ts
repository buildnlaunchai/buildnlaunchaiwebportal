import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type Notification = Database["public"]["Tables"]["notifications"]["Row"];

/** The current user's recent notifications, newest first. RLS scopes them. */
export async function getMyNotifications(limit = 20): Promise<Notification[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
