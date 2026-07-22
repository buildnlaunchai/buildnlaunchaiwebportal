import "server-only";

import { createPublicClient } from "@/lib/supabase/public";

/**
 * The Paddle price the "Subscribe" button checks out. It lives in
 * plans.provider_price_id (slug='member'), NOT in an env var, so switching the
 * price or moving sandbox→live is a one-row data change with no redeploy.
 *
 * A price ID is not a secret — it rides the checkout call in the browser — and
 * `plans` is anon-readable (is_active), so the cookieless public client is right:
 * it keeps the marketing pages statically cacheable.
 */
export async function getSubscribePriceId(): Promise<string | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("plans")
    .select("provider_price_id")
    .eq("slug", "member")
    .eq("is_active", true)
    .maybeSingle();
  return data?.provider_price_id ?? null;
}
