import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";

type AccessCode = Database["public"]["Tables"]["access_codes"]["Row"];

export type AccessCodeView = AccessCode & {
  planName: string | null;
  toolNames: string[];
};

/** All access codes for /admin/codes, with plan + tool names resolved. */
export async function listAccessCodes(): Promise<AccessCodeView[]> {
  const admin = createAdminClient();
  const [{ data: codes }, { data: plans }, { data: tools }] = await Promise.all([
    admin.from("access_codes").select("*").order("created_at", { ascending: false }),
    admin.from("plans").select("id, name"),
    admin.from("tools").select("id, name"),
  ]);

  const planName = new Map((plans ?? []).map((p) => [p.id, p.name]));
  const toolName = new Map((tools ?? []).map((t) => [t.id, t.name]));

  return (codes ?? []).map((c) => ({
    ...c,
    planName: c.plan_id ? planName.get(c.plan_id) ?? null : null,
    toolNames: (c.tool_ids ?? []).map((id) => toolName.get(id) ?? id),
  }));
}
