"use server";

import { requireUser } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

/**
 * "Notify me" on a coming-soon tool — the one-click demand-capture instrument
 * (§10, DESIGN §9). Engagement, not access: tool_interest is never read by
 * can_access_tool. Toggles the current user's interest; returns the new state.
 */
export async function toggleToolInterest(
  toolId: string,
): Promise<{ error: string } | { ok: true; interested: boolean }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("tool_interest")
    .select("tool_id")
    .eq("tool_id", toolId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("tool_interest")
      .delete()
      .eq("tool_id", toolId)
      .eq("user_id", user.id);
    return { ok: true, interested: false };
  }

  const { error } = await supabase
    .from("tool_interest")
    .insert({ tool_id: toolId, user_id: user.id });
  if (error) return { error: "Couldn't save that. Try again." };
  return { ok: true, interested: true };
}
