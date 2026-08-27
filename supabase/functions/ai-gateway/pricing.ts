// What a provider call costs US, in dollars, before margin.
//
// THE SPLIT THAT MATTERS: this file computes the provider's cost. It never
// applies the margin and never converts to credits — credit_quote() in Postgres
// does both, and it is the only thing that does. Two copies of
// `cost x margin / rate` in two languages would agree for exactly as long as
// nobody edited one of them.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type PriceRow = {
  provider: string;
  model: string;
  /**
   * What one unit IS.
   *
   * 'credit' replaced 'character' for ElevenLabs, and the rename is the point
   * rather than tidying: the rate is now per ELEVENLABS CREDIT, because that is
   * what `character-cost` counts and what they charge us. A row labelled
   * 'character' invited exactly the mistake that shipped — reading a
   * credit-denominated header into a per-character rate, which under-bills
   * flash models by half.
   */
  unit: "token" | "character" | "credit";
  input_usd_per_unit: number;
  output_usd_per_unit: number;
};

/**
 * Look up a model's price. Null means "not on the list", which callers must
 * turn into a refusal.
 *
 * THIS TABLE IS AN ALLOW-LIST, not merely a rate card. Rejecting an unknown
 * model is what stops a client asking for something twenty times more expensive
 * than the model it was built around — and it is why there is deliberately no
 * fallback rate here. A fallback is a guess about money: too low and we lose on
 * every call, too high and we overcharge, and either way silently.
 */
export async function priceFor(
  supabase: SupabaseClient,
  provider: string,
  model: string,
): Promise<PriceRow | null> {
  const { data, error } = await supabase
    .from("provider_model_prices")
    .select("provider, model, unit, input_usd_per_unit, output_usd_per_unit")
    .eq("provider", provider)
    .eq("model", model)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    // Never fail open. A lookup that errored is not a licence to guess.
    console.error("pricing: lookup failed for", provider, model);
    return null;
  }
  if (!data) return null;

  return {
    provider: data.provider as string,
    model: data.model as string,
    unit: data.unit as "token" | "character" | "credit",
    // PostgREST returns numeric as a string to avoid float precision loss. The
    // values here are as small as 1.5e-7, so the parse has to happen once,
    // explicitly, rather than through arithmetic coercion somewhere downstream.
    input_usd_per_unit: Number(data.input_usd_per_unit),
    output_usd_per_unit: Number(data.output_usd_per_unit),
  };
}

/** Token-billed cost. Input and output are priced separately. */
export function tokenCostUsd(
  price: PriceRow,
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    inputTokens * price.input_usd_per_unit +
    outputTokens * price.output_usd_per_unit
  );
}

/**
 * Flat-rate cost: one price, one count, no output side.
 *
 * ElevenLabs bills this way, in its own credits. The caller passes the number
 * the PROVIDER reported (`character-cost`), never a count of our own — see
 * usage.ts for why that distinction cost us a whole route's worth of wrong
 * metering. The one exception is sizing a hold before the call, where there is
 * no provider number yet and the route says so at the call site.
 */
export function creditCostUsd(price: PriceRow, units: number): number {
  return units * price.input_usd_per_unit;
}

/**
 * Provider cost -> credits, via Postgres.
 *
 * A round trip for arithmetic, deliberately. credit_quote applies the margin
 * and the credit value from credit_settings, both admin-editable, and rounds
 * up. Reimplementing that here would mean an admin changing the margin took
 * effect on settlement but not on the hold — the hold too small, the settle
 * capped, and the difference eaten by us on every call until someone noticed.
 */
export async function quoteCredits(
  supabase: SupabaseClient,
  costUsd: number,
): Promise<number> {
  const { data, error } = await supabase.rpc("credit_quote", {
    p_provider_cost_usd: costUsd,
  });
  if (error) throw new Error(`credit_quote failed: ${error.message}`);
  return (data as number) ?? 0;
}
