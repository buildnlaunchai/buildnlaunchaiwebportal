import "server-only";

import { PUBLISHED_EXPIRY_MONTHS } from "@/lib/credit-terms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { timed } from "@/lib/timeout";

/**
 * Reading credit — for the member whose credit it is, and for the admin.
 *
 * Two rules run through this file.
 *
 * FIRST: a member's own reads go through the ANON client, so RLS scopes them.
 * `credit_balances`, `credit_lots` and `credit_ledger` each carry a
 * `user_id = auth.uid()` policy, which means the query cannot return somebody
 * else's row even if this file asked it to. That is the point of using the
 * scoped client rather than the service role and a `.eq()` — the filter is the
 * database's, not a line here that a refactor could drop.
 *
 * SECOND, and it is the same lesson §7 records about `user_api_keys`: on the
 * admin side the filter IS written out. The service-role client bypasses RLS
 * entirely, so "let RLS scope it" is not a scoping strategy there — every admin
 * query below names the user it is about.
 */

/** What one credit is worth, and how long a lot lives. Member-visible. */
export type CreditSettings = {
  /** USD per credit. Members see this so a balance means something. */
  usdValue: number;
  expiryMonths: number;
  creditModeEnabled: boolean;
};

export type CreditLot = {
  id: string;
  total: number;
  remaining: number;
  expiresAt: string | null;
  createdAt: string;
};

export type LedgerEntry = {
  id: string;
  kind: string;
  credits: number;
  balanceAfter: number;
  provider: string | null;
  model: string | null;
  toolSlug: string | null;
  /**
   * The tool's display name, when it can be resolved. Falls back to the slug \u2014
   * never to nothing: a spend with no name attached is the row that makes a
   * member doubt the whole balance.
   */
  toolName: string | null;
  note: string | null;
  createdAt: string;
};

export type MyCredits = {
  balance: number;
  held: number;
  /** What can actually be spent right now. Holds are reservations, not spend. */
  available: number;
  lots: CreditLot[];
  ledger: LedgerEntry[];
};

/**
 * The public half of credit_settings.
 *
 * Read through `credit_settings_public`, which exposes the rate, the expiry and
 * the switch and nothing else — the margin and the caps are ours. There is no
 * `.eq()` because the view is already the single settings row.
 */
export async function getCreditSettings(): Promise<CreditSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("credit_settings_public")
    .select("credit_usd_value, expiry_months, credit_mode_enabled")
    .maybeSingle();

  if (!data) return null;
  return {
    usdValue: Number(data.credit_usd_value),
    // The view types these as nullable because a VIEW's columns always are as
    // far as the generator is concerned. The underlying columns are NOT NULL,
    // so this coalesce is about the type and not about a case that happens.
    expiryMonths: data.expiry_months ?? 12,
    creditModeEnabled: data.credit_mode_enabled === true,
  };
}

/**
 * The credit expiry, for the pages that PUBLISH it — /terms and /refund.
 *
 * Those two are the only marketing pages that read the database, because they
 * state the expiry as a term and the database is what enforces it. That made
 * them the only two marketing pages that could hang: every other one is static
 * or ISR and rides out an outage on cache.
 *
 * So the read gets a deadline, and losing it falls back to the number the
 * policy was written against. The fallback cannot quietly go stale — verify:legal
 * asserts PUBLISHED_EXPIRY_MONTHS equals credit_settings.expiry_months, and
 * fails if somebody changes the setting without changing the constant. Which
 * means during an outage these pages do not merely stay up; they stay up
 * showing the RIGHT number.
 *
 * 2.5s: the healthy p50 for this query is ~200ms, so this is an order of
 * magnitude of headroom and still twenty times faster than the gateway timeout
 * it replaces.
 */
export async function getPublishedExpiryMonths(): Promise<number> {
  const result = await timed(async (signal) => {
    // The PUBLIC client, not the session one. Reading cookies would make
    // /terms and /refund dynamic, and dynamic is exactly what left them as the
    // only marketing pages that could hang — see the revalidate on both. This
    // row is the same for every visitor, so there is no session to attach.
    const supabase = createPublicClient({ signal });
    const { data } = await supabase
      .from("credit_settings_public")
      .select("expiry_months")
      .maybeSingle();
    return data?.expiry_months ?? null;
  }, 2500);

  if (result.ok && result.value !== null) return result.value;
  return PUBLISHED_EXPIRY_MONTHS;
}

/**
 * Everything the signed-in member's own credits page needs.
 *
 * `available` is computed here rather than read from `credit_available()`
 * because the page shows the parts as well as the total — a member looking at
 * "48,000 of 50,000 spendable" needs to see the 2,000 that is held, and a single
 * number cannot explain itself.
 */
export async function getMyCredits(ledgerLimit = 25): Promise<MyCredits> {
  const supabase = await createClient();

  // ─── FOUR QUERIES, ONE ROUND TRIP ─────────────────────────────────────────
  //
  // The tool-name lookup used to run AFTER this batch, because it was written to
  // take the slugs the ledger returned — which made it a fifth, serial round
  // trip on the heaviest page in the app. It does not need them: `tools` holds
  // four rows, RLS already limits it to what this member may see, and filtering
  // in memory costs nothing next to a network hop.
  //
  // Slugs are ours, names are theirs. The ledger stores `tool_slug` because a
  // slug is stable and a name is not — renaming a tool must not rewrite what
  // happened last month — but the member has never seen a slug, and a history
  // that names things they cannot recognise is a history they cannot check. A
  // tool that is archived or draft will not resolve, and that row keeps its slug
  // rather than losing its subject.
  const [balanceRes, lotsRes, ledgerRes, toolsRes] = await Promise.all([
    supabase.from("credit_balances").select("balance, held").maybeSingle(),
    supabase
      .from("credit_lots")
      .select("id, credits_total, credits_remaining, expires_at, created_at")
      .gt("credits_remaining", 0)
      .order("expires_at", { ascending: true, nullsFirst: false }),
    supabase
      .from("credit_ledger")
      .select(
        "id, kind, credits, balance_after, provider, model, tool_slug, note, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(ledgerLimit),
    supabase.from("tools").select("slug, name"),
  ]);

  const balance = balanceRes.data?.balance ?? 0;
  const held = balanceRes.data?.held ?? 0;

  const nameOf = new Map((toolsRes.data ?? []).map((t) => [t.slug, t.name]));

  return {
    balance,
    held,
    available: Math.max(0, balance - held),
    lots: (lotsRes.data ?? []).map((l) => ({
      id: l.id,
      total: l.credits_total,
      remaining: l.credits_remaining,
      expiresAt: l.expires_at,
      createdAt: l.created_at,
    })),
    ledger: (ledgerRes.data ?? []).map((e) => ({
      id: e.id,
      kind: e.kind,
      credits: e.credits,
      balanceAfter: e.balance_after,
      provider: e.provider,
      model: e.model,
      toolSlug: e.tool_slug,
      toolName: e.tool_slug ? (nameOf.get(e.tool_slug) ?? e.tool_slug) : null,
      note: e.note,
      createdAt: e.created_at,
    })),
  };
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export type CreditHolder = {
  id: string;
  email: string;
  fullName: string | null;
  balance: number;
  held: number;
  /** null = follows the global switch. See profiles.credit_mode_override. */
  override: boolean | null;
  membershipStatus: string | null;
};

/**
 * Everyone the credit system currently applies to.
 *
 * Deliberately NOT every profile. Once there are a thousand members, a table of
 * a thousand rows where nine hundred and ninety say "0, follows the switch" is a
 * table nobody reads. The people who matter are the ones holding credit and the
 * ones with an override — an override is the thing an admin turned on and will
 * need to find again to turn off.
 */
export async function listCreditHolders(): Promise<CreditHolder[]> {
  const svc = createAdminClient();

  const [balances, overrides] = await Promise.all([
    // Only rows with something in them. A `credit_balances` row is created the
    // first time anybody touches an account, so an empty one means "was looked
    // at once", not "holds credit" — and a screen listing those is a screen
    // that fills up with accounts nobody needs to see. Found the direct way: a
    // test probe left two zeroed accounts on it.
    svc.from("credit_balances").select("user_id, balance, held").or("balance.gt.0,held.gt.0"),
    svc
      .from("profiles")
      .select("id")
      .not("credit_mode_override", "is", null),
  ]);

  const ids = new Set<string>([
    ...(balances.data ?? []).map((b) => b.user_id),
    ...(overrides.data ?? []).map((p) => p.id),
  ]);
  if (ids.size === 0) return [];

  const list = [...ids];
  // Named filters, not RLS: the service role has none. See the note at the top.
  const [profiles, memberships] = await Promise.all([
    svc
      .from("profiles")
      .select("id, email, full_name, credit_mode_override")
      .in("id", list),
    svc.from("memberships").select("user_id, status").in("user_id", list),
  ]);

  const balanceOf = new Map((balances.data ?? []).map((b) => [b.user_id, b]));
  const statusOf = new Map((memberships.data ?? []).map((m) => [m.user_id, m.status]));

  return (profiles.data ?? [])
    .map((p) => ({
      id: p.id,
      email: p.email,
      fullName: p.full_name,
      balance: balanceOf.get(p.id)?.balance ?? 0,
      held: balanceOf.get(p.id)?.held ?? 0,
      override: p.credit_mode_override,
      membershipStatus: statusOf.get(p.id) ?? null,
    }))
    .sort((a, b) => b.balance - a.balance || a.email.localeCompare(b.email));
}
