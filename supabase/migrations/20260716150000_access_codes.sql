-- ============================================================================
-- Phase 9 — Access codes + referrals.  (CLAUDE.md §6.9, §7)
--
-- CRITICAL: this is the one phase that grants access, and EVERY grant flows
-- through memberships / user_tool_access — the exact tables can_access_tool
-- reads. There is no side-channel. Redemption is a security-definer RPC called
-- only from a Server Action; members have NO insert path on access_codes,
-- redemptions, memberships, or user_tool_access, so a hand-crafted request can
-- never self-grant. This keeps the access engine the single source of truth,
-- which the future iframe-signed-token path depends on.
-- ============================================================================

create type code_kind as enum ('membership', 'tool_access');

create table access_codes (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  kind          code_kind not null default 'membership',
  plan_id       uuid references plans(id),
  tool_ids      uuid[],                       -- for kind = 'tool_access'
  duration_days integer,                      -- null = permanent
  max_uses      integer not null default 1,
  used_count    integer not null default 0,
  expires_at    timestamptz,
  note          text,                         -- 'For @creator on IG'
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);

create table access_code_redemptions (
  id          uuid primary key default gen_random_uuid(),
  code_id     uuid not null references access_codes(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (code_id, user_id)                   -- one redemption per user per code
);

-- ---------------------------------------------------------------------------
-- RLS. Members get NOTHING on access_codes (they redeem via the RPC). They may
-- see their OWN redemption history. Admin sees all. No client insert anywhere.
-- ---------------------------------------------------------------------------
alter table access_codes enable row level security;
create policy access_codes_all_admin
  on access_codes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table access_code_redemptions enable row level security;
create policy redemptions_select_own
  on access_code_redemptions for select to authenticated
  using (user_id = auth.uid());
create policy redemptions_all_admin
  on access_code_redemptions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Redeem — atomic (one function = one transaction). Validates, records the
-- redemption (the unique constraint blocks a double redeem), grants through
-- memberships / user_tool_access ONLY, and bumps used_count. security definer
-- because members have no direct write to any of these tables; auth.uid() is
-- the subject, never a client-supplied id.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_access_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  c         access_codes%rowtype;
  v_expires timestamptz;
  t         uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into c from access_codes where code = upper(trim(p_code));
  if not found then raise exception 'invalid code' using errcode = 'P0002'; end if;
  if c.expires_at is not null and c.expires_at < now() then
    raise exception 'code expired' using errcode = 'P0003';
  end if;
  if c.used_count >= c.max_uses then
    raise exception 'code fully used' using errcode = 'P0004';
  end if;

  -- Record the redemption; the unique (code_id, user_id) blocks re-redeeming.
  begin
    insert into access_code_redemptions (code_id, user_id) values (c.id, v_uid);
  exception when unique_violation then
    raise exception 'already redeemed' using errcode = 'P0005';
  end;

  v_expires := case
    when c.duration_days is not null then now() + make_interval(days => c.duration_days)
    else null
  end;

  if c.kind = 'membership' then
    insert into memberships (user_id, plan_id, status, source, started_at, expires_at)
    values (v_uid, c.plan_id, 'active', 'code', now(), v_expires)
    on conflict (user_id) do update
      set status = 'active', plan_id = excluded.plan_id, source = 'code',
          started_at = now(), expires_at = excluded.expires_at, updated_at = now();
  elsif c.kind = 'tool_access' then
    foreach t in array coalesce(c.tool_ids, '{}'::uuid[]) loop
      insert into user_tool_access (user_id, tool_id, source, expires_at)
      values (v_uid, t, 'code', v_expires)
      on conflict (user_id, tool_id) do update
        set expires_at = excluded.expires_at, source = 'code';
    end loop;
  end if;

  update access_codes set used_count = used_count + 1 where id = c.id;

  perform public.log_audit('code.redeem', 'access_code', c.id, v_uid,
    jsonb_build_object('kind', c.kind));

  return jsonb_build_object('kind', c.kind, 'expires_at', v_expires);
end $$;

-- ---------------------------------------------------------------------------
-- Referrals. profiles.referral_code (their code) and profiles.referred_by
-- already exist (§6.2). claim_referral attributes a new user to a referrer and,
-- once the referrer hits the threshold, auto-grants THEM a membership — again,
-- through the memberships table the engine reads. Attribution happens once
-- (only while referred_by is null) and never for self.
-- ---------------------------------------------------------------------------
create or replace function public.claim_referral(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_ref   uuid;
  v_by    uuid;
  v_count integer;
  v_grant boolean := false;
  threshold constant integer := 3;
begin
  if v_uid is null then return jsonb_build_object('claimed', false); end if;

  select referred_by into v_by from profiles where id = v_uid;
  if v_by is not null then return jsonb_build_object('claimed', false); end if; -- already attributed

  select id into v_ref from profiles
    where referral_code = upper(trim(p_code)) and id <> v_uid;
  if v_ref is null then return jsonb_build_object('claimed', false); end if;

  update profiles set referred_by = v_ref where id = v_uid;

  select count(*) into v_count from profiles where referred_by = v_ref;
  if v_count >= threshold and not public.has_active_membership(v_ref) then
    insert into memberships (user_id, status, source, started_at, is_gift, granted_by)
    values (v_ref, 'active', 'referral', now(), true, v_ref)
    on conflict (user_id) do nothing;
    v_grant := true;
  end if;

  return jsonb_build_object('claimed', true, 'referrer', v_ref, 'granted', v_grant, 'count', v_count);
end $$;
