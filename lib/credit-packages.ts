import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * The credit packages — what is for sale, and what each one delivers.
 *
 * Two readers, and the difference between them is the whole security story.
 *
 * THE BUYER'S SIDE reads active packages to render buttons and to resolve a
 * slug to a Creem product id. Anon-readable, because a price list is public.
 *
 * THE WEBHOOK'S SIDE goes the other way: Creem product id -> credits. That
 * lookup decides how much money we hand over, so it runs on the service role
 * against a column the buyer cannot influence. It deliberately does NOT take the
 * amount from checkout metadata, which Creem echoes back and which anyone
 * creating a checkout by hand in the Creem dashboard can write, and it does not
 * read the product's name, which is a display string someone will eventually
 * tidy up. The product id is the one value that is both stable and not the
 * buyer's to choose.
 */

export type CreditPackage = {
  slug: string;
  name: string;
  credits: number;
  priceUsdCents: number;
  /** Null until the product exists in Creem. Nothing may be sold without it. */
  providerProductId: string | null;
};

const COLUMNS = "slug, name, credits, price_usd_cents, provider_product_id";

function toPackage(row: {
  slug: string;
  name: string;
  credits: number;
  price_usd_cents: number;
  provider_product_id: string | null;
}): CreditPackage {
  return {
    slug: row.slug,
    name: row.name,
    credits: row.credits,
    priceUsdCents: row.price_usd_cents,
    providerProductId: row.provider_product_id,
  };
}

/** What is on sale, cheapest first. Empty until the Creem products exist. */
export async function listCreditPackages(): Promise<CreditPackage[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("credit_packages")
    .select(COLUMNS)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return (data ?? []).map(toPackage);
}

/**
 * One package by slug, for the checkout route.
 *
 * The slug is the only thing a caller may name — the same rule `?kind=` follows.
 * It picks a row out of a table we own; it cannot introduce a product.
 */
export async function getCreditPackage(slug: string): Promise<CreditPackage | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("credit_packages")
    .select(COLUMNS)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return data ? toPackage(data) : null;
}

/**
 * How many credits a Creem product delivers. The webhook's question.
 *
 * Service role, and `is_active` is NOT part of the filter — on purpose. A
 * package retired between someone opening a checkout and paying for it is still
 * a package they paid for, and the archived row is the only record of what they
 * bought. Filtering it out here would take their money and deliver nothing.
 */
export async function creditsForProductId(
  productId: string | null | undefined,
): Promise<CreditPackage | null> {
  if (!productId) return null;
  const svc = createAdminClient();
  const { data } = await svc
    .from("credit_packages")
    .select(COLUMNS)
    .eq("provider_product_id", productId)
    .maybeSingle();
  return data ? toPackage(data) : null;
}
