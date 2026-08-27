// OpenAI chat completions, for the UpworkPilot extension. Streaming.
//
// The hard part is not proxying — it is that a streamed call's cost arrives at
// the END, in a final chunk, after most of the response has already reached the
// member. So the stream is TEED: bytes go through untouched while a transform
// watches for the usage chunk, and settlement happens as the stream closes.

import { json } from "../../_shared/client-gate.ts";
import type { RouteContext } from "../index.ts";
import {
  affordableOutputTokens,
  estimateChatInputTokens,
  resolveOutputCeiling,
} from "../estimate.ts";
import { openHold, releaseHold, settleHold } from "../hold.ts";
import { type PriceRow, priceFor, quoteCredits, tokenCostUsd } from "../pricing.ts";
import { logProviderFailure, safeProviderError } from "../sanitize.ts";
import { openAiBase } from "../upstream.ts";
import {
  estimatedUsageFromStream,
  openAiUsage,
  usageFromSseChunk,
  type TokenUsage,
} from "../usage.ts";

const UPSTREAM_PATH = "/v1/chat/completions";

/** A streamed call is short-lived; 5 minutes is generous for a cover letter. */
const HOLD_TTL_SECONDS = 300;

export async function handleOpenAiChat(ctx: RouteContext): Promise<Response> {
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
    // The allow-list refusing. It names the model so a client can tell this
    // apart from "the model is having a bad day".
    return json(
      {
        error: `The model ${model || "(none)"} isn't available on credit.`,
        code: "model_not_allowed",
      },
      400,
    );
  }

  // ---- Force the output ceiling ------------------------------------------
  // Without this there is no worst case, and without a worst case there is
  // nothing to reserve against a balance. Every line below depends on it.
  const hardCeiling = affordableOutputTokens(
    settings.perCallMaxCredits,
    settings.creditUsdValue,
    settings.marginMultiplier,
    price.output_usd_per_unit,
  );
  const ceiling = resolveOutputCeiling(
    body.max_tokens as number | undefined,
    hardCeiling,
  );
  if (!ceiling.ok) {
    return json(
      {
        error:
          `That request allows up to ${ceiling.requested} output tokens, above ` +
          `the per-call ceiling of ${ceiling.ceiling}. Lower max_tokens, or ask ` +
          `for the per-call credit limit to be raised.`,
        code: "over_call_cap",
      },
      402,
    );
  }
  body.max_tokens = ceiling.maxOutputTokens;

  const streaming = body.stream === true;
  if (streaming) {
    // FORCED, overwriting whatever the client sent. Without include_usage
    // OpenAI never sends a usage chunk at all — and a call we cannot meter is a
    // call the member gets free while we pay for it.
    body.stream_options = { include_usage: true };
  }

  const inputTokens = estimateChatInputTokens(body);
  const worstCaseUsd = tokenCostUsd(price, inputTokens, ceiling.maxOutputTokens);

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
    // Nothing was generated, so nothing is owed.
    await releaseHold(g.supabase, hold.id, `openai ${upstream.status}`);
    logProviderFailure("openai", "chat/completions", upstream.status);
    const safe = await safeProviderError(upstream, "openai");
    return json(safe.body, safe.status);
  }

  if (!streaming) {
    const parsed = await upstream.json();
    const usage = openAiUsage(parsed);
    const costUsd = usage
      ? tokenCostUsd(price, usage.inputTokens, usage.outputTokens)
      : worstCaseUsd; // no usage reported: charge the reservation, never zero
    const charged = await settleHold(g.supabase, {
      holdId: hold.id,
      provider: "openai",
      model,
      costUsd,
    });

    // A non-streaming response can carry the cost in a header, because nothing
    // has been sent yet when we learn it. The streaming path cannot, which is
    // why it uses an SSE comment instead.
    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: {
        ...headers(),
        "content-type": "application/json",
        "X-BLAI-Credits-Charged": String(charged),
      },
    });
  }

  return teeAndSettle(ctx, upstream, {
    holdId: hold.id,
    model,
    price,
    inputTokens,
  });
}

/**
 * Forward every byte, watch for the usage chunk, settle at the end.
 *
 * NOTHING IS BUFFERED. Accumulating the response to read its tail is the
 * obvious implementation and the wrong one — a long completion against a 256MB
 * isolate. The transform passes each chunk straight through and keeps only a
 * character count and, once it appears, the usage.
 */
function teeAndSettle(
  ctx: RouteContext,
  upstream: Response,
  meta: {
    holdId: string;
    model: string;
    price: PriceRow;
    inputTokens: number;
  },
): Response {
  const { g } = ctx;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  let usage: TokenUsage | null = null;
  let forwardedChars = 0;
  let sawContent = false;

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      // Forward FIRST. Metering must never delay the member's bytes, and it
      // must never be able to break them either.
      controller.enqueue(chunk);

      const text = decoder.decode(chunk, { stream: true });
      forwardedChars += text.length;
      if (!sawContent && text.includes('"content"')) sawContent = true;
      if (!usage) usage = usageFromSseChunk(text);
    },

    async flush(controller) {
      let charged = 0;

      try {
        if (usage) {
          charged = await settleHold(g.supabase, {
            holdId: meta.holdId,
            provider: "openai",
            model: meta.model,
            costUsd: tokenCostUsd(meta.price, usage.inputTokens, usage.outputTokens),
          });
        } else if (sawContent) {
          // The stream ended before its usage chunk — a disconnect, or a
          // cancel. The member received text, so they are billed for it,
          // estimated from what actually went through. Charging nothing would
          // make an early disconnect a way to run for free on every call.
          const est = estimatedUsageFromStream(meta.inputTokens, forwardedChars);
          charged = await settleHold(g.supabase, {
            holdId: meta.holdId,
            provider: "openai",
            model: meta.model,
            costUsd: tokenCostUsd(meta.price, est.inputTokens, est.outputTokens),
          });
        } else {
          // Not one byte of content reached the member. Nothing to bill.
          await releaseHold(g.supabase, meta.holdId, "stream produced no content");
        }
      } catch (err) {
        // A settle that throws must not tear down a response the member has
        // already received in full. The hold's TTL and the sweeper are the
        // backstop.
        console.error("ai-gateway: settle failed:", (err as Error).message);
      }

      if (charged > 0) {
        // The cost, as an SSE COMMENT. A line starting with ':' is a comment in
        // the SSE spec, so every conforming parser drops it — and the
        // extension's own `data:`-prefix split never sees it. The client can
        // read its cost without a second round trip, and a client that has not
        // learned to look is completely unaffected.
        controller.enqueue(encoder.encode(`: blai-credits=${charged}\n\n`));
      }
    },
  });

  return new Response(upstream.body!.pipeThrough(transform), {
    status: 200,
    headers: {
      ...headers(),
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}

function headers(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "X-BLAI-Credits-Charged",
  };
}
