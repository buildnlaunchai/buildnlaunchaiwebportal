-- ============================================================================
-- Phase 4 — Membership + the access engine.  (CLAUDE.md §6.5, §6.11, §7)
--
-- is_admin(uid) already exists (Phase 1) and already takes a SUBJECT — the fix
-- from the architecture review. This migration adds has_active_membership and
-- the access engine, can_access_tool, which uses is_admin(uid) so that loading
-- /admin/users/[id] AS an admin answers "can THAT USER access this tool", not
-- "is the caller an admin" (which would return true for every tool).
-- ============================================================================

create type membership_status as enum ('trialing', 'active', 'expired', 'revoked');
-- No 'none': absence of a row IS "no membership". One spelling per state.

-- ---------------------------------------------------------------------------
-- 6.5  MEMBERSHIPS
-- ---------------------------------------------------------------------------
create table memberships (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references profiles(id) on delete cascade,
  plan_id       uuid references plans(id),
  status        membership_status not null,     -- no default; be explicit
  is_gift       boolean not null default false,
  granted_by    uuid references profiles(id),
  source        text,                            -- 'application' | 'gift' | 'code' | 'referral'
  started_at    timestamptz,
  expires_at    timestamptz,                     -- null = never expires
  provider              text,                    -- null for now; 'paddle' later
  provider_subscription_id text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index memberships_status_idx on memberships (status, expires_at);

create trigger memberships_touch_updated_at
  before update on memberships
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6.11  AUDIT LOG
-- ---------------------------------------------------------------------------
create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references profiles(id) on delete set null,
  action      text not null,             -- 'application.approve' | 'tool.grant' | ...
  entity_type text,
  entity_id   uuid,
  target_user uuid references profiles(id) on delete set null,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

create index audit_logs_created_idx on audit_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.has_active_membership(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.user_id = uid
      and m.status in ('active', 'trialing')
      and (m.expires_at is null or m.expires_at > now())
  );
$$;

-- THE access engine (§7). Answers exactly: "may `uid` OPEN this tool's runner?"
-- It does NOT check keys or the rate limit — the runner does that separately.
create or replace function public.can_access_tool(p_tool_id uuid, uid uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  t          tools%rowtype;
  suspended  boolean;
begin
  -- Anonymous is never granted anything. Explicit, not a coalesce() accident.
  if uid is null then return false; end if;

  select * into t from tools where id = p_tool_id;
  if not found then return false; end if;

  -- draft / archived: only an admin can even see the runner.
  if t.status not in ('published', 'maintenance') then
    return public.is_admin(uid);
  end if;

  select is_suspended into suspended from profiles where id = uid;
  if suspended is null then return false; end if;   -- no profile = not a user
  if suspended then return false; end if;           -- suspended beats everything

  if public.is_admin(uid) then return true; end if;

  -- explicit per-user grant always wins (this is lever 2)
  if exists (
    select 1 from user_tool_access a
    where a.user_id = uid and a.tool_id = p_tool_id
      and (a.expires_at is null or a.expires_at > now())
  ) then
    return true;
  end if;

  -- open to any signed-in user, membership or not
  if t.access_type = 'public_preview' then
    return true;                                     -- uid is non-null by here
  end if;

  if not public.has_active_membership(uid) then return false; end if;

  -- open to every active member (this is lever 1)
  if t.access_type = 'members' then
    return true;
  end if;

  -- included in the member's plan
  if t.access_type = 'plan' then
    return exists (
      select 1
      from memberships m
      join plan_tools pt on pt.plan_id = m.plan_id
      where m.user_id = uid and pt.tool_id = p_tool_id
    );
  end if;

  -- access_type = 'manual' and no explicit grant above
  return false;
end $$;

-- Every tool the user can access, as a set — so a page can resolve the whole
-- dashboard grid in one round trip instead of N calls to can_access_tool.
create or replace function public.accessible_tool_ids(uid uuid default auth.uid())
returns setof uuid language sql stable security definer set search_path = public as $$
  select t.id from tools t where public.can_access_tool(t.id, uid);
$$;

-- Audit insert path (§7: "inserts go through a security definer log_audit()").
-- No role needs a direct insert grant on audit_logs.
create or replace function public.log_audit(
  p_action text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_target_user uuid default null,
  p_metadata jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs (actor_id, action, entity_type, entity_id, target_user, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_target_user, p_metadata);
end $$;

-- ---------------------------------------------------------------------------
-- Approve an application → membership, atomically (one action).
-- security definer + an internal is_admin(auth.uid()) check: the whole thing is
-- one transaction, so we never get a half-approved user (status set but no
-- membership). Creating the membership is what grants access to every `members`
-- tool — that is the tool-granting effect. Per-user `manual` grants are made
-- separately in the access matrix.
-- ---------------------------------------------------------------------------
create or replace function public.approve_application(
  p_application_id uuid,
  p_expires_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_app     applications%rowtype;
  v_plan_id uuid;
  v_uid     uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  select * into v_app from applications where id = p_application_id;
  if not found then
    raise exception 'application not found';
  end if;
  v_uid := v_app.user_id;

  -- Default plan: the app-wide setting, else the plan flagged is_default.
  select coalesce(
           (select default_plan_id from app_settings where id = true),
           (select id from plans where is_default order by sort_order limit 1)
         ) into v_plan_id;

  update applications
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_application_id;

  -- One membership per user (unique user_id). Re-approving refreshes it.
  insert into memberships (user_id, plan_id, status, source, granted_by, started_at, expires_at)
  values (v_uid, v_plan_id, 'active', 'application', auth.uid(), now(), p_expires_at)
  on conflict (user_id) do update
     set plan_id = excluded.plan_id,
         status = 'active',
         source = 'application',
         granted_by = auth.uid(),
         started_at = now(),
         expires_at = excluded.expires_at,
         updated_at = now();

  perform public.log_audit(
    'application.approve', 'application', p_application_id, v_uid,
    jsonb_build_object('plan_id', v_plan_id, 'expires_at', p_expires_at)
  );

  return v_uid;
end $$;

-- ===========================================================================
-- RLS
-- ===========================================================================

-- ---- memberships ----------------------------------------------------------
alter table memberships enable row level security;

create policy memberships_select_own
  on memberships for select to authenticated
  using (user_id = auth.uid());

create policy memberships_all_admin
  on memberships for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---- audit_logs -----------------------------------------------------------
alter table audit_logs enable row level security;

create policy audit_logs_select_admin
  on audit_logs for select to authenticated
  using (public.is_admin());
-- No insert policy: writes go through log_audit() (security definer).
