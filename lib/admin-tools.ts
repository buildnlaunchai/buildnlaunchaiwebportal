import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ToolDraft } from "@/lib/validation/tool";
import type { Database } from "@/lib/database.types";

type ToolRow = Database["public"]["Tables"]["tools"]["Row"];

/**
 * The editor reads a tool's FULL config — including tool_secrets — with the
 * service role (tool_secrets is deny-all to every client role, §6.6b). The page
 * calls requireAdmin() before this; that is the authorization.
 */
export async function getToolForEditor(id: string): Promise<ToolDraft | null> {
  const admin = createAdminClient();
  const { data: tool } = await admin.from("tools").select("*").eq("id", id).maybeSingle();
  if (!tool) return null;
  const { data: secret } = await admin
    .from("tool_secrets")
    .select("function_name, embed_url, external_url")
    .eq("tool_id", id)
    .maybeSingle();

  return toDraft(tool, secret);
}

function toDraft(
  t: ToolRow,
  s: { function_name: string | null; embed_url: string | null; external_url: string | null } | null,
): ToolDraft {
  return {
    slug: t.slug,
    name: t.name,
    tagline: t.tagline,
    description: t.description ?? "",
    category: t.category ?? "",
    icon: t.icon ?? "",
    cover_image_url: t.cover_image_url ?? "",
    video_url: t.video_url ?? "",
    status: t.status,
    access_type: t.access_type,
    runtime: t.runtime,
    is_featured: t.is_featured,
    timeout_seconds: t.timeout_seconds,
    rate_limit_per_day: t.rate_limit_per_day,
    required_providers: t.required_providers,
    input_schema: (t.input_schema as ToolDraft["input_schema"]) ?? { fields: [] },
    output_schema:
      (t.output_schema as ToolDraft["output_schema"]) ?? { type: "blocks", blocks: [] },
    function_name: s?.function_name ?? "",
    embed_url: s?.embed_url ?? "",
    external_url: s?.external_url ?? "",
  };
}

/** A fresh draft for /admin/tools/new. */
export function emptyToolDraft(): ToolDraft {
  return {
    slug: "",
    name: "",
    tagline: "",
    description: "",
    category: "",
    icon: "",
    cover_image_url: "",
    video_url: "",
    status: "draft",
    access_type: "members",
    runtime: "edge_function",
    is_featured: false,
    timeout_seconds: 120,
    rate_limit_per_day: null,
    required_providers: [],
    input_schema: { fields: [] },
    output_schema: { type: "blocks", blocks: [] },
    function_name: "",
    embed_url: "",
    external_url: "",
  };
}

export type AdminToolListItem = Pick<
  ToolRow,
  "id" | "slug" | "name" | "status" | "access_type" | "runtime" | "sort_order" | "icon" | "required_providers"
> & { run_count: number };

/** The tool list — admin sees ALL tools, drafts included. */
export async function listToolsForAdmin(): Promise<AdminToolListItem[]> {
  const admin = createAdminClient();
  const { data: tools } = await admin
    .from("tools")
    .select("id, slug, name, status, access_type, runtime, sort_order, icon, required_providers")
    .order("sort_order", { ascending: true });
  if (!tools) return [];

  // Run counts, joined in memory.
  const { data: runs } = await admin.from("tool_runs").select("tool_id");
  const counts = new Map<string, number>();
  for (const r of runs ?? []) counts.set(r.tool_id, (counts.get(r.tool_id) ?? 0) + 1);

  return tools.map((t) => ({ ...t, run_count: counts.get(t.id) ?? 0 }));
}
