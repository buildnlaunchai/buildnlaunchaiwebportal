import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ToolCardData } from "@/lib/tools";
import type { Database } from "@/lib/database.types";

export type Membership = Database["public"]["Tables"]["memberships"]["Row"];

const CARD_COLUMNS =
  "id,slug,name,tagline,category,icon,status,access_type,runtime,required_providers,version,launched_at";

/** The signed-in user's membership, or null. RLS scopes it to them. */
export async function getMyMembership(): Promise<Membership | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("*")
    .maybeSingle();
  return data ?? null;
}

export function isMembershipActive(m: Membership | null): boolean {
  if (!m) return false;
  if (m.status !== "active" && m.status !== "trialing") return false;
  return m.expires_at === null || new Date(m.expires_at) > new Date();
}

/**
 * The tools this user can actually open, as card data. Resolved through the
 * access engine (accessible_tool_ids → can_access_tool) in ONE round trip, so
 * the dashboard grid never re-implements the access rules in TypeScript. The
 * database is the single source of truth for who-can-see-what.
 */
export async function getMyAccessibleTools(): Promise<ToolCardData[]> {
  const supabase = await createClient();

  const { data: toolIds } = await supabase.rpc("accessible_tool_ids");
  if (!toolIds || toolIds.length === 0) return [];

  const { data, error } = await supabase
    .from("tools")
    .select(CARD_COLUMNS)
    .in("id", toolIds)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ToolCardData[];
}
