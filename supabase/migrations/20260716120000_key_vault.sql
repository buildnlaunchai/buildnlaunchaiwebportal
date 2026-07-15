-- ============================================================================
-- Phase 5 — BYOK key vault.  (CLAUDE.md §6.8, §10)
--
-- The one asset that actually matters. Two structural guarantees, neither of
-- them a convention:
--   1. The client can never read ciphertext/iv/auth_tag — column-level GRANTs,
--      not "we remember to select the safe columns".
--   2. Plaintext is never in the database, never on Vercel — encryption happens
--      only inside the key-vault Edge Function, with ENCRYPTION_KEY from Supabase
--      secrets (§13).
-- ============================================================================

create type key_status as enum ('unverified', 'valid', 'invalid');

create table user_api_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  provider      api_provider not null,
  label         text,                       -- cosmetic only

  -- AES-256-GCM. Three columns, never one blob. Plaintext never touches the DB.
  ciphertext    text not null,              -- base64
  iv            text not null,              -- base64, unique per record
  auth_tag      text not null,              -- base64

  key_hint      text not null,              -- last 4 chars only, e.g. '••••a9F2'
  status        key_status not null default 'unverified',
  last_verified_at timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),

  -- ONE key per provider per user. NOT (user, provider, label): label is
  -- nullable and Postgres treats NULLs as distinct, so that would constrain
  -- nothing. Saving a second OpenAI key replaces the first (§10).
  unique (user_id, provider)
);

create index user_api_keys_user_idx on user_api_keys (user_id);

-- ---------------------------------------------------------------------------
-- Column privileges — THIS is what protects the ciphertext, not RLS.
--
-- RLS decides which ROWS you see; it says nothing about COLUMNS. A "select own"
-- policy alone would let a member read their own ciphertext, iv and auth_tag
-- straight from the browser with the anon key. So we revoke the table wholesale
-- and grant back ONLY the safe columns. Now the view below is honest AND the
-- direct-table path is closed — both doors, one lock.
-- ---------------------------------------------------------------------------
revoke all on user_api_keys from anon, authenticated;
grant select (id, user_id, provider, label, key_hint, status,
              last_verified_at, last_used_at, created_at)
  on user_api_keys to authenticated;

-- No insert/update/delete for any client role. Every write goes through the
-- key-vault Edge Function (service role) — because every write has to encrypt
-- first anyway, and that only happens where ENCRYPTION_KEY lives.

-- The client's read path. There is no route to ciphertext/iv/auth_tag from any
-- client role. security_invoker so the caller's "select own" RLS still applies.
create view user_api_keys_public with (security_invoker = true) as
  select id, user_id, provider, label, key_hint, status,
         last_verified_at, last_used_at, created_at
  from user_api_keys;

grant select on user_api_keys_public to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: a member sees only their own keys (and, via the grants above, only the
-- safe columns of them).
-- ---------------------------------------------------------------------------
alter table user_api_keys enable row level security;

create policy user_api_keys_select_own
  on user_api_keys for select to authenticated
  using (user_id = auth.uid());

-- Admin can see key METADATA (which providers a member connected), never the
-- key — the column grants deny ciphertext to every client role, admin included.
create policy user_api_keys_select_admin
  on user_api_keys for select to authenticated
  using (public.is_admin());

-- No insert/update/delete policies: writes are service-role only.

-- ---------------------------------------------------------------------------
-- Does this user hold every key a tool requires?
-- Accepts 'unverified' AND 'valid' — anything but 'invalid'. We do not block a
-- run on a key we merely haven't proven yet; a run is itself a verification.
-- ---------------------------------------------------------------------------
create or replace function public.has_required_keys(p_tool_id uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1
    from unnest((select required_providers from tools where id = p_tool_id)) as needed(provider)
    where not exists (
      select 1 from user_api_keys k
      where k.user_id = uid
        and k.provider = needed.provider
        and k.status <> 'invalid'
    )
  );
$$;
