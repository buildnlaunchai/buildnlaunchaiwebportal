-- ============================================================================
-- Selling credit: the packages, and the one change fulfilment needed.
--
-- ─── WHY A TABLE AND NOT THREE CONSTANTS ────────────────────────────────────
--
-- Same reasoning as plans.provider_price_id, and the same payoff: moving
-- test→live, changing a price, retiring a package or adding a fourth is an
-- UPDATE, not a deploy. `tools` is data; `plans` is data; a price list is data.
--
-- It also decides WHERE the credit amount comes from on the webhook, which is
-- the security-relevant half. The alternatives were checkout metadata (which
-- Creem echoes back, and which anyone who can create a checkout by hand in the
-- Creem dashboard can write) or the product's name (which is a display string
-- someone will one day tidy up). This maps the Creem PRODUCT ID — a value the
-- buyer cannot influence and the dashboard cannot accidentally change — to a
-- number of credits, on our own server. A renamed product still delivers the
-- right amount; a hand-made checkout for an unknown product delivers nothing
-- and says so loudly.
--
-- Publicly readable on purpose: it is a price list. There is nothing in it a
-- member should not see, which is exactly why it can be read by the page that
-- renders the buttons without a service-role round trip.
-- ============================================================================

create table if not exists credit_packages (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique not null,
  name                text not null,
  credits             integer not null check (credits > 0),
  price_usd_cents     integer not null check (price_usd_cents > 0),

  -- Null until the product exists in Creem. The checkout route refuses a
  -- package with no product id rather than inventing one — the same rule
  -- app/api/checkout/route.ts already applies to the membership plan.
  provider            text not null default 'creem',
  provider_product_id text unique,

  is_active           boolean not null default true,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table credit_packages enable row level security;

-- A price list. Anyone may read the active rows; nobody may write one.
drop policy if exists credit_packages_read on credit_packages;
create policy credit_packages_read on credit_packages
  for select to anon, authenticated
  using (is_active);

-- No insert/update/delete policy for any client role, deliberately. Writes are
-- the service role's: a member who could edit a price could edit the number of
-- credits it delivers.

insert into credit_packages (slug, name, credits, price_usd_cents, sort_order)
values
  ('topup_5',  'Credits — 50,000',  50000,   500, 10),
  ('topup_20', 'Credits — 200,000', 200000, 2000, 20),
  ('topup_50', 'Credits — 500,000', 500000, 5000, 30)
on conflict (slug) do nothing;

-- ============================================================================
-- credit_topup: the membership check becomes a parameter, and the webhook
-- turns it off. Read this before assuming that is a weakening.
--
-- The rule is unchanged: you must be an active member to BUY credit. What
-- changes is WHERE that rule is enforced, because it was in the wrong place.
--
-- credit_topup only ever runs after money has changed hands. A membership that
-- lapses between opening a Creem checkout and the webhook landing — a stale tab,
-- a slow card, a webhook retried an hour later — would make this function refuse,
-- and the refusal is not a safety measure at that point: the buyer has paid and
-- would receive nothing. That is not a guard, it is keeping someone's money.
--
-- So the gate moves to the checkout, where refusing costs nobody anything, and
-- fulfilment delivers what was paid for. The parameter defaults to `true`, so
-- every other caller keeps the old behaviour and only the webhook opts out, at a
-- call site that says why.
--
-- Restated in full: plpgsql has no patch form. Dropped first because adding a
-- parameter creates a second overload rather than replacing the first, and two
-- credit_topups differing only in whether they check membership is precisely the
-- kind of pair someone calls the wrong half of.
-- ============================================================================

drop function if exists public.credit_topup(uuid, integer, text, text, text);

create function public.credit_topup(
  p_user_id   uuid,
  p_credits   integer,
  p_source    text default 'creem',
  p_reference text default null,
  p_note      text default null,
  p_require_membership boolean default true
) returns text
language plpgsql security definer set search_path = public as $$
declare
  s        credit_settings%rowtype;
  v_bal    integer;
  v_ledger uuid;
begin
  if p_user_id is null or p_credits is null or p_credits <= 0 then
    return 'invalid';
  end if;

  if p_require_membership and not public.has_active_membership(p_user_id) then
    return 'no_membership';
  end if;

  -- Friendly idempotency. The unique index does the real enforcing; this just
  -- turns the second delivery of the same Creem event into a word instead of a
  -- constraint violation.
  if p_reference is not null and exists (
    select 1 from credit_ledger
     where kind = 'topup' and reference = p_reference
  ) then
    return 'duplicate';
  end if;

  select * into s from credit_settings where id = true;

  insert into credit_balances (user_id) values (p_user_id)
    on conflict (user_id) do nothing;

  select balance into v_bal
    from credit_balances where user_id = p_user_id for update;

  v_bal := v_bal + p_credits;

  insert into credit_ledger (
    user_id, kind, credits, balance_after,
    credit_usd_value_at, margin_multiplier_at,
    source, reference, note
  ) values (
    p_user_id, 'topup', p_credits, v_bal,
    s.credit_usd_value, s.margin_multiplier,
    p_source, p_reference, p_note
  ) returning id into v_ledger;

  -- The lot. Note the ledger row does NOT point at it: credit_ledger is
  -- append-only, so the link runs lot -> ledger and never the other way.
  insert into credit_lots (
    user_id, ledger_id, credits_total, credits_remaining, expires_at
  ) values (
    p_user_id, v_ledger, p_credits, p_credits,
    now() + make_interval(months => s.expiry_months)
  );

  update credit_balances
     set balance = v_bal
   where user_id = p_user_id;

  return 'ok';
end $$;

comment on function public.credit_topup(uuid, integer, text, text, text, boolean) is
  'Add bought credit to a member''s balance, as one ledger row and one lot. '
  'Idempotent on p_reference — pass the Creem webhook id. p_require_membership '
  'defaults to true; the webhook passes false because refusing to deliver a '
  'purchase that has already been paid for is not a guard. See 20260828190000.';

revoke all on function public.credit_topup(uuid, integer, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.credit_topup(uuid, integer, text, text, text, boolean)
  to service_role;

-- ---------------------------------------------------------------------------
-- Proof, in a subtransaction that is rolled back.
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid;
  r     text;
begin
  begin
    -- Someone with no active membership. If everyone here has one, the
    -- membership assertions have nothing to say and are skipped rather than
    -- faked — but the packages are still checked.
    select p.id into v_uid
      from profiles p
     where not public.has_active_membership(p.id)
     limit 1;

    assert (select count(*) from credit_packages where is_active) = 3,
      'expected three active packages';
    assert (select credits from credit_packages where slug = 'topup_20') = 200000,
      'the $20 package must be 200,000 credits';
    assert (select count(*) from credit_packages where provider_product_id is not null) = 0,
      'no product ids yet — they are set once the Creem products exist';

    if v_uid is not null then
      r := public.credit_topup(v_uid, 100, 'test', 'assert-' || v_uid::text, null);
      assert r = 'no_membership', 'default must still require a membership, got ' || r;

      r := public.credit_topup(v_uid, 100, 'test', 'assert-' || v_uid::text, null, false);
      assert r = 'ok', 'the webhook path must fulfil regardless, got ' || r;

      r := public.credit_topup(v_uid, 100, 'test', 'assert-' || v_uid::text, null, false);
      assert r = 'duplicate', 'the same reference must not credit twice, got ' || r;
    end if;

    raise exception 'rollback the assertions';
  exception when others then
    if sqlerrm <> 'rollback the assertions' then raise; end if;
  end;
end $$;
