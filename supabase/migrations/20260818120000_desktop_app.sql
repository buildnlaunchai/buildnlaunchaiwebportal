-- ============================================================================
-- Desktop app backend — "Raw Footage, Real Story".
--
-- A separate desktop product authenticates against this project's Supabase Auth
-- and needs two things from the hub: (1) is this user's membership active, and
-- (2) their own OpenAI/ElevenLabs keys out of the BYOK vault.
--
-- No new entitlement store. `memberships` is already the source of truth, and
-- the desktop app is registered as a `tools` row so BOTH questions resolve
-- through the one access engine (can_access_tool) that every other surface uses
-- — §7's "every read and every run must go through this". embed-token set this
-- precedent for the iframe apps; this follows it.
--
-- What IS new, and is the reason this migration is not just a seed row:
-- releasing a decrypted key to a binary on the member's machine is a genuine
-- widening of §13. It gets an explicit, revocable, per-provider consent gate and
-- a member-visible read log. Neither existed before because nothing before this
-- ever handed a plaintext key to anything but a handler we wrote.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The tool row.
--
-- runtime = 'external_link' rather than a new 'desktop' enum value. Adding a
-- value to tool_runtime is not free: Postgres forbids USING a new enum value in
-- the same transaction that adds it, and the CLI wraps each migration file in
-- one — so it would need a two-file split, regenerated database.types.ts, and a
-- branch in tool-editor.tsx and catalog-card.tsx. 'external_link' needs none of
-- that and is honest: from the hub's side this tool IS a link out to a product
-- you install. The desktop functions gate on slug + can_access_tool, neither of
-- which reads `runtime`.
--
-- access_type = 'members' — resolves to "any user with an ACTIVE membership",
-- which is exactly the licence semantics wanted. Deliberately NOT 'manual':
-- can_access_tool checks an explicit user_tool_access grant BEFORE the
-- membership check, so a manual grant outlives a lapsed membership. That is
-- right for gifting a tool and wrong for a licence. Per-user grants still work
-- as an override from the admin matrix when a gift IS the intent.
-- ---------------------------------------------------------------------------
insert into tools
  (slug, name, tagline, description, category, icon, status, access_type,
   runtime, required_providers, version, sort_order, launched_at)
values
  ('raw-footage-real-story',
   'Raw Footage, Real Story',
   'Turn raw footage into a story-shaped edit, on your machine.',
   E'A desktop app that reads your raw footage locally and drafts the story — pacing, beats, and a narration pass — without uploading your media anywhere.\n\nIt signs in with your Build & Launch account and runs on your own OpenAI and ElevenLabs keys, which it reads from your key vault only after you allow it, per provider. You can revoke that at any time from the vault.',
   'video', 'clapperboard', 'published', 'members',
   'external_link', '{openai,elevenlabs}', '1.0.0', 40, now())
on conflict (slug) do nothing;

-- Runtime config lives in tool_secrets, never on the publicly-readable `tools`
-- row (§6.6b). external_url is the product/download page.
insert into tool_secrets (tool_id, external_url)
select id, 'https://buildnlaunchai.com/tools/raw-footage-real-story'
from tools where slug = 'raw-footage-real-story'
on conflict (tool_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Consent — the gate on releasing a decrypted key to a desktop app.
--
-- Per (user, tool, provider), so allowing the app to read OpenAI is not also
-- allowing it to read ElevenLabs. Revocation is a timestamp rather than a
-- delete: "you allowed this on the 3rd and revoked it on the 9th" is a fact the
-- member should be able to see, and a deleted row cannot tell them that.
-- ---------------------------------------------------------------------------
create table desktop_key_consent (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  tool_id    uuid not null references tools(id) on delete cascade,
  provider   api_provider not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, tool_id, provider)
);

create index desktop_key_consent_user_idx on desktop_key_consent (user_id);

alter table desktop_key_consent enable row level security;

create policy desktop_key_consent_select_own
  on desktop_key_consent for select to authenticated
  using (user_id = auth.uid());

create policy desktop_key_consent_select_admin
  on desktop_key_consent for select to authenticated
  using (public.is_admin());

-- No insert/update/delete policy for any client role. Consent is a Server
-- Action (actions/desktop.ts) on the service-role client, which re-derives the
-- user from the session — the same rule as user_api_keys, for the same reason:
-- a client that can write its own consent row is not a consent gate.

-- ---------------------------------------------------------------------------
-- 3. The read log — "Raw Footage, Real Story read your OpenAI key, 2h ago".
--
-- NOT audit_logs, for three separate reasons:
--   a. audit_logs' only select policy is admin-only, and this has to be
--      member-visible. Adding a member-select policy there would expose every
--      audit row about that member, including admin metadata.
--   b. log_audit() derives actor_id from auth.uid(), which is NULL under the
--      service role an Edge Function uses — every row would be actorless.
--   c. Different retention question. A key-access trail is the member's record,
--      not the admin's.
-- Admin-facing consent changes still go to audit_logs via log_audit() from the
-- Server Action, where auth.uid() is the admin/member and correct.
-- ---------------------------------------------------------------------------
create table desktop_key_access (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  tool_id    uuid not null references tools(id) on delete cascade,
  provider   api_provider not null,
  created_at timestamptz not null default now()
);

create index desktop_key_access_user_idx
  on desktop_key_access (user_id, created_at desc);

alter table desktop_key_access enable row level security;

create policy desktop_key_access_select_own
  on desktop_key_access for select to authenticated
  using (user_id = auth.uid());

create policy desktop_key_access_select_admin
  on desktop_key_access for select to authenticated
  using (public.is_admin());

-- No insert policy: the desktop-keys Edge Function writes these with the
-- service role. A client that can forge its own access log is not a log.

-- ---------------------------------------------------------------------------
-- 4. Convenience read: which providers has this user consented to, for a tool.
--
-- security definer + an explicit subject, matching is_admin(uid) /
-- can_access_tool(p_tool_id, uid). The Edge Function calls this with the
-- service role, so an implicit auth.uid() would be NULL and every check would
-- silently return "no consent" — the §7 footgun, in the other direction.
-- ---------------------------------------------------------------------------
create or replace function public.has_desktop_consent(
  p_tool_id uuid, p_provider api_provider, uid uuid default auth.uid()
) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from desktop_key_consent c
    where c.user_id = uid
      and c.tool_id = p_tool_id
      and c.provider = p_provider
      and c.revoked_at is null
  );
$$;
