import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type AdminMetrics = {
  pendingApplications: number;
  activeMembers: number;
  runs7d: number;
  successRate: number | null; // 0–100, null if no runs in the window
  topTools: { name: string; runs: number }[];
  signupTrend: number[]; // daily new signups, oldest → newest (14 days)
};

/**
 * The /admin overview (§8). Aggregates read with the service role — the page
 * gates on requireAdmin() first, which is the authorization. These are small
 * counts at this scale; if the tables grow, move the heavier ones to SQL views.
 */
export async function getAdminMetrics(): Promise<AdminMetrics> {
  const admin = createAdminClient();
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString();
  const fourteenDaysAgo = new Date(now - 14 * 86_400_000).toISOString();

  const [
    { count: pendingApplications },
    memberships,
    runs,
    signups,
    toolNames,
  ] = await Promise.all([
    admin.from("applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("memberships").select("status, expires_at"),
    admin.from("tool_runs").select("status, tool_id, created_at").gte("created_at", sevenDaysAgo),
    admin.from("profiles").select("created_at").gte("created_at", fourteenDaysAgo),
    admin.from("tools").select("id, name"),
  ]);

  // Active members: active/trialing and not expired.
  const activeMembers = (memberships.data ?? []).filter(
    (m) =>
      (m.status === "active" || m.status === "trialing") &&
      (m.expires_at === null || new Date(m.expires_at) > new Date()),
  ).length;

  const runRows = runs.data ?? [];
  const runs7d = runRows.length;
  const terminal = runRows.filter((r) => ["success", "error", "timeout"].includes(r.status));
  const successRate =
    terminal.length > 0
      ? Math.round((terminal.filter((r) => r.status === "success").length / terminal.length) * 100)
      : null;

  // Top tools by runs in the window.
  const nameById = new Map((toolNames.data ?? []).map((t) => [t.id, t.name]));
  const byTool = new Map<string, number>();
  for (const r of runRows) byTool.set(r.tool_id, (byTool.get(r.tool_id) ?? 0) + 1);
  const topTools = [...byTool.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ name: nameById.get(id) ?? "—", runs: count }));

  // Signup trend: 14 daily buckets (UTC), oldest → newest.
  const buckets = new Array(14).fill(0);
  const startDay = Math.floor(new Date(fourteenDaysAgo).getTime() / 86_400_000);
  for (const s of signups.data ?? []) {
    const day = Math.floor(new Date(s.created_at).getTime() / 86_400_000);
    const idx = day - startDay;
    if (idx >= 0 && idx < 14) buckets[idx] += 1;
  }

  return {
    pendingApplications: pendingApplications ?? 0,
    activeMembers,
    runs7d,
    successRate,
    topTools,
    signupTrend: buckets,
  };
}
