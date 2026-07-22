import "server-only";

import { createPublicClient } from "@/lib/supabase/public";
import type { Database } from "@/lib/database.types";

export type ApiProvider = Database["public"]["Enums"]["api_provider"];
export type ToolStatus = Database["public"]["Enums"]["tool_status"];
export type ToolAccessType = Database["public"]["Enums"]["tool_access_type"];
export type ToolRuntime = Database["public"]["Enums"]["tool_runtime"];

/**
 * The columns safe to send to a client for a catalog card. tool_secrets is a
 * separate table, so even `select *` on `tools` is safe now — but we still name
 * columns, because a lean, intentional payload is its own kind of correctness,
 * and input/output_schema (large) have no business on a card.
 */
const CARD_COLUMNS =
  "id,slug,name,tagline,category,icon,cover_image_url,status,access_type,runtime,required_providers,version,launched_at,is_featured" as const;

export type ToolCardData = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: string | null;
  icon: string | null;
  cover_image_url: string | null;
  status: ToolStatus;
  access_type: ToolAccessType;
  runtime: ToolRuntime;
  required_providers: ApiProvider[];
  version: string | null;
  launched_at: string | null;
  is_featured: boolean;
};

/** Aggregate stats for the catalog featured hero (from tool_public_stats). */
export type ToolStats = { runCount: number; avgMs: number | null };

/** The full public tool page — includes the schemas for the form preview. */
export type ToolDetailData = ToolCardData & {
  description: string | null;
  video_url: string | null;
  input_schema: unknown;
  output_schema: unknown;
};

/**
 * The public catalog: every tool a visitor may see, in display order. RLS
 * already restricts this to published / coming_soon / maintenance rows, so
 * there is no status filter here — the database is the boundary, not this query.
 */
export async function getPublicTools(): Promise<ToolCardData[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("tools")
    .select(CARD_COLUMNS)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/**
 * The redesigned catalog: a featured hero + the rest of the grid. `featured` is
 * the first `is_featured` PUBLISHED tool, falling back to the first published
 * tool so the hero is never empty; `tools` is every other visible tool (for the
 * filterable grid). RLS already restricts rows to published/coming_soon/
 * maintenance, so there is no status filter beyond picking the featured one.
 */
export async function getPublicCatalog(): Promise<{
  featured: ToolCardData | null;
  featuredStats: ToolStats | null;
  tools: ToolCardData[];
  /** Epoch ms cutoff for the "New" filter (launched within 14 days). Computed
      server-side so the client filter stays a pure comparison. */
  newCutoff: number;
}> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("tools")
    .select(CARD_COLUMNS)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  const all = data ?? [];

  const published = all.filter((t) => t.status === "published");
  const featured = published.find((t) => t.is_featured) ?? published[0] ?? null;
  const tools = featured ? all.filter((t) => t.id !== featured.id) : all;

  let featuredStats: ToolStats | null = null;
  if (featured) {
    const { data: stats } = await supabase.rpc("tool_public_stats", {
      p_tool_id: featured.id,
    });
    const row = stats?.[0];
    featuredStats = {
      runCount: Number(row?.run_count ?? 0),
      avgMs: row?.avg_ms != null ? Number(row.avg_ms) : null,
    };
  }

  const newCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  return { featured, featuredStats, tools, newCutoff };
}

/** One tool's public page. Returns null if the slug isn't a visible tool. */
export async function getToolBySlug(slug: string): Promise<ToolDetailData | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("tools")
    .select(
      `${CARD_COLUMNS},description,video_url,input_schema,output_schema`,
    )
    .eq("slug", slug)
    .maybeSingle();

  return data ?? null;
}

/**
 * The Shipping Log (DESIGN.md §10) — launched tools, newest first. It renders
 * straight from this table, so it grows every time a tool ships. That is the
 * point: a marketing centrepiece that gets stronger as a byproduct of working.
 */
export async function getShippingLog(): Promise<ToolCardData[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("tools")
    .select(CARD_COLUMNS)
    .not("launched_at", "is", null)
    .order("launched_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
