import "server-only";

import { createPublicClient } from "@/lib/supabase/public";

/**
 * The Creem product the "Subscribe" button checks out. It lives in
 * plans.provider_price_id (slug='member'), NOT in an env var, so switching the
 * product or moving test→live is a one-row data change with no redeploy.
 *
 * The column is named provider_price_id because Paddle called this a price id;
 * Creem calls it a product id (prod_…). Same thing — the provider's checkout
 * identifier — and renaming the column would be a destructive migration for a
 * cosmetic gain.
 *
 * Read SERVER-SIDE ONLY now, by app/api/checkout/route.ts. Under Paddle this was
 * also fetched by every page rendering a CTA and threaded down as a prop, because
 * Paddle.js needed it in the browser to open the overlay. Creem checkout is a
 * server-side redirect, so the id never has to reach the client at all.
 *
 * `plans` is anon-readable (is_active), so the cookieless public client is right:
 * it adds no session dependency to the checkout route.
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
