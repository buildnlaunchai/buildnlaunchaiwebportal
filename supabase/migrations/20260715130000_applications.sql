-- ============================================================================
-- Phase 3 — Application funnel.  (CLAUDE.md §6.4, §6.12, §6.13)
--
-- You must be signed in to apply, a decision locked in the architecture review:
-- applications.user_id is NOT NULL, so an approved application always has an
-- account to attach a membership to (Phase 4), and the applicant can always see
-- their own status.
-- ============================================================================

create type application_status as enum ('pending', 'approved', 'waitlisted', 'rejected');

-- ---------------------------------------------------------------------------
-- 6.13  RATE LIMITS  (Postgres, not Redis — Vercel functions share no memory)
-- ---------------------------------------------------------------------------
create table rate_limit_hits (
  id         bigserial primary key,
  bucket     text not null,        -- 'apply:ip:203.0.113.4'
  created_at timestamptz not null default now()
);

create index rate_limit_hits_bucket_idx on rate_limit_hits (bucket, created_at desc);

-- Returns true if the caller is UNDER the limit, and records the hit. Atomic
-- enough for an abuse guard; we are not defending a bank vault.
create or replace function public.rate_limit_take(
  p_bucket text, p_limit integer, p_window interval
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  used integer;
begin
  delete from rate_limit_hits where created_at < now() - interval '24 hours';
  select count(*) into used
    from rate_limit_hits
   where bucket = p_bucket and created_at > now() - p_window;
  if used >= p_limit then
    return false;
  end if;
  insert into rate_limit_hits (bucket) values (p_bucket);
  return true;
end $$;

-- RLS on, zero policies → deny-all to clients. Only the service role and
-- rate_limit_take() (security definer) touch it.
alter table rate_limit_hits enable row level security;

-- ---------------------------------------------------------------------------
-- 6.12  APP_SETTINGS  (admin-editable singleton, no redeploy needed)
-- ---------------------------------------------------------------------------
create table app_settings (
  id                  boolean primary key default true check (id),  -- exactly one row
  applications_open   boolean not null default true,
  auto_approve        boolean not null default false,
  trial_days          integer not null default 0,
  default_plan_id     uuid references plans(id),
  skool_invite_url    text,
  discord_webhook_url text,    -- secret-ish: never exposed to a client. Read via service role.
  maintenance_mode    boolean not null default false,
  updated_at          timestamptz not null default now()
);

insert into app_settings (id) values (true);

create trigger app_settings_touch_updated_at
  before update on app_settings
  for each row execute function public.touch_updated_at();

alter table app_settings enable row level security;

create policy app_settings_all_admin
  on app_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- The public read path (§7: "select public fields only, via a view"). A default
-- (security-DEFINER) view: it runs as its owner, so it bypasses the admin-only
-- RLS above and exposes ONLY these two safe flags to everyone. discord_webhook_url
-- and the rest never leave the base table. This is the mirror image of
-- user_api_keys_public, which is security_invoker precisely because there we want
-- RLS to apply per-user.
create view app_settings_public as
  select applications_open, maintenance_mode
  from app_settings
  where id = true;

grant select on app_settings_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6.4  APPLICATIONS
-- ---------------------------------------------------------------------------
create table applications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  email          text not null,
  full_name      text not null,
  status         application_status not null default 'pending',

  -- qualification answers — this doubles as pricing + positioning research
  role_title     text,
  company        text,
  country        text,
  website_url    text,
  socials        text,
  use_case       text not null,          -- "what would you automate first?"
  tools_wanted   text[],                 -- tool slugs
  heard_from     text,                   -- youtube | linkedin | x | skool | referral | other
  referral_code  text,                   -- collected in Phase 9; column exists now
  willingness_to_pay text,               -- $0 | <$20 | $20-50 | $50-100 | $100+

  admin_note     text,
  reviewed_by    uuid references profiles(id),
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- One OPEN application per user. Keyed on user_id (not email) now that auth
-- comes first. A rejected/waitlisted user has no pending row, so this never
-- blocks a legitimate re-apply.
create unique index applications_one_open_per_user
  on applications (user_id) where status = 'pending';

create index applications_status_idx on applications (status, created_at desc);

alter table applications enable row level security;

-- Insert own: the RLS backstop. The Server Action (Turnstile + honeypot + rate
-- limit) is the front door, but even a hand-crafted request can only ever create
-- a row for yourself, and the unique index caps you at one pending application.
create policy applications_insert_own
  on applications for insert
  to authenticated
  with check (user_id = auth.uid());

create policy applications_select_own
  on applications for select
  to authenticated
  using (user_id = auth.uid());

create policy applications_all_admin
  on applications for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
