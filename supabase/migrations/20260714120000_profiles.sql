-- ============================================================================
-- Phase 1 — Profiles.  (CLAUDE.md §6.2, §7)
--
-- The first table in the product, so it sets the pattern for every table after
-- it: RLS on from birth, privileges enforced structurally, and helper functions
-- that take an explicit subject instead of quietly reading auth.uid().
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------------
-- "Applicant" is deliberately NOT a role. It is a member-role user with no
-- active membership — an absence, not a state. Two ways to spell one thing is
-- how you get a user who is somehow both a member and not one. (§2)
create type user_role as enum ('member', 'admin');

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text,
  avatar_url    text,
  role          user_role not null default 'member',
  is_suspended  boolean not null default false,
  referral_code text unique,               -- their own code to share
  referred_by   uuid references profiles(id),
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table profiles is
  'One row per auth.users row, created by the on_auth_user_created trigger. '
  'role and is_suspended are privileged columns: see guard_profile_privileges().';

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_touch_updated_at
  before update on profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create a profile on signup
-- ---------------------------------------------------------------------------
-- security definer: it writes to a table the new user has no insert policy on,
-- which is intentional. Nobody inserts into profiles from the client, ever.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, referral_code)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    ),
    new.raw_user_meta_data->>'avatar_url',
    upper(substr(md5(random()::text), 1, 8))
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- is_admin — TAKES A SUBJECT (§7)
-- ---------------------------------------------------------------------------
-- It does not read auth.uid() implicitly. A version that did would make
-- can_access_tool(tool, some_member) answer "is the CALLER an admin" rather
-- than "can THAT USER access this" — and would therefore return true for every
-- tool, for every member, whenever an admin was the one looking. A permission
-- check that is wrong only when an admin runs it is the worst kind of wrong.
--
-- security definer, so calling it from inside a profiles policy does not
-- re-enter profiles RLS and recurse. This is the classic Supabase footgun and
-- the reason this function exists at all.
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = uid
      and role = 'admin'
      and is_suspended = false          -- a suspended admin is not an admin
  );
$$;

-- ---------------------------------------------------------------------------
-- The privilege guard (§7)
-- ---------------------------------------------------------------------------
-- "A non-admin must never be able to set role = 'admin' on any row, including
-- their own."  Belt AND braces, because this is a privilege-escalation path and
-- one layer is not enough:
--
--   1. Column-level GRANTs below mean `authenticated` cannot write role or
--      is_suspended AT ALL — the database rejects the statement before RLS or
--      any trigger is consulted.
--   2. This trigger catches anything that gets past that, including a future
--      migration that carelessly re-grants the column.
--
-- Note the auth.uid() is null branch. A null uid means there is no end-user in
-- the request context: this is a migration, a superuser session in the SQL
-- editor, or the service-role client. Those are all trusted server contexts,
-- and the bootstrap admin promotion (below) is one of them. An anonymous
-- browser client also has a null uid, but it can never reach this trigger — the
-- RLS update policy requires id = auth.uid(), which no anon request satisfies.
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;                          -- trusted server context. See above.
  end if;

  if public.is_admin(auth.uid()) then
    return new;                          -- admins may set both, on any row.
  end if;

  if new.role is distinct from old.role then
    raise exception 'profiles.role is not self-serve'
      using errcode = 'insufficient_privilege';
  end if;

  if new.is_suspended is distinct from old.is_suspended then
    raise exception 'profiles.is_suspended is not self-serve'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;

create trigger profiles_guard_privileges
  before update on profiles
  for each row execute function public.guard_profile_privileges();

-- ---------------------------------------------------------------------------
-- Column privileges
-- ---------------------------------------------------------------------------
-- RLS grants ROWS. It says nothing about COLUMNS. An "update own row" policy
-- with no column grants would let a member PATCH their own role to 'admin'
-- straight from the browser console, and RLS would happily allow it — the row
-- is, after all, their own. So we revoke writes and grant back only the three
-- columns a member legitimately owns.
revoke update on profiles from anon, authenticated;
grant update (full_name, avatar_url, onboarded_at) on profiles to authenticated;

-- Nobody writes profiles directly. Rows are born in handle_new_user().
revoke insert, delete on profiles from anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;

create policy profiles_select_own
  on profiles for select
  to authenticated
  using (id = auth.uid());

create policy profiles_select_admin
  on profiles for select
  to authenticated
  using (public.is_admin());

create policy profiles_update_own
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_admin
  on profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No insert policy and no delete policy, for anyone. Deliberate.
-- A profile is created by the signup trigger and destroyed by the cascade from
-- auth.users. There is no third way, and there should not be one.

-- ---------------------------------------------------------------------------
-- Bootstrapping the first admin
-- ---------------------------------------------------------------------------
-- There is no ADMIN_BOOTSTRAP_EMAIL env var. Postgres cannot read Vercel's
-- environment, so the trigger could never have used it, and the guard above
-- would have blocked the promotion anyway.
--
-- Sign up like anyone else, then run this once, in the SQL editor, forever:
--
--     update profiles set role = 'admin' where email = 'you@example.com';
--
-- It runs as a superuser, so auth.uid() is null and the guard waves it through.
-- A trigger exception that fires once in the product's lifetime is not worth
-- the trigger exception.
