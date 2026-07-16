"use server";

import { requireUser } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

/**
 * Mark notifications read. Members may only ever set read_at on their OWN rows —
 * enforced by RLS (user_id = auth.uid()) plus the column grant that lets them
 * write read_at and nothing else (§6.10). We still requireUser first (§13).
 */
export async function markNotificationsRead(ids?: string[]): Promise<void> {
  await requireUser();
  const supabase = await createClient();

  let q = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (ids && ids.length > 0) q = q.in("id", ids);

  await q;
}
