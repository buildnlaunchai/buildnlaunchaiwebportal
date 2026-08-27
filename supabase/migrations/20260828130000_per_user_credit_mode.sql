-- ============================================================================
-- Credit mode becomes a per-member decision, without stopping being a switch.
--
-- WHY THIS HAS TO EXIST BEFORE ANYTHING IS SOLD. `credit_mode_enabled` is one
-- boolean for the whole product. Testing the credit path end to end therefore
-- means turning it on FOR EVERYBODY — and the day a top-up can be bought, that
-- is a real audience rather than one hand-granted test account. There is
-- currently no way to run a whole flow against a single member, which is the
-- one thing you want before taking money.
--
-- THREE STATES, NOT TWO, and the third is the one worth arguing for:
--
--   null   follow the global switch. Every row starts here and almost all stay.
--   true   credit mode for this member even when the switch is off. This is
--          what testing needs, and later what a staged rollout needs.
--   false  never credit mode for this member, even when the switch is on. A
--          lever worth having before wanting it: one abusive account, without
--          shutting the feature for everyone else.
--
-- WHY ON `profiles` AND NOT ON `credit_settings`. credit_settings is a singleton
-- by construction (`id boolean primary key check (id)`), so per-user data in it
-- means a uuid[] column: no foreign key, no record of who granted what, and one
-- row that grows forever. profiles is also where the access engine ALREADY
-- looks — tool_access_resolve reads is_suspended from it on every call — so the
-- column costs nothing to read on the hot path.
--
-- ONE RESOLUTION, IN ONE PLACE. `credit_mode_for()` is the only thing that
-- combines the two, and all three callers ask it rather than writing their own
-- coalesce. Three copies of a precedence rule is three chances to get it
-- backwards, and getting it backwards means either a member spending money
-- nobody authorised or a paying member locked out.
-- ============================================================================

alter table profiles
  add column if not exists credit_mode_override boolean;

comment on column profiles.credit_mode_override is
  'Per-member credit mode. NULL follows credit_settings.credit_mode_enabled; '
  'TRUE forces it on for this member even when the global switch is off; FALSE '
  'forces it off even when the switch is on. Resolved ONLY through '
  'credit_mode_for(). A member cannot write it: profiles grants UPDATE on three '
  'columns only (full_name, avatar_url, onboarded_at), so a new column is out of '
  'reach by construction, and guard_profile_privileges is the second lock behind '
  'that. A member who could set this could spend platform money on demand.';

-- ---------------------------------------------------------------------------
-- The resolution. Everything else defers to this.
-- ---------------------------------------------------------------------------
create or replace function public.credit_mode_for(uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select credit_mode_override from profiles where id = uid),
    (select credit_mode_enabled from credit_settings where id = true),
    false
  );
$$;

comment on function public.credit_mode_for(uuid) is
  'Is credit mode on FOR THIS MEMBER: their override if they have one, else the '
  'global switch, else false. The only place that precedence is written down.';

revoke all on function public.credit_mode_for(uuid) from public, anon;
grant execute on function public.credit_mode_for(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The guard. Restated in full, because a trigger function has no patch form.
--
-- §7 requires that a non-admin cannot set role or clear is_suspended on any row
-- including their own. This column joins them for the same reason and a sharper
-- one: role is a privilege, and this is a spending authority. A member who could
-- flip it would put every call they make on the platform's bill.
--
-- BE PRECISE ABOUT WHICH LOCK ACTUALLY STOPS THEM, because a comment that
-- overstates one is how the other gets removed as redundant. The FIRST lock is
-- the column grant: `authenticated` may UPDATE exactly full_name, avatar_url and
-- onboarded_at, so this column was unreachable the moment it was added — a
-- member's attempt fails with 42501 before any trigger runs. This guard is the
-- second lock, and it earns its place on the paths the grant does not cover: a
-- Server Action holding a wider role, or a future widening of that grant by
-- somebody who did not know what this column was.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;                          -- trusted server context. See above.
  end if;

  if public.is_admin(auth.uid()) then
    return new;                          -- admins may set all three, on any row.
  end if;

  if new.role is distinct from old.role then
    raise exception 'profiles.role is not self-serve'
      using errcode = 'insufficient_privilege';
  end if;

  if new.is_suspended is distinct from old.is_suspended then
    raise exception 'profiles.is_suspended is not self-serve'
      using errcode = 'insufficient_privilege';
  end if;

  -- Not a privilege in the role sense; an authority to spend somebody else's
  -- money. Same guard, and a worse consequence if it were missing.
  if new.credit_mode_override is distinct from old.credit_mode_override then
    raise exception 'profiles.credit_mode_override is not self-serve'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- The two functions that read the switch. Both restated in full and both
-- changed by exactly one line — the same reason 20260827150000 gives for
-- restating rather than patching: reading half a rule in one file and half in
-- another is how the two drift apart.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tool_access_resolve(p_tool_id uuid, uid uuid DEFAULT auth.uid())
 RETURNS tool_access_mode
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t          tools%rowtype;
  suspended  boolean;
begin
  if uid is null then return 'none'; end if;

  select * into t from tools where id = p_tool_id;
  if not found then return 'none'; end if;

  if t.status not in ('published', 'maintenance') then
    return case when public.is_admin(uid) then 'byok'::tool_access_mode
                else 'none'::tool_access_mode end;
  end if;

  select is_suspended into suspended from profiles where id = uid;
  if suspended is null then return 'none'; end if;
  if suspended then return 'none'; end if;

  if public.is_admin(uid) then return 'byok'; end if;

  if exists (
    select 1 from user_tool_access a
    where a.user_id = uid and a.tool_id = p_tool_id
      and (a.expires_at is null or a.expires_at > now())
  ) then
    return 'byok';
  end if;

  if t.access_type = 'public_preview' then
    return 'byok';
  end if;

  if public.has_active_membership(uid) then
    if t.access_type = 'members' then
      return 'byok';
    end if;

    if t.access_type = 'plan' then
      return case when exists (
        select 1
          from memberships m
          join plan_tools pt on pt.plan_id = m.plan_id
         where m.user_id = uid and pt.tool_id = p_tool_id
      ) then 'byok'::tool_access_mode else 'none'::tool_access_mode end;
    end if;

    return 'none';
  end if;

  -- ---- Lapsed. Credit opens exactly the tools that spend credit. ----------
  --
  -- No access_type condition, deliberately — see 20260827140000 for why tying
  -- this to 'members' would break silently when per-tool purchases arrive.
  --
  -- The kill switch is checked BEFORE the balance, so a disabled system costs
  -- one cheap read of a one-row table rather than a lookup per user.
  if t.consumes_credit
     and public.credit_mode_for(uid)
     and public.credit_available(uid) > 0
  then
    return 'credit';
  end if;

  return 'none';
end $function$;

CREATE OR REPLACE FUNCTION public.credit_hold_open(p_user_id uuid, p_tool_id uuid, p_max_credits integer, p_run_id uuid DEFAULT NULL::uuid, p_ttl_seconds integer DEFAULT 900)
 RETURNS TABLE(status text, hold_id uuid, available integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s        credit_settings%rowtype;
  v_bal    integer;
  v_held   integer;
  v_avail  integer;
  v_today  integer;
  v_open   integer;
  v_slug   text;
  v_hold   uuid;
begin
  hold_id := null;
  available := 0;

  if p_user_id is null or p_max_credits is null or p_max_credits <= 0 then
    status := 'invalid';
    return next;
    return;
  end if;

  select * into s from credit_settings where id = true;

  -- The kill switch, now per-member. First, cheap, and before any lock.
  if not public.credit_mode_for(p_user_id) then
    status := 'credit_mode_disabled';
    return next;
    return;
  end if;

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

  -- Concurrency, inside the lock. Dead holds do not count against a member.
  --
  -- ALIASED, and it has to be: this function's OUT parameter is called `status`,
  -- so an unqualified `status = 'open'` is ambiguous between the plpgsql
  -- variable and the column, and Postgres refuses the whole function at runtime.
  -- The same trap is waiting for anything else added here that touches a column
  -- named status, hold_id or available.
  select count(*) into v_open
    from credit_holds h
   where h.user_id = p_user_id
     and h.status = 'open'
     and h.expires_at > now();

  if v_open >= s.max_concurrent_holds then
    status := 'too_many_concurrent';
    return next;
    return;
  end if;

  -- Today's spend, UTC, plus everything currently reserved. See the note in
  -- 20260827130000 about why the outer `at time zone 'utc'` is load-bearing.
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
end $function$;


-- ---------------------------------------------------------------------------
-- credit_denial_reason asks the same question, so it asks the same function.
-- Restated in full for the same reason as the two above.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_denial_reason(p_tool_id uuid, uid uuid DEFAULT auth.uid())
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t          tools%rowtype;
  suspended  boolean;
begin
  -- Defer to the engine. Only a 'none' has anything to explain.
  if uid is null then return null; end if;
  if public.tool_access_resolve(p_tool_id, uid) <> 'none' then return null; end if;

  select * into t from tools where id = p_tool_id;
  if not found then return null; end if;
  if t.status not in ('published', 'maintenance') then return null; end if;

  -- A tool that does not spend credit can never be refused FOR credit reasons.
  if not t.consumes_credit then return null; end if;

  -- Suspension is its own answer and outranks everything, exactly as it does in
  -- tool_access_resolve. A suspended member must not be told to buy credit.
  select is_suspended into suspended from profiles where id = uid;
  if suspended is null or suspended then return null; end if;

  if public.is_admin(uid) then return null; end if;

  -- Still inside their membership: their 'none' is about the plan or the tool,
  -- nothing to do with credit.
  if public.has_active_membership(uid) then return null; end if;

  -- ---- The explanation is NOT ordered the way the engine is ---------------
  --
  -- tool_access_resolve checks the kill switch before the balance, and says why:
  -- "a disabled system costs one cheap read of a one-row table rather than a
  -- lookup per user". That is an argument about COST, and it is right for a
  -- function that only has to answer yes or no.
  --
  -- It is the wrong order for an explanation, and following it here produced a
  -- worse lie than the one this function was written to fix. With the switch
  -- off, EVERY lapsed member was told "credit mode is paused, nothing is wrong
  -- with your account" — including people who never bought a credit in their
  -- lives and whose membership simply ended. They would wait for a system they
  -- were never using to come back.
  --
  -- So the order here is by what the member can DO about it.

  -- Never held credit at all. The credit system is not their story; their
  -- membership is. Say nothing and let the ordinary reasons speak — a lapsed
  -- member hears "membership_inactive", which is exactly right for them.
  --
  -- `credit_lots` and not the balance, because the question is "was this ever a
  -- credit account", and a spent account has a balance of zero and a history.
  if not exists (select 1 from credit_lots where user_id = uid) then
    return null;
  end if;

  -- Past here they are a credit customer, and they were refused.

  -- Nothing they can do will help while the switch is off — not even topping up.
  -- So it outranks an empty balance for them, and only for them.
  if not public.credit_mode_for(uid) then
    return 'credit_mode_disabled';
  end if;

  -- The switch is on, so an empty balance is the whole of it, and topping up is
  -- a thing they can actually do.
  if public.credit_available(uid) <= 0 then
    return 'credit_exhausted';
  end if;

  -- The engine said 'none' for a reason this function does not know about.
  -- Returning null is correct: the caller falls back to its generic wall rather
  -- than inventing a cause.
  return null;
end $function$;


-- ---------------------------------------------------------------------------
-- Assert the precedence, rather than trusting three call sites to agree.
--
-- Run against a throwaway row so the check costs nothing and leaves nothing.
-- ---------------------------------------------------------------------------
do $$
declare
  v_global boolean;
  v_uid    uuid;
begin
  select credit_mode_enabled into v_global from credit_settings where id = true;

  -- Any real member will do; the override is what is under test, not the person.
  select id into v_uid from profiles limit 1;
  if v_uid is null then
    raise notice 'no profiles to test the override against; skipping';
    return;
  end if;

  if exists (select 1 from profiles where credit_mode_override is not null) then
    raise exception 'a credit_mode_override already exists; this migration expected none';
  end if;

  -- ── Everything below happens inside a subtransaction that is thrown away ──
  --
  -- The assertions have to WRITE the column to test it, and the only rows are
  -- real members. A migration that leaves somebody's updated_at moved as a side
  -- effect of proving something is a migration that lies a little about what it
  -- did. The block raises a marker at the end and swallows it, which rolls the
  -- writes back and leaves the assertions' verdicts intact — a real failure
  -- below is re-raised, because only the marker is caught.
  begin
    if public.credit_mode_for(v_uid) is distinct from coalesce(v_global, false) then
      raise exception 'null override did not follow the global switch';
    end if;

    update profiles set credit_mode_override = true where id = v_uid;
    if public.credit_mode_for(v_uid) is not true then
      raise exception 'override=true did not force credit mode on';
    end if;

    update profiles set credit_mode_override = false where id = v_uid;
    if public.credit_mode_for(v_uid) is not false then
      raise exception 'override=false did not force credit mode off';
    end if;

    update profiles set credit_mode_override = null where id = v_uid;
    if public.credit_mode_for(v_uid) is distinct from coalesce(v_global, false) then
      raise exception 'clearing the override did not restore the global answer';
    end if;

    -- And an unknown member is not quietly entitled.
    if public.credit_mode_for('00000000-0000-0000-0000-000000000000') is not false then
      raise exception 'a nonexistent user resolved to credit mode';
    end if;

    raise exception 'assertions_passed_rolling_back';
  exception
    when others then
      if sqlerrm <> 'assertions_passed_rolling_back' then
        raise;
      end if;
  end;

  -- Belt and braces: the rollback really happened.
  if exists (select 1 from profiles where credit_mode_override is not null) then
    raise exception 'the assertion block left an override behind';
  end if;

  raise notice 'credit_mode_for: precedence verified, nothing written';
end $$;

-- ---------------------------------------------------------------------------
-- Rollback:
--   -- restore the three functions from 20260827150000 / 20260828120000, then
--   alter table profiles drop column credit_mode_override;
--   drop function if exists public.credit_mode_for(uuid);
--   -- and drop the credit_mode_override branch from guard_profile_privileges.
-- ---------------------------------------------------------------------------
