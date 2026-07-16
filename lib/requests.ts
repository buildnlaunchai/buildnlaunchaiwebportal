import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";

export type FeatureRequest = Database["public"]["Tables"]["feature_requests"]["Row"];

export type RequestWithTool = FeatureRequest & {
  tools: { slug: string; name: string } | null;
};

/** The member board: all requests + the set this user has voted for. */
export async function getFeatureRequests(): Promise<{
  requests: RequestWithTool[];
  myVotes: Set<string>;
}> {
  const supabase = await createClient();
  const [{ data: requests }, { data: votes }] = await Promise.all([
    supabase
      .from("feature_requests")
      .select("*, tools:shipped_tool_id(slug, name)")
      .order("vote_count", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("feature_request_votes").select("request_id"),
  ]);

  return {
    requests: (requests as RequestWithTool[]) ?? [],
    myVotes: new Set((votes ?? []).map((v) => v.request_id)),
  };
}

/** The admin queue: all requests, most-voted first, with requester + tool. */
export async function getRequestsForAdmin(): Promise<
  (RequestWithTool & { requesterEmail: string | null })[]
> {
  const admin = createAdminClient();
  const { data: requests } = await admin
    .from("feature_requests")
    .select("*, tools:shipped_tool_id(slug, name)")
    .order("vote_count", { ascending: false })
    .order("created_at", { ascending: false });

  if (!requests) return [];

  const { data: profiles } = await admin.from("profiles").select("id, email");
  const emailById = new Map((profiles ?? []).map((p) => [p.id, p.email]));

  return (requests as RequestWithTool[]).map((r) => ({
    ...r,
    requesterEmail: emailById.get(r.user_id) ?? null,
  }));
}
