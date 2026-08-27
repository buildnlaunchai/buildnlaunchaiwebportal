// ElevenLabs text-to-speech, for the Raw Footage desktop app.
//
// The easiest of the three routes, for a reason worth naming: THE COST ARRIVES
// BEFORE THE BODY. ElevenLabs puts what it billed in a response header, which
// lands ahead of the audio, so this route can settle first and then answer —
// and put the real cost in a header of its own, which the streaming route
// cannot.
//
// It bills in ELEVENLABS CREDITS, not characters. The header is `character-cost`
// and a flash model charges half a credit per character, so a five-character
// line costs two. The hold is therefore an estimate after all (one credit per
// character, the worst case across models) and the header is the bill. usage.ts
// carries the full story, including how long the old per-character reading went
// unnoticed.
//
// The desktop app calls this once per line (elevenlabs.rs synthesises one line
// at a time), so each call is small — a few hundred KB of 24kHz WAV. That is
// what keeps a 256MB isolate comfortable, and it is why the body is still
// streamed rather than buffered: if that ever changes to whole-narration
// synthesis, this route should not be the thing that breaks.

import { json } from "../../_shared/client-gate.ts";
import type { RouteContext } from "../index.ts";
import { openHold, releaseHold, settleHold } from "../hold.ts";
import { creditCostUsd, priceFor, quoteCredits } from "../pricing.ts";
import { logProviderFailure, safeProviderError } from "../sanitize.ts";
import { elevenLabsCredits } from "../usage.ts";
import { elevenLabsBase } from "../upstream.ts";

const UPSTREAM_PATH = "/v1/text-to-speech";

/** One line of speech is seconds of work. Two minutes is already generous. */
const HOLD_TTL_SECONDS = 120;

/** What elevenlabs.rs sends when the caller expresses no preference. */
const DEFAULT_MODEL = "eleven_multilingual_v2";

export async function handleElevenLabsTts(
  ctx: RouteContext,
): Promise<Response> {
  const { g, providerKey } = ctx;

  const voiceId = ctx.url.pathname.split("/").pop() ?? "";
  if (!voiceId) return json({ error: "bad request", code: "bad_body" }, 400);

  let body: Record<string, unknown>;
  try {
    body = await ctx.req.json();
  } catch {
    return json({ error: "bad request", code: "bad_body" }, 400);
  }

  const text = typeof body.text === "string" ? body.text : "";
  if (text.trim().length === 0) {
    return json({ error: "That line has no text to speak.", code: "bad_body" }, 400);
  }

  const model =
    typeof body.model_id === "string" && body.model_id.length > 0
      ? body.model_id
      : DEFAULT_MODEL;

  const price = await priceFor(g.supabase, "elevenlabs", model);
  if (!price) {
    return json(
      {
        error: `The voice model ${model} isn't available on credit.`,
        code: "model_not_allowed",
      },
      400,
    );
  }

  // AN ESTIMATE, AND THE ONLY PLACE A COUNT OF OURS IS ALLOWED.
  //
  // Billing is per ElevenLabs CREDIT, and no credit figure exists until the
  // response header arrives — so the hold is sized on the worst case across
  // models, ONE CREDIT PER CHARACTER. That is the standard-model rate; a flash
  // model bills half, so a flash call reserves roughly twice what it spends and
  // hands the rest straight back.
  //
  // It can still be too small. ElevenLabs normalises before speaking — SSML and
  // number expansion can make a line cost more credits than it has characters —
  // and then credit_hold_settle caps the settle at the hold and logs 'capped'.
  // That log is the signal, not a silent loss.
  const estimatedUsd = creditCostUsd(price, text.length);

  const hold = await openHold(g.supabase, {
    userId: g.userId,
    toolId: g.toolId,
    credits: await quoteCredits(g.supabase, estimatedUsd),
    ttlSeconds: HOLD_TTL_SECONDS,
  });
  if ("response" in hold) return hold.response;

  // The query string carries output_format, which the desktop app sets to
  // wav_24000. Forwarded as sent: it changes the audio, not the billing.
  const qs = ctx.url.search;

  let upstream: Response;
  try {
    upstream = await fetch(
      `${elevenLabsBase()}${UPSTREAM_PATH}/${encodeURIComponent(voiceId)}${qs}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": providerKey,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
  } catch {
    await releaseHold(g.supabase, hold.id, "provider unreachable");
    return json(
      {
        error: "Couldn't reach ElevenLabs. Try again.",
        code: "provider_unreachable",
      },
      502,
    );
  }

  if (!upstream.ok) {
    await releaseHold(g.supabase, hold.id, `elevenlabs ${upstream.status}`);
    logProviderFailure("elevenlabs", "text-to-speech", upstream.status);
    const safe = await safeProviderError(upstream, "elevenlabs");
    return json(safe.body, safe.status);
  }

  // ---- Settle BEFORE answering -------------------------------------------
  //
  // The cost is in the headers, which have already arrived; the audio body has
  // not been read yet. That ordering is what lets this route do what the
  // streaming one cannot — bill exactly, then tell the client what it cost in a
  // header of its own.
  const credits = elevenLabsCredits(upstream.headers);

  if (credits === null) {
    // NO FALLBACK. There used to be one — bill our own character count — and it
    // is precisely what let this route mis-meter every call it ever served
    // without anyone noticing, because a plausible number never looks like a
    // bug. A missing header means the provider's API moved, and the only honest
    // response to "we cannot tell what this cost" is to stop.
    //
    // We eat this one: ElevenLabs has synthesised the audio and will bill us for
    // it, and we neither charge the member nor hand them the result. That is the
    // deliberate price of not guessing, and the log is loud so it is a
    // five-minute fix rather than a slow leak.
    await releaseHold(g.supabase, hold.id, "elevenlabs sent no character-cost");
    console.error(
      "ai-gateway: elevenlabs returned NO character-cost header — the metering " +
        "contract has changed. Call refused and the hold released; ElevenLabs " +
        "has billed us for audio nobody received. Fix usage.ts before this is " +
        "normal.",
    );
    return json(
      {
        error: "Couldn't measure what this call cost. Nothing was charged.",
        code: "provider_unmetered",
      },
      502,
    );
  }

  const charged = await settleHold(g.supabase, {
    holdId: hold.id,
    provider: "elevenlabs",
    model,
    costUsd: creditCostUsd(price, credits),
  });

  // Body streamed through, never buffered. See the header note.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "X-BLAI-Credits-Charged",
      "content-type":
        upstream.headers.get("content-type") ?? "application/octet-stream",
      "X-BLAI-Credits-Charged": String(charged),
    },
  });
}
