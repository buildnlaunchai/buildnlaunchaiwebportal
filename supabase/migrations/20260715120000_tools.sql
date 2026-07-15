-- ============================================================================
-- Phase 2 — Tools schema + public catalog.  (CLAUDE.md §6.3, §6.6, §6.6b)
--
-- The load-bearing decision here is that `tools` is PUBLICLY READABLE, so it
-- contains nothing secret. Everything a client must not see lives in
-- `tool_secrets`, which has RLS on and zero policies — deny-all. The two ship
-- in the same migration, on purpose: the moment `tools` has a select policy and
-- a secret column in the same row, the secret is public, and "we'll split it
-- out later" is a window during which it leaks.
--
-- The access ENGINE (can_access_tool, has_active_membership) is NOT here — it
-- needs memberships and user_api_keys, which arrive in Phases 4 and 5. Phase 2
-- is the schema and the public read path only.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums (the tool-related subset of §6.1)
-- ---------------------------------------------------------------------------
create type tool_status      as enum ('draft', 'coming_soon', 'published', 'maintenance', 'archived');
create type tool_access_type as enum ('public_preview', 'members', 'plan', 'manual');

-- 'edge_function', not 'webhook_form': tools execute as Supabase Edge Functions
-- on our own project. There is no external webhook. (CLAUDE.md §3, §9)
create type tool_runtime     as enum ('edge_function', 'internal', 'iframe', 'external_link');

create type grant_source     as enum ('global', 'plan', 'manual', 'code');

create type api_provider     as enum (
  'openai', 'anthropic', 'google_ai', 'openrouter', 'elevenlabs',
  'replicate', 'fal', 'perplexity', 'serper', 'apify', 'youtube_data', 'custom'
);

-- ---------------------------------------------------------------------------
-- 6.3  PLANS  (payment-ready, but free for now)
-- ---------------------------------------------------------------------------
create table plans (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  name              text not null,
  description       text,
  price_monthly     integer not null default 0,    -- cents; 0 = free/invite-only
  currency          text not null default 'USD',
  max_runs_per_day  integer,                        -- abuse guard only; null = unlimited
  provider          text,                           -- null for now; 'paddle' later
  provider_price_id text,
  is_default        boolean not null default false,
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6.6  TOOLS  (no secret columns — see the header)
-- ---------------------------------------------------------------------------
create table tools (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  tagline         text not null,
  description     text,                       -- markdown, shown on the tool page
  category        text,                       -- 'research' | 'content' | 'video' | 'outreach' | 'ops'
  icon            text,                       -- lucide icon name (see components/shell/icons.ts)
  cover_image_url text,
  video_url       text,                       -- YouTube build video, embedded on the tool page

  status          tool_status not null default 'draft',
  access_type     tool_access_type not null default 'members',
  runtime         tool_runtime not null default 'edge_function',

  internal_key    text,                       -- 'internal' runtime → client registry key

  input_schema    jsonb not null default '{"fields":[]}'::jsonb,
  output_schema   jsonb not null default '{"type":"blocks","blocks":[]}'::jsonb,

  required_providers api_provider[] not null default '{}',

  timeout_seconds    integer not null default 120 check (timeout_seconds between 5 and 400),
  rate_limit_per_day integer,

  version         text default '1.0.0',
  sort_order      integer not null default 0,
  launched_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index tools_status_idx on tools (status, sort_order);

create trigger tools_touch_updated_at
  before update on tools
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6.6b  TOOL_SECRETS  (service role only; RLS on, zero policies)
-- ---------------------------------------------------------------------------
create table tool_secrets (
  tool_id        uuid primary key references tools(id) on delete cascade,

  -- edge_function: which handler runs this tool. Defaults to slug; overridable
  -- so two rows can share one handler.
  function_name  text,

  embed_url      text,   -- iframe
  external_url   text,   -- external_link

  updated_at     timestamptz not null default now(),

  constraint embed_url_is_https
    check (embed_url is null or embed_url like 'https://%')
);

create trigger tool_secrets_touch_updated_at
  before update on tool_secrets
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6.6  PLAN_TOOLS  (used when access_type = 'plan')
-- ---------------------------------------------------------------------------
create table plan_tools (
  plan_id uuid not null references plans(id) on delete cascade,
  tool_id uuid not null references tools(id) on delete cascade,
  primary key (plan_id, tool_id)
);

-- ---------------------------------------------------------------------------
-- 6.6  USER_TOOL_ACCESS  (explicit per-user grants / the manual override)
-- ---------------------------------------------------------------------------
create table user_tool_access (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  tool_id    uuid not null references tools(id) on delete cascade,
  source     grant_source not null default 'manual',
  granted_by uuid references profiles(id),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, tool_id)
);

create index user_tool_access_user_idx on user_tool_access (user_id);

-- ===========================================================================
-- RLS
-- ===========================================================================

-- ---- plans ----------------------------------------------------------------
alter table plans enable row level security;

create policy plans_select_active
  on plans for select
  to anon, authenticated
  using (is_active);

create policy plans_all_admin
  on plans for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---- tools ----------------------------------------------------------------
alter table tools enable row level security;

-- The public catalog. anon (visitors) AND authenticated see the same rows: the
-- three "real" statuses. draft and archived are admin-only.
create policy tools_select_public
  on tools for select
  to anon, authenticated
  using (status in ('published', 'coming_soon', 'maintenance'));

create policy tools_all_admin
  on tools for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---- tool_secrets ---------------------------------------------------------
-- RLS on, and NOT ONE policy, now or ever. That denies anon and authenticated
-- entirely. Only the service role (the runner, admin Server Actions) reads it.
-- You cannot leak a column you cannot join to.
alter table tool_secrets enable row level security;

-- ---- plan_tools -----------------------------------------------------------
alter table plan_tools enable row level security;

create policy plan_tools_select_all
  on plan_tools for select
  to anon, authenticated
  using (true);

create policy plan_tools_all_admin
  on plan_tools for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---- user_tool_access -----------------------------------------------------
alter table user_tool_access enable row level security;

create policy user_tool_access_select_own
  on user_tool_access for select
  to authenticated
  using (user_id = auth.uid());

create policy user_tool_access_all_admin
  on user_tool_access for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No insert/update/delete for members: grants are made by an admin Server
-- Action (service role), never self-serve.

-- ===========================================================================
-- Seed data
-- ===========================================================================

-- One free, invite-only default plan. Everything is gifted for now (§1).
insert into plans (slug, name, description, price_monthly, is_default, is_active, sort_order)
values ('founding', 'Founding member',
        'Free while I build in public. You bring your own API keys; I bring the tools.',
        0, true, true, 0);

-- Three seed tools, chosen to exercise all three public card states and the
-- BYOK funnel rule (§10): at least one tool that runs with NO key, offered as
-- public_preview, so a brand-new visitor can run something useful before they
-- ever hear the words "API key".
insert into tools
  (slug, name, tagline, description, category, icon, status, access_type,
   required_providers, video_url, version, sort_order, launched_at, input_schema, output_schema)
values
  -- 1. published + members  → the LOCKED card a visitor sees
  ('youtube-lead-finder',
   'YouTube lead finder',
   'Turn a niche into a list of creators worth reaching.',
   E'Give it a topic and a floor on subscriber count. It searches YouTube, pulls the channels that match, finds a public contact where one exists, and hands back a clean, sorted list — plus a short read on who''s actually worth your time.\n\nBuilt on the YouTube Data API and your own OpenAI key, so every run is on your account and nothing is throttled behind my bill.',
   'research', 'users', 'published', 'members',
   '{youtube_data,openai}', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', '1.0.0', 10,
   '2026-07-10T09:00:00Z',
   '{"fields":[
      {"name":"query","label":"Topic or niche","type":"text","placeholder":"real estate photography","required":true,"help":"What kind of creators are you looking for?"},
      {"name":"min_subscribers","label":"Minimum subscribers","type":"number","default":1000,"required":true},
      {"name":"max_results","label":"How many channels","type":"number","default":25,"required":true,"help":"Up to 50."}
    ]}'::jsonb,
   '{"type":"blocks","blocks":[
      {"type":"markdown","key":"summary","label":"Who''s worth your time"},
      {"type":"table","key":"leads","label":"Channels","columns":["channel","subscribers","contact","url"]},
      {"type":"json","key":"raw","label":"Raw data","collapsed":true}
    ]}'::jsonb),

  -- 2. published + public_preview + NO keys → the one a stranger can run first
  ('hacker-news-digest',
   'Hacker News digest',
   'The day''s HN, summarised into something you''ll actually read.',
   E'Pick a topic and a window. It reads the top Hacker News stories, filters to what matches, and writes a tight digest with the links that matter.\n\nThis one runs on the free Hacker News API — no key, no account, nothing to connect. It''s here so you can see how a tool feels before you commit to anything.',
   'research', 'newspaper', 'published', 'public_preview',
   '{}', null, '1.0.0', 20,
   '2026-07-13T09:00:00Z',
   '{"fields":[
      {"name":"topic","label":"Topic","type":"text","placeholder":"AI agents","required":true,"help":"Leave broad for a general digest."},
      {"name":"timeframe","label":"Window","type":"select","default":"today","required":true,
        "options":[{"value":"today","label":"Today"},{"value":"week","label":"This week"},{"value":"month","label":"This month"}]},
      {"name":"max_items","label":"How many stories","type":"number","default":10,"required":true}
    ]}'::jsonb,
   '{"type":"blocks","blocks":[
      {"type":"markdown","key":"digest","label":"Your digest"},
      {"type":"table","key":"stories","label":"Stories","columns":["title","points","comments","url"]}
    ]}'::jsonb),

  -- 3. coming_soon → the "notify me" card, a demand-measurement instrument
  ('reddit-pain-miner',
   'Reddit pain-point miner',
   'Find the exact words people use to describe a problem.',
   E'Point it at a subreddit and a theme. It reads the threads, clusters the recurring complaints, and gives you back the phrasing real people use — the raw material for a landing page, a cold email, or your next tool.\n\nComing soon. Tap notify me and you''ll be first in when it ships.',
   'research', 'message-circle', 'coming_soon', 'members',
   '{openai}', null, '0.1.0', 30,
   null,
   '{"fields":[
      {"name":"subreddit","label":"Subreddit","type":"text","placeholder":"r/smallbusiness","required":true},
      {"name":"theme","label":"Theme","type":"text","placeholder":"bookkeeping","required":true}
    ]}'::jsonb,
   '{"type":"blocks","blocks":[
      {"type":"markdown","key":"summary","label":"What people struggle with"},
      {"type":"table","key":"pains","label":"Pain points","columns":["quote","thread","upvotes"]}
    ]}'::jsonb);

-- Each tool gets its tool_secrets row. For edge_function tools the only field
-- that matters is function_name, defaulting to the slug. These rows are
-- unreadable by any client role — that is the whole point of the table.
insert into tool_secrets (tool_id, function_name)
select id, slug from tools;
