-- ============================================================================
-- Key-release consent, generalised beyond the desktop app.
--
-- A second external client is arriving — the UpworkPilot Chrome extension — and
-- it needs exactly what the desktop app needs: an entitlement check, and a
-- consent-gated release of the member's own provider key. Everything about that
-- mechanism is already general EXCEPT its names.
--
-- THE STRUCTURE IS ALREADY RIGHT, AND THAT IS THE WHOLE POINT OF THIS FILE.
-- desktop_key_consent and desktop_key_access were both keyed
-- (user_id, tool_id, provider) from the day they were written, and
-- has_desktop_consent already took p_tool_id as an explicit subject. A second
-- client is therefore a second `tools` row and nothing else. This migration
-- changes NO columns, NO keys, NO policies, NO grants and NO data. It renames,
-- and it seeds one tool.
--
-- WHY RENAME AT ALL, given the tables work exactly as they are. Because these
-- names are about to start lying, and one of them is the trail a MEMBER reads:
-- "your OpenAI key was read on the 3rd" out of a table called
-- desktop_key_access, for something that is not a desktop app. tool_secrets kept
-- a name that had drifted (§6.6b's "honest note on the name") and that was the
-- right call there — the name was still approximately true. This one would not
-- be, and it is member-facing.
--
-- WHY NOW, rather than after the extension ships. Renaming with one live client
-- costs one coordinated deploy. Renaming with two costs two — and the second of
-- those is a shipped desktop binary that cannot be updated retroactively. The
-- cheapest moment to do this is the last moment before there are two.
--
-- ⚠️  THIS MIGRATION AND ITS CODE MUST LAND TOGETHER.
--     The PostgREST table names change, so lib/desktop.ts, actions/desktop.ts
--     and supabase/functions/desktop-keys/index.ts all break the moment it
--     applies, and stay broken until they are deployed. Apply this immediately
--     before deploying the code that follows it, not days ahead.
--
--     The ONE exception is the RPC, which keeps a compatibility shim in §3 so
--     that the Edge Function specifically does not have to be redeployed in the
--     same minute.
--
--     Nothing here is half-appliable: Postgres DDL is transactional, so if any
--     rename below fails on a name mismatch the entire migration rolls back and
--     the database is untouched. A loud failure, never a half-renamed schema.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. desktop_key_consent -> key_release_consent
--
-- The consent gate itself: may client X read provider P's key for member M.
-- The new name says what the row authorises (releasing a key off this server)
-- rather than who it happens to be authorised for today.
--
-- Constraints and indexes are renamed alongside the table. That is cosmetic —
-- Postgres does not care — but a table called key_release_consent whose primary
-- key is still called desktop_key_consent_pkey is exactly the half-rename that
-- misleads the next person to read \d. Renaming an index-backed constraint
-- renames its index too, so the two _pkey/_key lines below cover both.
-- ---------------------------------------------------------------------------
alter table desktop_key_consent rename to key_release_consent;

alter table key_release_consent
  rename constraint desktop_key_consent_pkey to key_release_consent_pkey;
alter table key_release_consent
  rename constraint desktop_key_consent_user_id_tool_id_provider_key
                 to key_release_consent_user_id_tool_id_provider_key;
alter table key_release_consent
  rename constraint desktop_key_consent_user_id_fkey to key_release_consent_user_id_fkey;
alter table key_release_consent
  rename constraint desktop_key_consent_tool_id_fkey to key_release_consent_tool_id_fkey;

alter index desktop_key_consent_user_idx rename to key_release_consent_user_idx;

-- Policies are unchanged in substance: select-own, plus select-for-admin. There
-- is still NO insert/update/delete policy for any client role, deliberately —
-- consent is written by a Server Action on the service-role client, because a
-- browser that can write its own consent row is not a consent gate.
alter policy desktop_key_consent_select_own
  on key_release_consent rename to key_release_consent_select_own;
alter policy desktop_key_consent_select_admin
  on key_release_consent rename to key_release_consent_select_admin;


-- ---------------------------------------------------------------------------
-- 2. desktop_key_access -> key_release_log
--
-- "access" was always slightly off — the row records a RELEASE that happened,
-- not an access right. "log" says it is a history, which is how the member's
-- screen reads it back to them.
--
-- Still not audit_logs, for the three reasons the original migration gave:
-- audit_logs is admin-select-only, log_audit() derives actor_id from auth.uid()
-- (NULL under the service role an Edge Function uses), and this is the member's
-- record rather than the admin's.
-- ---------------------------------------------------------------------------
alter table desktop_key_access rename to key_release_log;

alter table key_release_log
  rename constraint desktop_key_access_pkey to key_release_log_pkey;
alter table key_release_log
  rename constraint desktop_key_access_user_id_fkey to key_release_log_user_id_fkey;
alter table key_release_log
  rename constraint desktop_key_access_tool_id_fkey to key_release_log_tool_id_fkey;

alter index desktop_key_access_user_idx rename to key_release_log_user_idx;

alter policy desktop_key_access_select_own
  on key_release_log rename to key_release_log_select_own;
alter policy desktop_key_access_select_admin
  on key_release_log rename to key_release_log_select_admin;


-- ---------------------------------------------------------------------------
-- 3. has_desktop_consent -> has_key_release_consent, plus a shim.
--
-- The body is copied verbatim except for the table name. Same signature, same
-- security definer, same explicit `uid` subject — passing uid matters because
-- the Edge Function calls this with the service role, where an implicit
-- auth.uid() is NULL and every check would silently answer "no consent" (§7's
-- footgun, in the fail-closed direction).
--
-- A `language sql` function stores its body as text and resolves names at call
-- time, so the rename in §1 would have broken the old function outright. It is
-- therefore recreated rather than renamed.
-- ---------------------------------------------------------------------------
create or replace function public.has_key_release_consent(
  p_tool_id uuid, p_provider api_provider, uid uuid default auth.uid()
) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from key_release_consent c
    where c.user_id = uid
      and c.tool_id = p_tool_id
      and c.provider = p_provider
      and c.revoked_at is null
  );
$$;

-- ⚠️  DEPRECATED SHIM — DELETE ONCE desktop-keys HAS BEEN REDEPLOYED.
--
-- supabase/functions/desktop-keys/index.ts calls has_desktop_consent by name,
-- and it is live. Without this wrapper, the window between `db push` and
-- `supabase functions deploy` is a window in which that RPC does not exist —
-- and because the function destructures only `data` and never `error`, a missing
-- RPC resolves to undefined, which reads as `consent_required`. It fails CLOSED,
-- which is the right direction, but it would tell every member with a live
-- consent that they must go and grant it again. That is an alarming, wrong
-- sentence to show somebody about their own API key.
--
-- Eight lines buys the ordering constraint away entirely. Drop it in the
-- migration that follows the Edge Function deploy — it has exactly one caller
-- and that caller is ours.
create or replace function public.has_desktop_consent(
  p_tool_id uuid, p_provider api_provider, uid uuid default auth.uid()
) returns boolean language sql stable security definer set search_path = public as $$
  select public.has_key_release_consent(p_tool_id, p_provider, uid);
$$;


-- ---------------------------------------------------------------------------
-- 4. The UpworkPilot tool row.
--
-- runtime = 'external_link', for the same reasons the desktop app is one, which
-- are worth restating because they are not obvious: adding a value to
-- tool_runtime is not free (Postgres forbids USING a new enum value in the
-- transaction that adds it, and the CLI wraps each migration file in one), it
-- would need regenerated database.types.ts and new branches in tool-editor.tsx
-- and catalog-card.tsx — and it would buy nothing, because NOTHING in the
-- licence or key path reads `runtime` at all. Both functions gate on slug plus
-- can_access_tool. From the hub's side this tool genuinely is a link out to
-- something you install; that it installs into a browser rather than an OS is
-- not a distinction this column exists to make.
--
-- access_type = 'members', NOT 'manual'. can_access_tool checks an explicit
-- user_tool_access grant BEFORE the membership check, so a manual grant outlives
-- a lapsed membership. That is right for gifting a tool and wrong for a licence.
-- The admin matrix can still override per-user when a gift IS the intent.
--
-- status = 'draft' until the extension is actually in the Chrome Web Store.
-- can_access_tool returns is_admin(uid) for a draft tool, so the whole path —
-- licence, consent, key release — is testable end to end as the admin, while
-- being invisible to every member and to the public catalog (RLS restricts
-- anon/member reads to published/coming_soon/maintenance).
--
-- ⚠️  THE COPY BELOW IS DELIBERATELY MECHANICAL, NOT PROMOTIONAL. It describes
--     how the extension relates to this account and to the key vault, which is
--     what is actually known and what is actually true. It claims no features.
--     Write the real tagline and description in the admin tool editor before
--     flipping status to 'published' — copy is data (§3) and needs no migration.
--     `icon` and `category` are one-click edits in the same place; `sparkles` is
--     a placeholder chosen from the curated allow-list in
--     components/tools/tool-icon.tsx (an unknown name silently degrades to Box).
-- ---------------------------------------------------------------------------
insert into tools
  (slug, name, tagline, description, category, icon, status, access_type,
   runtime, required_providers, version, sort_order)
values
  ('upworkpilot',
   'UpworkPilot',
   'A Chrome extension for Upwork that runs on your own OpenAI key.',
   E'Signs in with your Build & Launch account and runs on your own OpenAI key, which it reads from your key vault only after you have explicitly allowed it — per provider, revocable at any time, and every read is listed where you can see it.\n\nThe key is held in the extension''s service worker memory only, for as long as it is working, and is never written to browser storage.',
   'outreach', 'sparkles', 'draft', 'members',
   'external_link', '{openai}', '0.1.0', 50)
on conflict (slug) do nothing;

-- Runtime config lives in tool_secrets, never on the publicly-readable `tools`
-- row (§6.6b) — there is nothing secret in a store listing, but all runtime
-- config has exactly one home so that `select * from tools` can never be a
-- mistake.
--
-- Pointed at the hub's own tool page rather than straight at the Chrome Web
-- Store, matching the desktop row. The listing URL is not known yet (the
-- extension is unpublished), and the hub page is the honest destination anyway:
-- it is where a member goes to get the thing, and it can link onward to the
-- store without another migration.
insert into tool_secrets (tool_id, external_url)
select id, 'https://buildnlaunchai.com/tools/upworkpilot'
from tools where slug = 'upworkpilot'
on conflict (tool_id) do nothing;
