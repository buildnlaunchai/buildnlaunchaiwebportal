// Reading what a call ACTUALLY cost, from the provider's own numbers.
//
// The rule this file exists to enforce: usage comes from the provider, never
// from the client. A client that could report its own token count could report
// zero, and the whole billing model would rest on the honesty of software
// running on someone else's machine.

export type TokenUsage = { inputTokens: number; outputTokens: number };

/**
 * Usage from a non-streaming OpenAI response — chat completions or Responses.
 *
 * The two APIs name the same numbers differently, which is why both spellings
 * are read here rather than at each call site:
 *   chat completions -> prompt_tokens / completion_tokens
 *   responses        -> input_tokens  / output_tokens
 */
export function openAiUsage(body: unknown): TokenUsage | null {
  const u = (body as { usage?: Record<string, unknown> } | null)?.usage;
  if (!u || typeof u !== "object") return null;

  const input = num(u.prompt_tokens) ?? num(u.input_tokens);
  const output = num(u.completion_tokens) ?? num(u.output_tokens);
  if (input === null || output === null) return null;

  return { inputTokens: input, outputTokens: output };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Pull usage out of one SSE chunk, if it carries any.
 *
 * CHEAP TEST FIRST, AND THAT IS NOT A MICRO-OPTIMISATION. A long completion is
 * thousands of chunks, and an Edge Function has 2 SECONDS OF CPU. JSON.parse on
 * every chunk is real computation on a budget that has none to spare, so the
 * substring check does the rejecting and the parser only ever sees the one
 * chunk in a thousand that could possibly match.
 *
 * OpenAI sends the usage chunk only when stream_options.include_usage is set —
 * which the gateway forces on, because a client that omitted it would leave us
 * with no way to bill the call it just received.
 */
export function usageFromSseChunk(text: string): TokenUsage | null {
  if (!text.includes('"usage"')) return null;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;

    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;

    try {
      const parsed = JSON.parse(payload);
      const u = openAiUsage(parsed);
      if (u) return u;
    } catch {
      // A chunk split mid-JSON across a network boundary. The next one carries
      // the rest; usage arrives at the end of the stream, so there is always
      // another chance. Never let a partial parse kill the stream.
    }
  }
  return null;
}

/**
 * What ElevenLabs actually billed for a synthesis, from its own response header.
 *
 * THE HEADER IS `character-cost`, AND IT IS NOT CHARACTERS.
 *
 * This function used to read `x-character-count` and, when that was absent, fall
 * back to counting the request text ourselves. Both halves were wrong, and the
 * fallback is what hid it: **ElevenLabs has never sent `x-character-count`**, so
 * the fallback fired on every call the route ever served and the "authoritative"
 * number was our own guess the whole time. The header it does send is
 *
 *     character-cost: 2          // for "Test." — five characters
 *
 * and it is denominated in ELEVENLABS CREDITS, not characters. Flash models bill
 * 0.5 credit per character, so five characters cost two. It also carries what
 * our count never could: normalisation, SSML expansion, and voice settings.
 * That is the number the provider charges us, so it is the number we bill.
 *
 * `character-cost` is listed in the response's own
 * `access-control-expose-headers`, so it is a supported part of the API rather
 * than something noticed in a packet dump.
 *
 * NULL MEANS STOP, NOT GUESS. There is deliberately no fallback: a missing
 * header means the API changed under us, and the whole reason this bug survived
 * from the route's first day is that the previous version answered that
 * situation with a plausible number instead of an error. The caller releases the
 * hold and fails the call. See routes/elevenlabs-tts.ts.
 */
export function elevenLabsCredits(headers: Headers): number | null {
  const raw = headers.get("character-cost");
  if (raw === null) return null;

  // The empty string is checked BEFORE Number(), because `Number("")` is 0 —
  // and 0 is a legitimate answer here, meaning "the provider billed nothing".
  // Without this line a header present but blank would settle at zero and hand
  // out a free call, silently, which is the same failure this whole rewrite is
  // about. Caught by usage.test.ts, not by reading it.
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/**
 * What to charge when a stream died before its usage chunk arrived.
 *
 * The member received text; they should be billed for it. Input is known
 * exactly — we sent the prompt — so only the output half is estimated, from the
 * characters actually forwarded. The ledger row is marked as an estimate, so a
 * dispute six months from now can tell this apart from a metered charge.
 *
 * Charging nothing would be the wrong kindness: a client that disconnects early
 * on every call would then run entirely free.
 */
export function estimatedUsageFromStream(
  inputTokens: number,
  forwardedChars: number,
): TokenUsage {
  return {
    inputTokens,
    outputTokens: Math.ceil(forwardedChars / 3.5),
  };
}
