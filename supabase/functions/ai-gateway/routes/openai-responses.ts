// OpenAI Responses API, for the Raw Footage desktop app. Background mode.
//
// WHY BACKGROUND MODE IS NOT OPTIONAL HERE. The desktop app's own timeout for a
// script is `60 + words * 0.3` seconds, clamped to [180, 900] — its source says
// a flat three minutes was "far too short for a script". A 900-second call fits
// inside no synchronous proxy we can host: Vercel Hobby caps at 60s and a
// Supabase Edge Function at 400s on Pro.
//
// `background: true` dissolves the problem rather than working around it.
// OpenAI accepts the request, returns an id immediately, and does the work on
// its own time; the client polls. Every call through this gateway is then
// milliseconds long and the wall clock stops being a constraint at all. It also
// means a closed laptop no longer kills a running job.
//
// The cost of that is a hold with a long life and a settlement that happens on
// a LATER request than the one that opened it — which is what most of this file
// is about.

import { json } from "../../_shared/client-gate.ts";
import type { RouteContext } from "../index.ts";
import {
  affordableOutputTokens,
  estimateResponsesInputTokens,
  resolveOutputCeiling,
} from "../estimate.ts";
import { openHold, releaseHold, settleHold } from "../hold.ts";
import { priceFor, quoteCredits, tokenCostUsd } from "../pricing.ts";
import { logProviderFailure, safeProviderError } from "../sanitize.ts";
import { openAiUsage } from "../usage.ts";
import { openAiBase } from "../upstream.ts";

const UPSTREAM_PATH = "/v1/responses";

/**
 * Thirty minutes — twice the desktop app's own 900-second ceiling.
 *
 * The hold has to outlive the work plus however long the client takes to come
 * back and poll. Too short and a legitimate call has its reservation reclaimed
 * mid-flight, then settles against a hold that no longer exists. Too long and a
 * genuinely abandoned call sits on the member's balance for the duration.
 */
const HOLD_TTL_SECONDS = 1800;

/** Prefix on credit_holds.note, so a poll can find the hold that owns an id. */
const REF_PREFIX = "openai:";

export async function handleOpenAiResponsesCreate(
  ctx: RouteContext,
): Promise<Response> {
  const { g, settings, providerKey } = ctx;

  let body: Record<string, unknown>;
  try {
    body = await ctx.req.json();
  } catch {
    return json({ error: "bad request", code: "bad_body" }, 400);
  }

  const model = typeof body.model === "string" ? body.model : "";
  const price = await priceFor(g.supabase, "openai", model);
  if (!price) {
    return json(
      {
        error: `The model ${model || "(none)"} isn't available on credit.`,
        code: "model_not_allowed",
      },
      400,
    );
  }

  const hardCeiling = affordableOutputTokens(
    settings.perCallMaxCredits,
    settings.creditUsdValue,
    settings.marginMultiplier,
    price.output_usd_per_unit,
  );
  const ceiling = resolveOutputCeiling(
    body.max_output_tokens as number | undefined,
    hardCeiling,
  );
  if (!ceiling.ok) {
    return json(
      {
        error:
          `That request allows up to ${ceiling.requested} output tokens, above ` +
          `the per-call ceiling of ${ceiling.ceiling}. Lower max_output_tokens, ` +
          `or ask for the per-call credit limit to be raised.`,
        code: "over_call_cap",
      },
      402,
    );
  }
  body.max_output_tokens = ceiling.maxOutputTokens;

  // FORCED. A synchronous Responses call would hold this function open for the
  // length of the generation and die at the wall clock — see the header.
  body.background = true;
  // Streaming and background are different answers to the same problem, and
  // asking for both gets neither. The desktop app does not stream anyway; its
  // own source says "the whole response arrives at once".
  delete body.stream;

  const inputTokens = estimateResponsesInputTokens(body);
  const worstCaseUsd = tokenCostUsd(price, inputTokens, ceiling.maxOutputTokens);

  // The hold opens BEFORE the request. A hold opened afterwards would leave a
  // window in which OpenAI is already working on a call nothing has reserved
  // credit for.
  const hold = await openHold(g.supabase, {
    userId: g.userId,
    toolId: g.toolId,
    credits: await quoteCredits(g.supabase, worstCaseUsd),
    ttlSeconds: HOLD_TTL_SECONDS,
  });
  if ("response" in hold) return hold.response;

  let upstream: Response;
  try {
    upstream = await fetch(openAiBase() + UPSTREAM_PATH, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    await releaseHold(g.supabase, hold.id, "provider unreachable");
    return json(
      { error: "Couldn't reach OpenAI. Try again.", code: "provider_unreachable" },
      502,
    );
  }

  if (!upstream.ok) {
    await releaseHold(g.supabase, hold.id, `openai ${upstream.status}`);
    logProviderFailure("openai", "responses", upstream.status);
    const safe = await safeProviderError(upstream, "openai");
    return json(safe.body, safe.status);
  }

  const created = await upstream.json();
  const responseId = typeof created?.id === "string" ? created.id : null;

  if (!responseId) {
    // Accepted but unidentifiable: we can never settle this, so we must not
    // hold against it either.
    await releaseHold(g.supabase, hold.id, "no response id");
    console.error("ai-gateway: responses create returned no id");
    return json({ error: "something went wrong", code: "gateway_error" }, 500);
  }

  // Tag the hold with the upstream id. THIS IS WHY THE POLL DOES NOT TRUST THE
  // CLIENT: credit_hold_settle takes a hold id and bills that hold's owner
  // without checking who is asking, so a client free to name a hold could
  // charge somebody else's account. Storing the mapping here means the poll
  // never accepts a hold id at all — it accepts an OpenAI response id and finds
  // the hold itself, scoped to the caller.
  await g.supabase
    .from("credit_holds")
    .update({ note: REF_PREFIX + responseId })
    .eq("id", hold.id);

  // Verbatim, so the desktop app sees exactly what OpenAI would have sent.
  return new Response(JSON.stringify(created), {
    status: upstream.status,
    headers: { ...headers(), "content-type": "application/json" },
  });
}

export async function handleOpenAiResponsesPoll(
  ctx: RouteContext,
): Promise<Response> {
  const { g, providerKey } = ctx;

  const responseId = ctx.url.pathname.split("/").pop() ?? "";
  if (!responseId) return json({ error: "bad request", code: "bad_body" }, 400);

  let upstream: Response;
  try {
    upstream = await fetch(`${openAiBase()}${UPSTREAM_PATH}/${encodeURIComponent(responseId)}`, {
      headers: { Authorization: `Bearer ${providerKey}` },
    });
  } catch {
    return json(
      { error: "Couldn't reach OpenAI. Try again.", code: "provider_unreachable" },
      502,
    );
  }

  if (!upstream.ok) {
    logProviderFailure("openai", "responses/poll", upstream.status);
    const safe = await safeProviderError(upstream, "openai");
    return json(safe.body, safe.status);
  }

  const result = await upstream.json();
  const status = typeof result?.status === "string" ? result.status : "";

  // Still working. The hold stays open and the client comes back.
  if (status === "queued" || status === "in_progress") {
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...headers(), "content-type": "application/json" },
    });
  }

  // Terminal. Find OUR hold for this id — scoped to the caller, so one member
  // can never settle or release another's.
  const { data: holds } = await g.supabase
    .from("credit_holds")
    .select("id, tool_slug")
    .eq("user_id", g.userId)
    .eq("status", "open")
    .eq("note", REF_PREFIX + responseId)
    .limit(1);

  const holdId = holds?.[0]?.id as string | undefined;

  if (!holdId) {
    // Already settled by an earlier poll, or reclaimed by the sweeper after the
    // TTL. Either way the answer to the client is the same — here is your
    // response — and there is nothing left to bill. A second poll of a finished
    // call must not charge twice.
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...headers(), "content-type": "application/json" },
    });
  }

  if (status === "completed") {
    const usage = openAiUsage(result);
    const model =
      typeof result?.model === "string" ? result.model : "unknown";
    const price = await priceFor(g.supabase, "openai", model);

    if (usage && price) {
      await settleHold(g.supabase, {
        holdId,
        provider: "openai",
        model,
        costUsd: tokenCostUsd(price, usage.inputTokens, usage.outputTokens),
      });
    } else {
      // Completed but unmeterable. Releasing would give away a call OpenAI has
      // certainly billed us for, so this is logged loudly instead and the hold
      // is left for the sweeper — the same treatment as an orphan, for the same
      // reason: we would rather notice than quietly absorb it.
      console.error(
        `ai-gateway: ORPHAN completed response ${responseId} — usage=${!!usage} ` +
          `price=${!!price} model=${model}. Hold ${holdId} left for the sweeper; ` +
          `OpenAI has billed us and the member has not been charged.`,
      );
    }
  } else {
    // failed / cancelled / incomplete: nothing usable was produced.
    await releaseHold(g.supabase, holdId, `openai ${status}`);
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...headers(), "content-type": "application/json" },
  });
}

function headers(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "X-BLAI-Credits-Charged",
  };
}
