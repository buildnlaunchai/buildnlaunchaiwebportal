-- ============================================================================
-- The credit gets 100x finer, and the margin goes 1.3 -> 1.6.
--
--   credit_usd_value            $0.01    ->  $0.0001
--   margin_multiplier            1.3     ->   1.6
--   per_call_max_credits          500    ->   50,000     (same $5.00)
--   per_user_daily_max_credits  3,000    ->  300,000     (same $30.00)
--
-- WHY FINER. credit_quote is greatest(1, ceil(cost x margin / rate)), and that
-- floor binds below `rate / margin` of provider cost — $0.0077 at the old scale.
-- Almost every real call is cheaper than that, so almost every call was billed
-- one whole credit whatever it actually cost. Measured against the live
-- providers on 2026-08-27:
--
--   chat, 10 in / 2 out       cost $0.0000027  billed $0.01   = 3,704x
--   responses, 9 in / 6 out   cost $0.0000090  billed $0.01   = 1,111x
--   a real UpworkPilot proposal (800 in / 400 out, gpt-4o-mini)
--                             cost $0.00036    billed $0.01   =    28x
--
-- At $0.0001 the floor binds below $0.0000625, which no real call reaches, so
-- the bill is the margin instead of the rounding. That same proposal now costs
-- 6 credits — $0.0006, 1.67x — and a member stops watching their balance fall
-- for work that cost a fraction of a cent.
--
-- WHY 1.6. Creem charges 3.9% + $0.40 per transaction, and the fixed $0.40 is
-- brutal on a small package — 8% of a $5 one. At 1.3 a fully-spent $5 package
-- returned $0.56, 11%, which one refund or one provider price rise erases. At
-- 1.6 it returns $1.28, 26%, and $20/$50 land near 32%.
--
-- ---------------------------------------------------------------------------
-- READ THIS BEFORE EVER CHANGING credit_usd_value AGAIN
-- ---------------------------------------------------------------------------
-- The ledger freezes its own arithmetic: every credit_ledger row carries
-- credit_usd_value_at and margin_multiplier_at, so a historical row keeps
-- meaning exactly what it meant. That design is sound and it is why old rows
-- need no attention here.
--
-- BALANCES ARE NOT FROZEN. credit_balances.balance, credit_balances.held,
-- credit_lots.credits_total / credits_remaining and credit_holds.max_credits are
-- bare integers with no rate attached. They are worth whatever
-- credit_settings.credit_usd_value says TODAY. So changing the rate without
-- touching them silently revalues every credit anybody is holding — at 100x
-- finer, a member sitting on $5 of credit wakes up holding $0.05.
--
-- There was a real balance when this ran: 500 credits, granted by hand as
-- "gateway test account — step 3". Small, and ours — but the rule does not care
-- whose it is, and the next person to change the rate will not have checked.
-- Hence the scaling below, derived from the ratio of old rate to new rather than
-- hardcoded, so it stays correct for whatever the next change is and becomes a
-- no-op if the rate is already where it should be.
--
-- OPEN HOLDS ARE SCALED FOR A SHARPER REASON. A hold opened before this
-- migration and settled after it would be measured against the new rate by
-- credit_hold_settle, quote 100x more credits than the hold reserved, cap at the
-- hold, and hand us the difference. Scaling live holds closes that window.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Precision, before anything starts writing at the new scale.
--
-- numeric(14,6) rounded a cost to the nearest microdollar, which was tolerable
-- when one credit was $0.01 and became silly when one credit is $0.0001: a
-- $0.0000027 call was recorded as $0.000003, an 11% error in the only column a
-- margin report can read. numeric(20,12) is what provider_model_prices already
-- uses, so cost and rate now carry the same precision. Widening only — no value
-- can be lost.
-- ---------------------------------------------------------------------------
alter table credit_ledger
  alter column provider_cost_usd type numeric(20,12);

comment on column credit_ledger.provider_cost_usd is
  'What the call cost US, before margin, at full price-table precision. '
  'numeric(20,12) deliberately matches provider_model_prices.input_usd_per_unit: '
  'a per-token rate of 1.5e-7 rounded to six places is most of the value gone, '
  'and this column is what any margin report is summing.';

-- ---------------------------------------------------------------------------
-- 2. The defaults, so a fresh database is born at the new scale.
--
-- The row below is what production reads; these defaults are what a `db reset`,
-- a new branch, or a preview environment reads. Changing one and not the other
-- is how a staging environment quietly bills at 100x the production rate.
-- ---------------------------------------------------------------------------
alter table credit_settings
  alter column credit_usd_value           set default 0.0001,
  alter column margin_multiplier          set default 1.6,
  alter column per_call_max_credits       set default 50000,
  alter column per_user_daily_max_credits set default 300000;

-- ---------------------------------------------------------------------------
-- 3. The live row, and the scaling of everything denominated in credits.
--
-- ONE UPDATE for the two caps, not two: `per_call_within_daily` checks
-- per_call_max_credits <= per_user_daily_max_credits, and raising per_call to
-- 50,000 while daily is still 3,000 fails that check. A single statement is
-- evaluated once, at the end, with both values already in place.
-- ---------------------------------------------------------------------------
do $$
declare
  v_old_rate numeric;
  v_new_rate constant numeric := 0.0001;
  v_factor   integer;
  b          record;
  v_before   integer;
  v_rows     integer := 0;
begin
  select credit_usd_value into v_old_rate from credit_settings where id = true;

  if v_old_rate is null then
    raise exception 'credit_settings has no row — nothing to rescale';
  end if;

  -- Derived, never hardcoded. A whole number is required: a fractional rescale
  -- would round somebody's balance, and deciding who loses the remainder is a
  -- judgement call, not something a migration gets to make quietly.
  if (v_old_rate / v_new_rate) <> round(v_old_rate / v_new_rate) then
    raise exception
      'rate change %  ->  % is not a whole-number factor (%). Rescaling balances '
      'would round real credit. Decide the rounding rule first.',
      v_old_rate, v_new_rate, v_old_rate / v_new_rate;
  end if;

  v_factor := round(v_old_rate / v_new_rate)::integer;
  raise notice 'credit rescale: 1 credit % -> %, factor %', v_old_rate, v_new_rate, v_factor;

  update credit_settings
     set credit_usd_value           = v_new_rate,
         margin_multiplier          = 1.6,
         per_call_max_credits       = 50000,
         per_user_daily_max_credits = 300000,
         updated_at                 = now()
   where id = true;

  -- Already at the target scale: the settings above are still worth writing
  -- (margin and caps may differ), but there is nothing to revalue and no
  -- adjustment row to justify.
  if v_factor = 1 then
    raise notice 'credit rescale: factor is 1, no balances revalued';
    return;
  end if;

  -- Lots first. Scaling in place is deliberate: a lot carries an expiry, and
  -- issuing the extra credits as a NEW lot would hand them a fresh 12 months the
  -- member never paid for. The credits are the same credits, only finer.
  update credit_lots
     set credits_total     = credits_total * v_factor,
         credits_remaining = credits_remaining * v_factor;

  -- Live holds. See the header: without this, an in-flight call settles against
  -- a reservation worth a hundredth of what it was.
  update credit_holds
     set max_credits = max_credits * v_factor
   where status = 'open';

  -- Balances, and a ledger row for each so the audit chain stays continuous.
  -- credit_ledger is append-only by trigger, which is exactly right: history is
  -- not edited, a correcting row is written. The row is stamped with the NEW
  -- rate because that is the scale it lands in.
  for b in select user_id, balance, held from credit_balances loop
    v_before := b.balance;

    update credit_balances
       set balance = balance * v_factor,
           held    = held * v_factor
     where user_id = b.user_id;

    if v_before <> 0 then
      insert into credit_ledger (
        user_id, kind, credits, balance_after,
        credit_usd_value_at, margin_multiplier_at, source, note
      ) values (
        b.user_id,
        'admin_adjustment',
        (v_before * v_factor) - v_before,
        v_before * v_factor,
        v_new_rate,
        1.6,
        'migration',
        format(
          'Credit rescale 20260827180000: 1 credit %s -> %s. Balance multiplied '
          'by %s so its cash value is unchanged (%s credits was, and still is, '
          'the same money). Not a grant.',
          v_old_rate, v_new_rate, v_factor, v_before
        )
      );
      v_rows := v_rows + 1;
    end if;
  end loop;

  raise notice 'credit rescale: % balance(s) revalued and recorded', v_rows;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Assert what we just claimed, rather than trusting it.
-- ---------------------------------------------------------------------------
do $$
declare
  s credit_settings%rowtype;
begin
  select * into s from credit_settings where id = true;

  if s.credit_usd_value <> 0.0001 then
    raise exception 'credit_usd_value is %, expected 0.0001', s.credit_usd_value;
  end if;
  if s.margin_multiplier <> 1.6 then
    raise exception 'margin_multiplier is %, expected 1.6', s.margin_multiplier;
  end if;
  if s.per_call_max_credits <> 50000 or s.per_user_daily_max_credits <> 300000 then
    raise exception 'caps are % / %, expected 50000 / 300000',
      s.per_call_max_credits, s.per_user_daily_max_credits;
  end if;

  -- The floor must no longer be what sets the price of a real call. A real
  -- UpworkPilot proposal costs about $0.00036; if that still quotes 1 credit,
  -- the rescale did not achieve the thing it was for.
  if public.credit_quote(0.00036) <= 1 then
    raise exception
      'a real proposal still quotes % credit(s) — the floor is still binding',
      public.credit_quote(0.00036);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Rollback, if it comes to that. Note the balance scaling has to be undone in
-- the same breath, or the revaluation happens a second time in reverse:
--
--   update credit_lots set credits_total = credits_total / 100,
--                          credits_remaining = credits_remaining / 100;
--   update credit_holds set max_credits = max_credits / 100 where status='open';
--   update credit_balances set balance = balance / 100, held = held / 100;
--   update credit_settings set credit_usd_value = 0.01, margin_multiplier = 1.3,
--          per_call_max_credits = 500, per_user_daily_max_credits = 3000
--    where id = true;
--   alter table credit_settings
--     alter column credit_usd_value set default 0.01,
--     alter column margin_multiplier set default 1.3,
--     alter column per_call_max_credits set default 500,
--     alter column per_user_daily_max_credits set default 3000;
--   -- and write a correcting ledger row; do not delete the one above.
-- ---------------------------------------------------------------------------
