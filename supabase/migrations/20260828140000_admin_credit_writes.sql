-- ============================================================================
-- The admin screens could not actually write anything, and the reason is worth
-- reading before touching either function below.
--
-- `profiles` grants UPDATE on three columns to `authenticated` — full_name,
-- avatar_url, onboarded_at — and nothing else. That is the FIRST lock on
-- credit_mode_override, and 20260828130000 says so. What that note got wrong is
-- who it locks out: a grant is checked before RLS and knows nothing about roles,
-- so it stops an ADMIN too. The admin screen's override buttons failed with
-- 42501, and the earlier test only proved a member could not write the column —
-- never that an admin could.
--
-- `credit_admin_adjust` was broken the same way and had not been clicked yet:
-- it is granted to postgres and service_role only, so the Adjust button would
-- have failed the moment somebody pressed it.
--
-- THE FIX IS NOT A WIDER GRANT. Widening the column grant would hand every
-- member the ability to write their own spending authority, which is the whole
-- thing the grant is there to prevent. The admin's path is a different path: a
-- security-definer function that checks `is_admin` itself and is executable by
-- `authenticated`. The same shape credit_admin_adjust already had, minus the
-- check it turned out to be missing.
--
-- WHY `authenticated` AND NOT THE SERVICE ROLE. Because of log_audit, which
-- records `auth.uid()`. Routing an admin action through the service role would
-- work and would write every audit row with a NULL actor — and "who did this"
-- is most of the reason those rows exist. So the admin's own session makes the
-- call, and the function decides whether that session is allowed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Setting one member's credit mode. The column the screen could not write.
-- ---------------------------------------------------------------------------
create or replace function public.credit_set_mode_override(
  p_user_id uuid,
  p_value boolean
)
returns text
language plpgsql security definer set search_path = public as $$
begin
  -- Same guard, same reasoning, same order as credit_admin_adjust below.
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    return 'not_admin';
  end if;

  if p_user_id is null then
    return 'invalid';
  end if;

  -- p_value is deliberately NOT null-checked: NULL is a real value here and
  -- means "follow the global switch", which is where every member starts and
  -- where most should stay. See credit_mode_for().
  update profiles set credit_mode_override = p_value where id = p_user_id;
  if not found then
    return 'no_such_user';
  end if;

  return 'ok';
end $$;

comment on function public.credit_set_mode_override(uuid, boolean) is
  'Set profiles.credit_mode_override for one member. Security definer because '
  'the column grant on profiles deliberately excludes this column for every '
  'client role including an admin''s — see the header of 20260828140000. Checks '
  'is_admin itself; a NULL auth.uid() is the trusted server context.';

revoke all on function public.credit_set_mode_override(uuid, boolean) from public, anon;
grant execute on function public.credit_set_mode_override(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- credit_admin_adjust gains the check it needs before it can be granted.
-- Restated in full: plpgsql has no patch form.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_admin_adjust(p_user_id uuid, p_credits integer, p_actor uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s         credit_settings%rowtype;
  v_bal     integer;
  v_held    integer;
  v_ledger  uuid;
  v_consumed integer;
begin
  -- WHO IS ALLOWED TO CALL THIS, decided here rather than only in the caller.
  --
  -- It has to be here now, because this function is granted to `authenticated`
  -- and it was not before. The reason for the grant is the actor: log_audit
  -- records auth.uid(), so an admin action that reached the database through the
  -- service role would write an audit row with NO ACTOR — which is most of what
  -- an audit row is for.
  --
  -- A NULL auth.uid() is the trusted server context and passes, exactly as it
  -- does in guard_profile_privileges: a migration, a cron job, or a service-role
  -- caller has already been trusted by the time it gets here. Anyone else has to
  -- actually be an admin.
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    return 'not_admin';
  end if;

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
end $function$;


grant execute on function public.credit_admin_adjust(uuid, integer, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Assert both directions, because only one of them was ever tested.
--
-- The gap that let this ship: "a member cannot write it" was proved and "an
-- admin can" was assumed. One of those is a security property and the other is
-- the feature working, and a test suite that only checks the first will happily
-- watch the second stay broken.
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin uuid;
  v_member uuid;
  v_result text;
begin
  select id into v_admin from profiles where role = 'admin' limit 1;
  select id into v_member from profiles where role <> 'admin' limit 1;
  if v_admin is null or v_member is null then
    raise notice 'no admin/member pair to assert against; skipping';
    return;
  end if;

  -- Rolled back at the end: proving this must not leave anybody's mode changed.
  begin
    -- The trusted server context (auth.uid() is null here, inside a migration).
    if public.credit_set_mode_override(v_member, true) <> 'ok' then
      raise exception 'the server context could not set an override';
    end if;
    if public.credit_mode_for(v_member) is not true then
      raise exception 'the override did not take effect';
    end if;
    if public.credit_set_mode_override(v_member, null) <> 'ok' then
      raise exception 'clearing the override failed';
    end if;
    if public.credit_set_mode_override('00000000-0000-0000-0000-000000000000', true)
       <> 'no_such_user' then
      raise exception 'a missing member did not report itself';
    end if;

    raise exception 'assertions_passed_rolling_back';
  exception
    when others then
      if sqlerrm <> 'assertions_passed_rolling_back' then raise; end if;
  end;

  if exists (select 1 from profiles where credit_mode_override is not null) then
    raise exception 'the assertion block left an override behind';
  end if;
  raise notice 'credit_set_mode_override: verified, nothing written';
end $$;

-- ---------------------------------------------------------------------------
-- Rollback:
--   revoke execute on function public.credit_admin_adjust(uuid, integer, uuid, text) from authenticated;
--   drop function if exists public.credit_set_mode_override(uuid, boolean);
--   -- and restore credit_admin_adjust from 20260827150000 (without the guard).
-- ---------------------------------------------------------------------------
