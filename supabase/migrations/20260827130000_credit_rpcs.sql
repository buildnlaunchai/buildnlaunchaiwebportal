-- ============================================================================
-- CREDIT SYSTEM — the RPCs (2 of 3)
--
-- EVERY BALANCE MUTATION IN THE PRODUCT GOES THROUGH THIS FILE. No client role
-- can write credit_balances, credit_ledger, credit_lots or credit_holds — the
-- grants in migration 1 see to that — so these functions are the only door, and
-- each one is security definer, atomic, and locks before it looks.
--
-- THE LOCK ORDER IS ALWAYS: credit_balances row FIRST, then lots/holds.
-- Every function below obeys it. Two functions that disagree about lock order
-- are a deadlock waiting for the first busy afternoon, and the bug shows up as
-- "the runner froze", never as anything that names credit.
--
-- Balance can never go negative. Three independent things guarantee it:
--   1. `select ... for update` on the balance row, so two calls serialise.
--   2. Every path checks available (balance - held) before it spends.
--   3. check (balance >= 0) and check (held <= balance) in the schema, which
--      turn a bug in 1 or 2 into a failed transaction instead of a free tool.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- credit_available — spendable credit, in credits
--
-- INTERNAL. Deliberately not granted to authenticated: it takes an arbitrary
-- uid and is security definer, so a member-callable version would answer
-- "how much credit does that other person have" for anyone who asks.
--
-- A member reads their OWN balance straight from credit_balances, which has a
-- select-own policy and needs no function at all.
-- ---------------------------------------------------------------------------
create or replace function public.credit_available(uid uuid default auth.uid())
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(
    (select balance - held from credit_balances where user_id = uid),
    0
  );
$$;


-- ---------------------------------------------------------------------------
-- credit_quote — what a provider call costs a member, in credits
--
--     credits = ceil( provider cost x margin / credit value )
--
-- Rounded UP, always: rounding a fraction of a credit down is a rounding error
-- in the member's favour on every single call, which at scale is a discount
-- nobody decided to give.
--
-- A genuinely free call costs zero credits rather than a minimum of one. If it
-- cost us nothing, charging for it is not margin, it is a fee.
-- ---------------------------------------------------------------------------
create or replace function public.credit_quote(p_provider_cost_usd numeric)
returns integer language sql stable security definer set search_path = public as $$
  select case
    when p_provider_cost_usd is null or p_provider_cost_usd <= 0 then 0
    else greatest(1, ceil(
      (p_provider_cost_usd * s.margin_multiplier) / s.credit_usd_value
    )::integer)
  end
  from credit_settings s
  where s.id = true;
$$;


-- ---------------------------------------------------------------------------
-- credit_consume_fifo — INTERNAL. Spend credit oldest-lot-first.
--
-- Writes ONE LEDGER ROW PER LOT TOUCHED. A 300-credit debit that takes 100 from
-- a lot bought in March and 200 from one bought in June is two rows, both
-- carrying the same hold_id and run_id. That is what lets a dispute six months
-- later be answered with a query rather than an argument.
--
-- The provider cost is APPORTIONED across those rows pro-rata, not repeated on
-- each. Repeating it would make sum(provider_cost_usd) double-count the real
-- spend, and that column is the cost basis every margin report will be built
-- on. The final row absorbs the rounding remainder so the parts sum exactly to
-- the whole.
--
-- Returns how much it actually managed to consume. A caller that asked for more
-- than the lots hold gets a smaller number back and MUST check it — that
-- mismatch means the balance and the lots have drifted, which is a bug worth
-- failing loudly on rather than papering over.
-- ---------------------------------------------------------------------------
create or replace function public.credit_consume_fifo(
  p_user_id           uuid,
  p_credits           integer,            -- positive amount to consume
  p_kind              credit_entry_kind,
  p_balance_before    integer,
  p_provider          api_provider default null,
  p_model             text default null,
  p_provider_cost_usd numeric default null,
  p_tool_id           uuid default null,
  p_tool_slug         text default null,
  p_run_id            uuid default null,
  p_hold_id           uuid default null,
  p_source            text default null,
  p_note              text default null,
  p_actor             uuid default null
)
returns table (consumed integer, first_ledger_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  s          credit_settings%rowtype;
  lot        record;
  v_left     integer := p_credits;
  v_take     integer;
  v_bal      integer := p_balance_before;
  v_first    uuid;
  v_ledger   uuid;
  v_cost_left numeric := p_provider_cost_usd;
  v_row_cost  numeric;
begin
  select * into s from credit_settings where id = true;

  for lot in
    select id, credits_remaining
      from credit_lots
     where user_id = p_user_id
       and credits_remaining > 0
     order by expires_at asc, created_at asc
     for update
  loop
    exit when v_left <= 0;

    v_take := least(v_left, lot.credits_remaining);

    -- Apportion the cost. Last row takes whatever is left so the parts sum to
    -- the total exactly, rather than to the total minus a rounding crumb.
    if p_provider_cost_usd is null then
      v_row_cost := null;
    elsif v_left - v_take <= 0 then
      v_row_cost := v_cost_left;
    else
      v_row_cost := round(p_provider_cost_usd * v_take / p_credits, 6);
      v_cost_left := v_cost_left - v_row_cost;
    end if;

    update credit_lots
       set credits_remaining = credits_remaining - v_take
     where id = lot.id;

    v_bal := v_bal - v_take;

    insert into credit_ledger (
      user_id, kind, credits, balance_after,
      credit_usd_value_at, margin_multiplier_at,
      provider, model, provider_cost_usd,
      tool_id, tool_slug, run_id, hold_id, lot_id,
      source, note, actor_id
    ) values (
      p_user_id, p_kind, -v_take, v_bal,
      s.credit_usd_value, s.margin_multiplier,
      p_provider, p_model, v_row_cost,
      p_tool_id, p_tool_slug, p_run_id, p_hold_id, lot.id,
      p_source, p_note, p_actor
    ) returning id into v_ledger;

    if v_first is null then v_first := v_ledger; end if;
    v_left := v_left - v_take;
  end loop;

  consumed := p_credits - v_left;
  first_ledger_id := v_first;
  return next;
end $$;


-- ---------------------------------------------------------------------------
-- credit_topup — a member bought credit
--
-- Returns a status word rather than raising, matching process_creem_event's
-- shape: a webhook needs a terminal answer it can record, not an exception that
-- puts the provider into a retry loop it can never escape.
--
--   'ok' | 'duplicate' | 'no_membership' | 'invalid'
--
-- ONLY AN ACTIVE MEMBER MAY BUY CREDIT — the business rule, enforced here
-- rather than only at the gateway, because the gateway is a UI and this is the
-- door. 'no_membership' is a real outcome to handle at the call site (a member
-- whose subscription lapsed between checkout and webhook has paid for something
-- they cannot receive), not an error to swallow.
-- ---------------------------------------------------------------------------
create or replace function public.credit_topup(
  p_user_id   uuid,
  p_credits   integer,
  p_source    text default 'creem',
  p_reference text default null,
  p_note      text default null
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

  if not public.has_active_membership(p_user_id) then
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


-- ---------------------------------------------------------------------------
-- credit_hold_open — reserve before the call
--
--   'ok' | 'insufficient' | 'over_call_cap' | 'over_daily_cap' | 'invalid'
--
-- Returns the caps as data so the caller can say "that would cost 700 credits,
-- your per-call ceiling is 500" instead of a bare no.
-- ---------------------------------------------------------------------------
create or replace function public.credit_hold_open(
  p_user_id     uuid,
  p_tool_id     uuid,
  p_max_credits integer,
  p_run_id      uuid default null,
  p_ttl_seconds integer default 900
)
returns table (status text, hold_id uuid, available integer)
language plpgsql security definer set search_path = public as $$
declare
  s           credit_settings%rowtype;
  v_bal       integer;
  v_held      integer;
  v_avail     integer;
  v_today     integer;
  v_slug      text;
  v_hold      uuid;
begin
  hold_id := null;
  available := 0;

  if p_user_id is null or p_max_credits is null or p_max_credits <= 0 then
    status := 'invalid';
    return next;
    return;
  end if;

  select * into s from credit_settings where id = true;

  if p_max_credits > s.per_call_max_credits then
    status := 'over_call_cap';
    available := public.credit_available(p_user_id);
    return next;
    return;
  end if;

  insert into credit_balances (user_id) values (p_user_id)
    on conflict (user_id) do nothing;

  select balance, held into v_bal, v_held
    from credit_balances where user_id = p_user_id for update;

  v_avail := v_bal - v_held;
  available := v_avail;

  -- Today's spend, UTC, plus everything currently reserved. Holds count because
  -- they are about to become spend; leaving them out would let a member open
  -- twenty concurrent calls that each pass the daily check and collectively
  -- blow through it.
  -- The `at time zone 'utc'` on the OUTSIDE is not decoration. Without it,
  -- date_trunc returns a naive timestamp and comparing it to a timestamptz
  -- coerces using the SESSION's timezone — so the daily window would silently
  -- start at the wrong hour for any connection that isn't UTC. The rate limit
  -- would still work, just not on the day it claims to.
  select coalesce(sum(-credits), 0) into v_today
    from credit_ledger
   where user_id = p_user_id
     and kind = 'debit'
     and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');

  if v_today + v_held + p_max_credits > s.per_user_daily_max_credits then
    status := 'over_daily_cap';
    return next;
    return;
  end if;

  if v_avail < p_max_credits then
    status := 'insufficient';
    return next;
    return;
  end if;

  select slug into v_slug from tools where id = p_tool_id;

  insert into credit_holds (
    user_id, tool_id, tool_slug, run_id, max_credits, expires_at
  ) values (
    p_user_id, p_tool_id, v_slug, p_run_id, p_max_credits,
    now() + make_interval(secs => greatest(30, p_ttl_seconds))
  ) returning id into v_hold;

  update credit_balances
     set held = v_held + p_max_credits
   where user_id = p_user_id;

  status := 'ok';
  hold_id := v_hold;
  available := v_avail - p_max_credits;
  return next;
end $$;


-- ---------------------------------------------------------------------------
-- credit_hold_settle — the call finished; charge what it really cost
--
--   'ok' | 'capped' | 'not_open' | 'drift'
--
-- 'capped' means the true cost exceeded what was reserved. We charge the
-- reservation and no more — a member agreed to a ceiling and silently billing
-- past it is not a thing this product does. It is a distinct word rather than
-- 'ok' because a run of them means the estimator is wrong and someone should
-- look.
--
-- 'drift' means the lots could not cover a charge the balance said was there.
-- That is an invariant violation, not a user error; the transaction is rolled
-- back so it surfaces instead of quietly half-applying.
-- ---------------------------------------------------------------------------
create or replace function public.credit_hold_settle(
  p_hold_id           uuid,
  p_provider          api_provider default null,
  p_model             text default null,
  p_provider_cost_usd numeric default null,
  p_run_id            uuid default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  h         credit_holds%rowtype;
  v_bal     integer;
  v_held    integer;
  v_quote   integer;
  v_charge  integer;
  v_consumed integer;
  v_first   uuid;
  v_capped  boolean := false;
begin
  select * into h from credit_holds where id = p_hold_id;
  if not found then return 'not_open'; end if;

  -- Balance first, then the hold. See the lock-order note at the top.
  select balance, held into v_bal, v_held
    from credit_balances where user_id = h.user_id for update;

  select * into h from credit_holds where id = p_hold_id for update;
  if h.status <> 'open' then return 'not_open'; end if;

  v_quote := public.credit_quote(p_provider_cost_usd);
  v_charge := least(v_quote, h.max_credits);
  if v_quote > h.max_credits then v_capped := true; end if;

  if v_charge > 0 then
    select consumed, first_ledger_id into v_consumed, v_first
      from public.credit_consume_fifo(
        p_user_id           => h.user_id,
        p_credits           => v_charge,
        p_kind              => 'debit',
        p_balance_before    => v_bal,
        p_provider          => p_provider,
        p_model             => p_model,
        p_provider_cost_usd => p_provider_cost_usd,
        p_tool_id           => h.tool_id,
        p_tool_slug         => h.tool_slug,
        p_run_id            => coalesce(p_run_id, h.run_id),
        p_hold_id           => h.id,
        p_source            => 'system'
      );

    if v_consumed <> v_charge then
      -- Balance and lots disagree. Fail the whole transaction rather than
      -- charge a number neither table agrees with.
      raise exception
        'credit drift: hold % wanted % credits, lots yielded %',
        h.id, v_charge, v_consumed;
    end if;
  else
    v_consumed := 0;
  end if;

  update credit_balances
     set balance = v_bal - v_consumed,
         held    = v_held - h.max_credits
   where user_id = h.user_id;

  update credit_holds
     set status = 'settled',
         settled_ledger_id = v_first,
         run_id = coalesce(p_run_id, run_id),
         resolved_at = now()
   where id = h.id;

  return case when v_capped then 'capped' else 'ok' end;
end $$;


-- ---------------------------------------------------------------------------
-- credit_hold_release — the call failed; hand the reservation back
--
--   'ok' | 'not_open'
--
-- No ledger row, because nothing moved: a hold never touched `balance`. The
-- reservation is simply forgotten.
-- ---------------------------------------------------------------------------
create or replace function public.credit_hold_release(
  p_hold_id uuid,
  p_reason  text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  h      credit_holds%rowtype;
  v_held integer;
begin
  select * into h from credit_holds where id = p_hold_id;
  if not found then return 'not_open'; end if;

  select held into v_held
    from credit_balances where user_id = h.user_id for update;

  select * into h from credit_holds where id = p_hold_id for update;
  if h.status <> 'open' then return 'not_open'; end if;

  update credit_balances
     set held = greatest(0, v_held - h.max_credits)
   where user_id = h.user_id;

  update credit_holds
     set status = 'released',
         resolved_at = now(),
         note = p_reason
   where id = h.id;

  return 'ok';
end $$;


-- ---------------------------------------------------------------------------
-- credit_holds_sweep — reclaim reservations nothing ever resolved
--
-- Runs every minute. Without it, a runner that dies between opening a hold and
-- settling it holds that credit hostage forever, and the member's own money
-- becomes unreachable with nothing in the product to explain why. Exactly the
-- role the run reaper plays for tool_runs, for exactly the same reason.
-- ---------------------------------------------------------------------------
create or replace function public.credit_holds_sweep()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  h     record;
  v_n   integer := 0;
  v_held integer;
begin
  for h in
    select id, user_id, max_credits
      from credit_holds
     where status = 'open'
       and expires_at < now()
     -- Stable order across concurrent sweeps, so two of them cannot take the
     -- same two balance rows in opposite orders.
     order by user_id, id
  loop
    select held into v_held
      from credit_balances where user_id = h.user_id for update;

    update credit_balances
       set held = greatest(0, v_held - h.max_credits)
     where user_id = h.user_id;

    update credit_holds
       set status = 'expired', resolved_at = now()
     where id = h.id and status = 'open';

    v_n := v_n + 1;
  end loop;

  return v_n;
end $$;


-- ---------------------------------------------------------------------------
-- credit_lots_expire — credit ages out 12 months after it was bought
--
-- Runs daily. Writes a real 'expiry' ledger row per lot, so a member can always
-- see WHY their balance dropped; a balance that shrinks with no entry beside it
-- reads as theft, whatever the terms of service say.
--
-- The clamp on `held` matters: a lot cannot expire out from under a live
-- reservation, or balance would fall below held and the schema check would
-- reject the whole sweep. Whatever a hold is covering is simply left for the
-- next run, by which time the hold has settled or been swept.
-- ---------------------------------------------------------------------------
create or replace function public.credit_lots_expire()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  s        credit_settings%rowtype;
  lot      record;
  v_bal    integer;
  v_held   integer;
  v_take   integer;
  v_n      integer := 0;
begin
  select * into s from credit_settings where id = true;

  for lot in
    select id, user_id, credits_remaining
      from credit_lots
     where credits_remaining > 0
       and expires_at < now()
     order by user_id, id
  loop
    select balance, held into v_bal, v_held
      from credit_balances where user_id = lot.user_id for update;

    v_take := least(lot.credits_remaining, v_bal - v_held);
    continue when v_take <= 0;

    update credit_lots
       set credits_remaining = credits_remaining - v_take
     where id = lot.id;

    insert into credit_ledger (
      user_id, kind, credits, balance_after,
      credit_usd_value_at, margin_multiplier_at,
      lot_id, source, note
    ) values (
      lot.user_id, 'expiry', -v_take, v_bal - v_take,
      s.credit_usd_value, s.margin_multiplier,
      lot.id, 'system', 'Credit expired ' || s.expiry_months || ' months after purchase.'
    );

    update credit_balances
       set balance = v_bal - v_take
     where user_id = lot.user_id;

    v_n := v_n + 1;
  end loop;

  return v_n;
end $$;


-- ---------------------------------------------------------------------------
-- credit_refund — give back a debit that should not have been charged
--
--   'ok' | 'not_a_debit' | 'already_refunded' | 'lot_gone'
--
-- Puts the credits back into THE LOT THEY CAME FROM, not a fresh one, so a
-- refund cannot quietly extend the expiry date of credit bought a year ago.
--
-- Double-refund is prevented by the ledger's own (kind, reference) unique
-- index, with the refunded row's id as the reference — the check below is the
-- friendly path, the index is the guarantee.
--
-- This reverses a DEBIT. Clawing back a disputed PURCHASE is a different
-- operation with a different sign: use credit_admin_adjust with a negative
-- amount, which consumes FIFO and cannot drive the balance below zero.
-- ---------------------------------------------------------------------------
create or replace function public.credit_refund(
  p_ledger_id uuid,
  p_actor     uuid default null,
  p_note      text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  e      credit_ledger%rowtype;
  s      credit_settings%rowtype;
  v_bal  integer;
  v_amt  integer;
  v_room integer;
begin
  select * into e from credit_ledger where id = p_ledger_id;
  if not found or e.kind <> 'debit' then return 'not_a_debit'; end if;

  if exists (
    select 1 from credit_ledger
     where kind = 'refund' and reference = p_ledger_id::text
  ) then
    return 'already_refunded';
  end if;

  if e.lot_id is null then return 'lot_gone'; end if;

  select * into s from credit_settings where id = true;

  select balance into v_bal
    from credit_balances where user_id = e.user_id for update;

  -- credits is negative on a debit; the refund is its magnitude.
  v_amt := -e.credits;

  -- Never restore more than the lot can hold. If the lot has since been partly
  -- refilled by another refund, this clamps instead of violating the check.
  select credits_total - credits_remaining into v_room
    from credit_lots where id = e.lot_id for update;
  if v_room is null then return 'lot_gone'; end if;

  v_amt := least(v_amt, v_room);
  if v_amt <= 0 then return 'already_refunded'; end if;

  update credit_lots
     set credits_remaining = credits_remaining + v_amt
   where id = e.lot_id;

  insert into credit_ledger (
    user_id, kind, credits, balance_after,
    credit_usd_value_at, margin_multiplier_at,
    provider, model, tool_id, tool_slug, run_id, hold_id, lot_id,
    source, reference, note, actor_id
  ) values (
    e.user_id, 'refund', v_amt, v_bal + v_amt,
    -- The ORIGINAL charge's rate and margin, not today's. A refund restates a
    -- past movement; restating it at a new rate would make the pair fail to
    -- cancel out.
    e.credit_usd_value_at, e.margin_multiplier_at,
    e.provider, e.model, e.tool_id, e.tool_slug, e.run_id, e.hold_id, e.lot_id,
    'system', p_ledger_id::text, p_note, p_actor
  );

  update credit_balances
     set balance = v_bal + v_amt
   where user_id = e.user_id;

  return 'ok';
end $$;


-- ---------------------------------------------------------------------------
-- credit_admin_adjust — the manual correction, either direction
--
--   'ok' | 'insufficient' | 'invalid'
--
-- Does NOT check membership, unlike credit_topup: this is the tool for putting
-- something right, and "the member's subscription lapsed" is frequently the
-- exact situation being put right.
--
-- A positive adjustment opens a new lot dated from today. A negative one
-- consumes FIFO and is refused rather than clamped if it would exceed what is
-- available — an admin who meant to remove 500 from a balance of 300 has made a
-- mistake, and silently removing 300 hides it.
-- ---------------------------------------------------------------------------
create or replace function public.credit_admin_adjust(
  p_user_id uuid,
  p_credits integer,
  p_actor   uuid default null,
  p_note    text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  s         credit_settings%rowtype;
  v_bal     integer;
  v_held    integer;
  v_ledger  uuid;
  v_consumed integer;
begin
  if p_user_id is null or p_credits is null or p_credits = 0 then
    return 'invalid';
  end if;

  select * into s from credit_settings where id = true;

  insert into credit_balances (user_id) values (p_user_id)
    on conflict (user_id) do nothing;

  select balance, held into v_bal, v_held
    from credit_balances where user_id = p_user_id for update;

  if p_credits > 0 then
    insert into credit_ledger (
      user_id, kind, credits, balance_after,
      credit_usd_value_at, margin_multiplier_at,
      source, note, actor_id
    ) values (
      p_user_id, 'admin_adjustment', p_credits, v_bal + p_credits,
      s.credit_usd_value, s.margin_multiplier,
      'admin', p_note, p_actor
    ) returning id into v_ledger;

    insert into credit_lots (
      user_id, ledger_id, credits_total, credits_remaining, expires_at
    ) values (
      p_user_id, v_ledger, p_credits, p_credits,
      now() + make_interval(months => s.expiry_months)
    );

    update credit_balances set balance = v_bal + p_credits
     where user_id = p_user_id;

    return 'ok';
  end if;

  -- Negative: never below what is already reserved.
  if (v_bal - v_held) < (-p_credits) then
    return 'insufficient';
  end if;

  select consumed into v_consumed
    from public.credit_consume_fifo(
      p_user_id        => p_user_id,
      p_credits        => -p_credits,
      p_kind           => 'admin_adjustment',
      p_balance_before => v_bal,
      p_source         => 'admin',
      p_note           => p_note,
      p_actor          => p_actor
    );

  if v_consumed <> -p_credits then
    raise exception
      'credit drift: adjustment wanted % credits, lots yielded %',
      -p_credits, v_consumed;
  end if;

  update credit_balances set balance = v_bal - v_consumed
   where user_id = p_user_id;

  return 'ok';
end $$;


-- ---------------------------------------------------------------------------
-- Grants. These functions move money; only the backend may call them.
--
-- credit_available and credit_quote are internal too — see the note on
-- credit_available about why a member-callable version leaks other people's
-- balances. tool_access_mode (migration 3) reaches them as the definer, which
-- is why it works without a grant to authenticated.
-- ---------------------------------------------------------------------------
revoke all on function public.credit_available(uuid)                     from public, anon, authenticated;
revoke all on function public.credit_quote(numeric)                      from public, anon, authenticated;
revoke all on function public.credit_consume_fifo(uuid, integer, credit_entry_kind, integer, api_provider, text, numeric, uuid, text, uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.credit_topup(uuid, integer, text, text, text)          from public, anon, authenticated;
revoke all on function public.credit_hold_open(uuid, uuid, integer, uuid, integer)   from public, anon, authenticated;
revoke all on function public.credit_hold_settle(uuid, api_provider, text, numeric, uuid) from public, anon, authenticated;
revoke all on function public.credit_hold_release(uuid, text)            from public, anon, authenticated;
revoke all on function public.credit_holds_sweep()                       from public, anon, authenticated;
revoke all on function public.credit_lots_expire()                       from public, anon, authenticated;
revoke all on function public.credit_refund(uuid, uuid, text)            from public, anon, authenticated;
revoke all on function public.credit_admin_adjust(uuid, integer, uuid, text) from public, anon, authenticated;

grant execute on function public.credit_available(uuid)                  to service_role;
grant execute on function public.credit_quote(numeric)                   to service_role;
grant execute on function public.credit_topup(uuid, integer, text, text, text)        to service_role;
grant execute on function public.credit_hold_open(uuid, uuid, integer, uuid, integer) to service_role;
grant execute on function public.credit_hold_settle(uuid, api_provider, text, numeric, uuid) to service_role;
grant execute on function public.credit_hold_release(uuid, text)         to service_role;
grant execute on function public.credit_holds_sweep()                    to service_role;
grant execute on function public.credit_lots_expire()                    to service_role;
grant execute on function public.credit_refund(uuid, uuid, text)         to service_role;
grant execute on function public.credit_admin_adjust(uuid, integer, uuid, text) to service_role;


-- ---------------------------------------------------------------------------
-- Scheduled jobs. pg_cron is already installed by 20260716130000_runs.sql.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'credit-holds-sweep',
  '* * * * *',
  $$ select public.credit_holds_sweep() $$
);

select cron.schedule(
  'credit-lots-expire',
  -- Daily, off the hour. Nothing about expiry is urgent to the minute, and
  -- 03:17 keeps it clear of every other job that reaches for midnight.
  '17 3 * * *',
  $$ select public.credit_lots_expire() $$
);


-- ============================================================================
-- ROLLBACK
--
--   select cron.unschedule('credit-lots-expire');
--   select cron.unschedule('credit-holds-sweep');
--   drop function if exists public.credit_admin_adjust(uuid, integer, uuid, text);
--   drop function if exists public.credit_refund(uuid, uuid, text);
--   drop function if exists public.credit_lots_expire();
--   drop function if exists public.credit_holds_sweep();
--   drop function if exists public.credit_hold_release(uuid, text);
--   drop function if exists public.credit_hold_settle(uuid, api_provider, text, numeric, uuid);
--   drop function if exists public.credit_hold_open(uuid, uuid, integer, uuid, integer);
--   drop function if exists public.credit_topup(uuid, integer, text, text, text);
--   drop function if exists public.credit_consume_fifo(uuid, integer, credit_entry_kind, integer, api_provider, text, numeric, uuid, text, uuid, uuid, text, text, uuid);
--   drop function if exists public.credit_quote(numeric);
--   drop function if exists public.credit_available(uuid);
--
-- credit_available must go LAST of the read helpers and only AFTER migration 3
-- has been rolled back — tool_access_mode calls it.
-- ============================================================================
