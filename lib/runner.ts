import "server-only";

/**
 * The runner's server side. startRun does every check, inserts the run, and
 * hands off to the run-tool Edge Function — returning in well under a second. It
 * never waits for the tool to finish (CLAUDE.md §9.3).
 *
 * This module is imported by the startRun Server Action in actions/runs.ts.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { compileInputSchema } from "@/lib/schema";
import { parseInputSchema } from "@/lib/tool-schema";
import type { AuthedUser } from "@/lib/access";
import type { Database } from "@/lib/database.types";

type Json = Database["public"]["Tables"]["tool_runs"]["Insert"]["input"];

export type StartRunResult = { runId: string } | { error: string };

function startOfUtcDay(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

export async function startRunForUser(
  user: AuthedUser,
  slug: string,
  rawInput: unknown,
): Promise<StartRunResult> {
  const supabase = await createClient(); // the member's session — RLS + RPCs

  // Load the tool (server can read all its own columns; secrets stay elsewhere).
  const { data: tool } = await supabase
    .from("tools")
    .select("id, slug, status, runtime, required_providers, input_schema, timeout_seconds, rate_limit_per_day")
    .eq("slug", slug)
    .maybeSingle();
  if (!tool) return { error: "That tool doesn't exist." };

  // a. This action runs ONLY edge_function tools. iframe/internal/external_link
  //    tools are opened by the runner page directly (the iframe branch mints a
  //    token; there is no "run" to start), and there is no handler for them in
  //    run-tool — invoking it would 400 and leave an orphan 'error' run row.
  //    Reject here, before any row is written, so a stale client or a split-brain
  //    deploy (DB says iframe, code says form) fails cleanly instead of minting a
  //    dead run. This is exactly the failure that shipped image_animator as a
  //    Run form before the iframe branch was deployed.
  if (tool.runtime !== "edge_function") {
    return { error: "This tool isn't run from here." };
  }

  // b. Access — re-checked server-side, always (§13).
  const { data: canAccess } = await supabase.rpc("can_access_tool", {
    p_tool_id: tool.id,
  });
  if (!canAccess) return { error: "You don't have access to this tool." };

  // c. Must be published. Maintenance shows a notice and stops.
  if (tool.status !== "published") {
    return {
      error:
        tool.status === "maintenance"
          ? "This tool is being rebuilt right now. It'll be back — you'll get a notification."
          : "This tool isn't available.",
    };
  }

  // d. Keys — name exactly which provider is missing.
  const { data: hasKeys } = await supabase.rpc("has_required_keys", {
    p_tool_id: tool.id,
  });
  if (!hasKeys) {
    const providers = (tool.required_providers ?? []).join(", ");
    return {
      error: `Connect your ${providers} key in the vault to run this.`,
    };
  }

  // e. Daily rate limit — the stricter of the tool's cap and the plan's cap.
  const { count: todayCount } = await supabase
    .from("tool_runs")
    .select("id", { count: "exact", head: true })
    .eq("tool_id", tool.id)
    .gte("created_at", startOfUtcDay());

  const { data: membership } = await supabase
    .from("memberships")
    .select("plan_id")
    .maybeSingle();
  let planCap: number | null = null;
  if (membership?.plan_id) {
    const { data: plan } = await supabase
      .from("plans")
      .select("max_runs_per_day")
      .eq("id", membership.plan_id)
      .maybeSingle();
    planCap = plan?.max_runs_per_day ?? null;
  }
  const caps = [tool.rate_limit_per_day, planCap].filter(
    (c): c is number => typeof c === "number",
  );
  const limit = caps.length > 0 ? Math.min(...caps) : null;
  if (limit !== null && (todayCount ?? 0) >= limit) {
    return { error: `You've hit today's limit of ${limit} runs for this tool.` };
  }

  // f. Validate input with the SAME schema the form used.
  const compiled = compileInputSchema(parseInputSchema(tool.input_schema));
  const parsed = compiled.safeParse(rawInput);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your inputs." };
  }

  // g. Insert the run. NO secrets in input. status='running', expires_at set so
  //    the reaper can fail it if the function dies.
  const admin = createAdminClient(); // the runner owns writes to tool_runs
  const expiresAt = new Date(Date.now() + tool.timeout_seconds * 1000).toISOString();
  const { data: run, error: insertErr } = await admin
    .from("tool_runs")
    .insert({
      user_id: user.id,
      tool_id: tool.id,
      status: "running",
      input: parsed.data as Json,
      expires_at: expiresAt,
      providers_used: tool.required_providers,
    })
    .select("id")
    .single();
  if (insertErr || !run) return { error: "Couldn't start the run. Try again." };

  // h. Hand off to run-tool. We wait only for the 202 — not for the work.
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/run-tool`,
      {
        method: "POST",
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          "X-Runner-Secret": process.env.RUNNER_SECRET!,
          "content-type": "application/json",
        },
        body: JSON.stringify({ run_id: run.id }),
        signal: AbortSignal.timeout(10_000), // waiting for "accepted", not work
      },
    );
    if (res.status !== 202) {
      await admin
        .from("tool_runs")
        .update({
          status: "error",
          error_message: "The runner didn't accept this run. Try again.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      return { error: "Couldn't start the run. Try again." };
    }
  } catch {
    await admin
      .from("tool_runs")
      .update({
        status: "error",
        error_message: "The runner didn't respond. Try again.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return { error: "Couldn't reach the runner. Try again." };
  }

  return { runId: run.id };
}
