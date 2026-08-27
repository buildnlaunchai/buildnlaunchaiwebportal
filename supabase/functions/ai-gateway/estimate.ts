// Sizing the hold — and the one move that makes a hold possible at all.
//
// A hold has to be the WORST CASE a request can produce, or it is not a
// reservation. Input is knowable: the prompt is in front of us. Output is not —
// a model writes until it stops. So the gateway FORCES AN OUTPUT CEILING on
// every request, and that ceiling is what turns an unbounded cost into a number
// we can hold against a balance.
//
// Everything else in this file follows from that one decision.

/**
 * Characters per token, used to size the input half of the estimate.
 *
 * The real ratio for English is around 4. THREE AND A HALF IS DELIBERATE and
 * the direction matters: a low divisor over-estimates tokens, which
 * over-estimates the hold, which reserves slightly too much. Reserving too much
 * briefly locks a little of the member's balance; reserving too little means
 * settle exceeds the hold, gets capped, and WE eat the difference on every
 * call. One of those errors is recoverable in a second and the other is a slow
 * leak, so the estimate leans toward the recoverable one.
 *
 * Not a tokenizer, on purpose: running one over a long prompt is real CPU, and
 * an Edge Function has 2 seconds of it. This is an estimate for a reservation,
 * not a bill — the bill comes from the provider's own usage numbers.
 */
const CHARS_PER_TOKEN = 3.5;

/** Default output ceiling when a client sends none, per route. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 2048;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Input tokens for a chat-completions body.
 *
 * Serialises the whole messages array rather than summing content strings, so
 * role names, tool definitions and JSON structure all count. They are tokens
 * too, and a prompt full of small messages would otherwise be badly
 * under-counted.
 */
export function estimateChatInputTokens(body: Record<string, unknown>): number {
  const messages = body.messages ?? [];
  const tools = body.tools ?? null;
  const payload = JSON.stringify(tools ? { messages, tools } : { messages });
  return estimateTokens(payload);
}

/** Input tokens for a Responses API body, whose prompt lives in `input`. */
export function estimateResponsesInputTokens(
  body: Record<string, unknown>,
): number {
  const input = body.input ?? "";
  const instructions = body.instructions ?? "";
  return estimateTokens(JSON.stringify({ input, instructions }));
}

export type CeilingResult =
  | { ok: true; maxOutputTokens: number }
  | { ok: false; requested: number; ceiling: number };

/**
 * Resolve the output ceiling, and refuse rather than clamp.
 *
 * WHY REFUSING BEATS CLAMPING. Silently lowering a client's max_tokens changes
 * the request it asked for: the model stops mid-sentence and neither the client
 * nor the member is told why. A refusal that names both numbers — what this
 * would cost, what the ceiling is — is something a person can act on, and the
 * ceiling is one admin edit away.
 *
 * `hardCeiling` is derived from per_call_max_credits, so this refusal and the
 * one inside credit_hold_open are the same rule stated at two depths. Catching
 * it here means we never open a hold that was always going to be rejected.
 */
export function resolveOutputCeiling(
  requested: number | null | undefined,
  hardCeiling: number,
): CeilingResult {
  const wanted =
    typeof requested === "number" && requested > 0
      ? requested
      : DEFAULT_MAX_OUTPUT_TOKENS;

  if (wanted > hardCeiling) {
    return { ok: false, requested: wanted, ceiling: hardCeiling };
  }
  return { ok: true, maxOutputTokens: wanted };
}

/**
 * The largest output, in tokens, that per_call_max_credits can pay for.
 *
 * Solved from the output rate alone and ignoring input, which makes it a slight
 * over-estimate of what is affordable — the input half of the real bill still
 * has to fit under the same cap. credit_hold_open is what enforces the cap
 * exactly; this only needs to be close enough to catch an absurd max_tokens
 * before a hold is attempted.
 */
export function affordableOutputTokens(
  perCallMaxCredits: number,
  creditUsdValue: number,
  marginMultiplier: number,
  outputUsdPerToken: number,
): number {
  if (outputUsdPerToken <= 0) return Number.MAX_SAFE_INTEGER;
  const budgetUsd = (perCallMaxCredits * creditUsdValue) / marginMultiplier;
  return Math.max(1, Math.floor(budgetUsd / outputUsdPerToken));
}
