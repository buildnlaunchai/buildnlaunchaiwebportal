import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Application } from "@/lib/applications";
import type { Membership } from "@/lib/member";
import type { Profile } from "@/lib/types";
import type { Database } from "@/lib/database.types";

type Plan = Database["public"]["Tables"]["plans"]["Row"];
type ToolAccessType = Database["public"]["Enums"]["tool_access_type"];
type ToolStatus = Database["public"]["Enums"]["tool_status"];

export type AdminUserRow = {
  profile: Profile;
  membership: Membership | null;
};

/** The users table (§8). Search matches name or email. */
export async function getUsersForAdmin(search?: string): Promise<AdminUserRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    query = query.or(`full_name.ilike.${q},email.ilike.${q}`);
  }

  const { data: profiles, error } = await query;
  if (error) throw error;
  if (!profiles || profiles.length === 0) return [];

  // Memberships in one query, joined in memory (admin RLS returns all).
  const { data: memberships } = await supabase.from("memberships").select("*");
  const byUser = new Map((memberships ?? []).map((m) => [m.user_id, m]));

  return profiles.map((profile) => ({
    profile,
    membership: byUser.get(profile.id) ?? null,
  }));
}

export type ToolAccessCell = {
  id: string;
  slug: string;
  name: string;
  access_type: ToolAccessType;
  status: ToolStatus;
  /** An explicit per-user grant exists (the matrix checkbox). */
  hasGrant: boolean;
  /** The engine says this user can open it right now, by ANY path. */
  canAccess: boolean;
};

export type AdminUserDetail = {
  profile: Profile;
  membership: Membership | null;
  plan: Plan | null;
  application: Application | null;
  tools: ToolAccessCell[];
};

/**
 * Everything the /admin/users/[id] page needs. The access matrix is computed
 * through the engine for the TARGET user, not the admin:
 *
 *   accessible_tool_ids(targetUserId)  →  can_access_tool(tool, targetUserId)
 *
 * which internally calls is_admin(targetUserId). This is the architecture-review
 * fix in action: because is_admin takes the subject, the matrix shows what the
 * MEMBER can access — it does not light up every tool just because an admin is
 * the one looking at the page.
 */
export async function getUserDetail(
  userId: string,
): Promise<AdminUserDetail | null> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;

  const [
    { data: membership },
    { data: application },
    { data: tools },
    { data: grants },
    { data: accessibleIds },
  ] = await Promise.all([
    supabase.from("memberships").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("applications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("tools")
      .select("id,slug,name,access_type,status,sort_order")
      .order("sort_order", { ascending: true }),
    supabase.from("user_tool_access").select("tool_id").eq("user_id", userId),
    // The subject-aware engine call — the whole point of the fix.
    supabase.rpc("accessible_tool_ids", { uid: userId }),
  ]);

  let plan: Plan | null = null;
  if (membership?.plan_id) {
    const { data } = await supabase
      .from("plans")
      .select("*")
      .eq("id", membership.plan_id)
      .maybeSingle();
    plan = data;
  }

  const grantSet = new Set((grants ?? []).map((g) => g.tool_id));
  const accessSet = new Set(accessibleIds ?? []);

  const toolCells: ToolAccessCell[] = (tools ?? []).map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    access_type: t.access_type,
    status: t.status,
    hasGrant: grantSet.has(t.id),
    canAccess: accessSet.has(t.id),
  }));

  return { profile, membership, plan, application, tools: toolCells };
}
