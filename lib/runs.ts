import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type ToolRun = Database["public"]["Tables"]["tool_runs"]["Row"];

export type RunWithTool = ToolRun & {
  tools: { slug: string; name: string; icon: string | null; output_schema: unknown } | null;
};

/** One run of the current user's, with its tool. RLS scopes it to them. */
export async function getMyRun(id: string): Promise<RunWithTool | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tool_runs")
    .select("*, tools(slug, name, icon, output_schema)")
    .eq("id", id)
    .maybeSingle();
  return (data as RunWithTool) ?? null;
}

/** Run history for the current user, newest first. */
export async function getMyRuns(): Promise<RunWithTool[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tool_runs")
    .select("*, tools(slug, name, icon, output_schema)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data as RunWithTool[]) ?? [];
}
