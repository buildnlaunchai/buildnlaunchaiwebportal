import "server-only";

import { createClient } from "@/lib/supabase/server";

/** One audit entry, with actor + target profiles resolved to names. */
export type AuditLogRow = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: { full_name: string | null; email: string } | null;
  target: { full_name: string | null; email: string } | null;
};

/**
 * The audit trail, newest first. RLS restricts `audit_logs` to admins, so the
 * admin's own session is enough — no service role. Two foreign keys point at
 * `profiles` (actor + target), so each embed is disambiguated by its column.
 */
export async function getAuditLogs(limit = 100): Promise<AuditLogRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select(
      "id, action, entity_type, entity_id, metadata, created_at, " +
        "actor:profiles!actor_id(full_name,email), " +
        "target:profiles!target_user(full_name,email)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as AuditLogRow[];
}
