// Opening, settling and releasing a credit hold.
//
// Every route needs all three, and they must behave identically in all three —
// a route that translated 'too_many_concurrent' into a 402 while another said
// 429 would make the client's error handling a guessing game. So the wording and
// the status codes live here once.
//
// None of these functions decide anything. The rules — the caps, the kill
// switch, the concurrency limit, the margin — are all in Postgres, inside the
// balance row's lock. This file is the shape-mapping around them.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { json } from "../_shared/client-gate.ts";
import { quoteCredits } from "./pricing.ts";

export type HoldResult = { id: string } | { response: Response };

/**
 * How each refusal from credit_hold_open reaches the client.
 *
 * The status codes carry meaning the client acts on: 402 means "this is about
 * money, tell the member"; 429 means "this is about pacing, back off and retry";
 * 503 means "this is about us, not them". Getting those wrong would make a
 * retry loop hammer a wall it can never pass.
 */
const REFUSALS: Record<string, { message: string; status: number }> = {
  credit_mode_disabled: {
    message: "Credit mode is turned off right now.",
    status: 503,
  },
  insufficient: {
    message: "Not enough credit for this call.",
    status: 402,
  },
  too_many_concurrent: {
    message: "Too many calls in flight at once. Wait for one to finish.",
    status: 429,
  },
  over_call_cap: {
    message: "That call is larger than the per-call credit limit.",
    status: 402,
  },
  over_daily_cap: {
    message: "That would pass today's credit limit.",
    status: 429,
  },
  invalid: { message: "Bad request.", status: 400 },
};

export async function openHold(
  supabase: SupabaseClient,
  args: {
    userId: string;
    toolId: string;
    credits: number;
    ttlSeconds: number;
    /** Stored on the hold so a later poll can find it. See openai-responses.ts. */
    note?: string;
  },
): Promise<HoldResult> {
  const { data, error } = await supabase.rpc("credit_hold_open", {
    p_user_id: args.userId,
    p_tool_id: args.toolId,
    // Never zero: credit_hold_open rejects a non-positive hold, and a call
    // estimated at nothing still has to reserve something to be settled against.
    p_max_credits: Math.max(1, args.credits),
    p_ttl_seconds: args.ttlSeconds,
  });
  if (error) throw new Error(`credit_hold_open failed: ${error.message}`);

  const row = Array.isArray(data) ? data[0] : data;
  const status = (row?.status as string) ?? "invalid";

  if (status !== "ok") {
    const r = REFUSALS[status] ?? {
      message: "Couldn't start this call.",
      status: 400,
    };
    return {
      response: json(
        {
          error: r.message,
          code: status,
          // Only meaningful on the money refusals, and harmless elsewhere: it is
          // the member's own balance, which they can already read.
          available: row?.available ?? 0,
        },
        r.status,
      ),
    };
  }

  const id = row.hold_id as string;

  if (args.note) {
    // Written after the fact rather than passed to the RPC, because the hold's
    // id is what we want to key on and it does not exist until the row does.
    // Best-effort: a failure here costs a poll its settlement, not the call.
    const { error: noteErr } = await supabase
      .from("credit_holds")
      .update({ note: args.note })
      .eq("id", id);
    if (noteErr) {
      console.error("ai-gateway: could not tag hold:", noteErr.message);
    }
  }

  return { id };
}

/**
 * Settle a hold at the real cost, and return what was charged in credits.
 *
 * The credits number is recomputed through credit_quote rather than returned by
 * the settle RPC, which answers 'ok' | 'capped'. One extra cheap round trip,
 * and it keeps the margin arithmetic in exactly one place.
 *
 * 'capped' is logged, never swallowed: it means the true cost exceeded the hold,
 * we charged the hold and ate the difference, and a run of them means the
 * estimator is wrong.
 */
export async function settleHold(
  supabase: SupabaseClient,
  args: {
    holdId: string;
    provider: string;
    model: string;
    costUsd: number;
  },
): Promise<number> {
  const { data, error } = await supabase.rpc("credit_hold_settle", {
    p_hold_id: args.holdId,
    p_provider: args.provider,
    p_model: args.model,
    p_provider_cost_usd: args.costUsd,
  });
  if (error) throw new Error(`credit_hold_settle failed: ${error.message}`);

  if (data === "capped") {
    console.warn(
      `ai-gateway: hold ${args.holdId} CAPPED — real cost exceeded the estimate ` +
        `for ${args.provider}/${args.model}. The difference is ours.`,
    );
  }

  return await quoteCredits(supabase, args.costUsd);
}

/** Hand the reservation back. Nothing moved, so there is no ledger row. */
export async function releaseHold(
  supabase: SupabaseClient,
  holdId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc("credit_hold_release", {
    p_hold_id: holdId,
    p_reason: reason,
  });
  // Never throw: a release failing must not turn a handled provider error into
  // an unhandled gateway error. The sweeper reclaims it within the minute.
  if (error) console.error("ai-gateway: release failed:", error.message);
}
