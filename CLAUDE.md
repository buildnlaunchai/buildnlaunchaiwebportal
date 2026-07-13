# Build & Launch AI — Master Build Spec

> Paste this file into your repo as `CLAUDE.md` (or `docs/SPEC.md`) before starting.
> Then work through **Section 16 — Build Order** one phase at a time.
> Do not attempt to build all phases in one shot.

---

## 0. Your role

You are the lead engineer building **Build & Launch AI**, a members-only platform where a
solo builder (the Admin) ships new AI automation tools on a regular cadence, and approved
members get access to run them.

Rules of engagement:

- Build **phase by phase** (Section 16). Stop after each phase, summarize what changed, and
  wait for confirmation before moving on.
- Never invent scope. If something is ambiguous, ask before building it.
- Every phase must end in a working, deployable state. No half-wired features.
- Security is not a later phase. RLS goes in from the first table.

---

## 1. Product overview

**The one-liner:** A private lab of AI automation tools. Apply, get approved, run the tools.

**The loop:**

1. Anyone can browse the public tool catalog. Tools are visible but locked.
2. They apply via a form on the landing page. No payment, no card.
3. Admin reviews applications in an admin dashboard and approves / waitlists / rejects.
4. On approval, the member gets a membership and access to a set of tools.
5. Admin controls tool access globally (all members) **or** per-user.
6. Members run tools, see their run history, and request new tools.
7. Admin ships new tools regularly — ideally without touching the codebase.

**Monetization:** Not in v1. There is **no payment gateway**. The schema must be
payment-ready so a provider (Paddle) can be added later without a data migration.
Admin can gift free memberships to anyone.

---

## 2. Roles

| Role | Who | Can |
|---|---|---|
| `visitor` | Not signed in | Browse landing page, public tool catalog, changelog. Apply. |
| `applicant` | Signed in, no active membership | See empty Apps section + application status. Can run tools flagged `public_preview`. |
| `member` | Signed in, active membership | Run every tool they have access to. See run history. Vote on feature requests. |
| `admin` | You | Everything, plus the admin dashboard. |

Roles live on `profiles.role` (`member` | `admin`). "Applicant" is not a role — it is simply
a member-role user without an active membership. Keep this distinction; it prevents a whole
class of bugs.

---

## 3. The core idea: tools are data, not code

This is the most important architectural constraint in the project.

A tool is a **row in the `tools` table**, not a hardcoded page. Adding a new tool must be
possible entirely from the admin dashboard, with zero code changes, for the common case.

Every tool has a `runtime`:

| Runtime | What it is | When to use |
|---|---|---|
| `webhook_form` | **The default.** Tool defines an `input_schema` (JSON). The platform auto-renders a form from it, POSTs the validated payload to `webhook_url`, and renders the response using `output_schema`. | 90% of tools. Backed by n8n workflows or Supabase Edge Functions. |
| `internal` | A custom React route registered in a client-side registry, keyed by `tools.slug`. | Complex, stateful tools that a form can't express. |
| `iframe` | Renders `embed_url` in a sandboxed iframe with an auth token passed via query param. | Existing apps you already built. |
| `external_link` | Just opens `external_url` in a new tab, after an access check. | Escape hatch. |

### `input_schema` shape

```jsonc
{
  "fields": [
    {
      "name": "channel_url",
      "label": "YouTube channel URL",
      "type": "url",            // text | textarea | url | email | number | select | multiselect | checkbox | file | date
      "placeholder": "https://youtube.com/@...",
      "required": true,
      "help": "Paste the full channel URL.",
      "validation": { "pattern": "^https://(www\\.)?youtube\\.com/.+" }
    },
    {
      "name": "tone",
      "label": "Tone",
      "type": "select",
      "options": [
        { "value": "professional", "label": "Professional" },
        { "value": "casual", "label": "Casual" }
      ],
      "default": "professional",
      "required": true
    }
  ]
}
```

### `output_schema` shape

```jsonc
{
  "type": "blocks",   // the runner renders each block in order
  "blocks": [
    { "type": "markdown", "key": "summary", "label": "Summary" },
    { "type": "table",    "key": "leads",   "label": "Leads",  "columns": ["name", "email", "subs"] },
    { "type": "json",     "key": "raw",     "label": "Raw output", "collapsed": true },
    { "type": "file",     "key": "csv_url", "label": "Download CSV" },
    { "type": "image",    "key": "preview", "label": "Preview" }
  ]
}
```

Build a **generic form renderer** (`<ToolForm schema={...} />`) and a **generic output
renderer** (`<ToolOutput schema={...} data={...} />`). These two components are the heart of
the product. Invest in them.

---

## 4. Scope

### MVP (Phases 0–6) — must ship

- Auth (Google OAuth + email magic link)
- Public landing page + public tool catalog + individual tool pages (locked state)
- Application form with anti-spam
- Member dashboard: empty Apps state → application status → granted tools
- Admin: applications review queue, users table, tool CRUD, access management
- Tool registry + access engine + `webhook_form` runner
- Run history
- **BYOK key vault** — members supply their own provider API keys. The platform never pays for compute.
- Audit log

### V1.1 (Phases 7–9)

- Transactional email (Resend) + in-app notifications
- Access codes / gift codes
- Feature request board with upvotes
- Public changelog
- Referral codes
- Announcements banner
- `internal` and `iframe` runtimes

### Later — do not build now

- Payment gateway (Paddle) — schema is ready, integration is not
- Teams / seats / multi-tenant
- Public API for members
- i18n

---

## 5. Tech stack

- **Next.js 15** (App Router) + **TypeScript** (strict)
- **Tailwind CSS** + **shadcn/ui**
- **Supabase**: Postgres, Auth, RLS, Storage, Edge Functions, Realtime
- **Zod** for all schema validation (shared between client and server)
- **react-hook-form** for forms
- **Server Actions** for all mutations. No custom API routes unless there is a webhook to receive.
- **Resend** for transactional email
- **Cloudflare Turnstile** for the public application form
- **Vercel** for deploy
- **n8n** (already running) as the execution backend for `webhook_form` tools

Rules:

- Data fetching happens in **Server Components**. The client gets data as props.
- The **service role key never touches client code**. It lives in Server Actions and Edge
  Functions only.
- Every mutation re-verifies auth and authorization server-side. Never trust a client-supplied
  `user_id`.

---

## 6. Data model

Run these as Supabase migrations, in order, in `supabase/migrations/`.

```sql
-- ============================================================
-- 6.1  ENUMS
-- ============================================================
create type user_role          as enum ('member', 'admin');
create type application_status as enum ('pending', 'approved', 'waitlisted', 'rejected');
create type membership_status  as enum ('none', 'trialing', 'active', 'expired', 'revoked');
create type tool_status        as enum ('draft', 'coming_soon', 'published', 'maintenance', 'archived');
create type tool_access_type   as enum ('public_preview', 'members', 'plan', 'manual');
create type tool_runtime       as enum ('webhook_form', 'internal', 'iframe', 'external_link');
create type grant_source       as enum ('global', 'plan', 'manual', 'code');
create type run_status         as enum ('queued', 'running', 'success', 'error', 'timeout');
create type code_kind          as enum ('membership', 'tool_access');
create type api_provider       as enum (
  'openai', 'anthropic', 'google_ai', 'openrouter', 'elevenlabs',
  'replicate', 'fal', 'perplexity', 'serper', 'apify', 'youtube_data', 'custom'
);
create type key_status         as enum ('unverified', 'valid', 'invalid');

-- ============================================================
-- 6.2  PROFILES
-- ============================================================
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

-- Auto-create a profile on signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, referral_code)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    upper(substr(md5(random()::text), 1, 8))
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 6.3  PLANS  (payment-ready, but free for now)
-- ============================================================
create table plans (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,          -- 'founding', 'pro'
  name              text not null,
  description       text,
  price_monthly     integer not null default 0,    -- in cents; 0 = free/invite-only
  currency          text not null default 'USD',
  max_runs_per_day  integer,                       -- abuse guard ONLY, not a cost control; null = unlimited
  provider          text,                          -- null for now; 'paddle' later
  provider_price_id text,                          -- null for now
  is_default        boolean not null default false,
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);

-- ============================================================
-- 6.4  APPLICATIONS
-- ============================================================
create table applications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references profiles(id) on delete cascade,  -- null if applied before signup
  email          text not null,
  full_name      text not null,
  status         application_status not null default 'pending',

  -- qualification answers (this doubles as your pricing + positioning research)
  role_title     text,
  company        text,
  country        text,
  website_url    text,
  socials        text,
  use_case       text not null,          -- "what would you automate first?"
  tools_wanted   text[],                 -- tool slugs they're most interested in
  heard_from     text,                   -- 'youtube' | 'linkedin' | 'x' | 'skool' | 'referral' | 'other'
  referral_code  text,
  willingness_to_pay text,               -- '$0' | '<$20' | '$20-50' | '$50-100' | '$100+'

  admin_note     text,
  reviewed_by    uuid references profiles(id),
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);

create unique index applications_one_open_per_email
  on applications (lower(email)) where status = 'pending';
create index applications_status_idx on applications (status, created_at desc);

-- ============================================================
-- 6.5  MEMBERSHIPS
-- ============================================================
create table memberships (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references profiles(id) on delete cascade,
  plan_id       uuid references plans(id),
  status        membership_status not null default 'none',
  is_gift       boolean not null default false,
  granted_by    uuid references profiles(id),
  source        text,                     -- 'application' | 'gift' | 'code' | 'referral'
  started_at    timestamptz,
  expires_at    timestamptz,              -- null = never expires
  provider              text,             -- null for now
  provider_subscription_id text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index memberships_status_idx on memberships (status, expires_at);

-- ============================================================
-- 6.6  TOOLS
-- ============================================================
create table tools (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  tagline         text not null,             -- one line, shown on cards
  description     text,                      -- markdown, shown on the tool page
  category        text,                      -- 'research' | 'content' | 'video' | 'outreach' | 'ops'
  icon            text,                      -- lucide icon name
  cover_image_url text,
  video_url       text,                      -- YouTube build video, embedded on the tool page

  status          tool_status not null default 'draft',
  access_type     tool_access_type not null default 'members',
  runtime         tool_runtime not null default 'webhook_form',

  -- runtime config
  webhook_url     text,                      -- webhook_form
  webhook_secret  text,                      -- webhook_form; HMAC signing
  embed_url       text,                      -- iframe
  external_url    text,                      -- external_link
  internal_key    text,                      -- internal; maps to the client registry

  input_schema    jsonb not null default '{"fields":[]}'::jsonb,
  output_schema   jsonb not null default '{"type":"blocks","blocks":[]}'::jsonb,

  -- BYOK: which provider keys the member must supply to run this tool.
  -- Empty array = runs on free/no-key APIs = can be offered as public_preview.
  required_providers api_provider[] not null default '{}',

  timeout_seconds    integer not null default 120,
  rate_limit_per_day integer,                -- abuse guard only; null = unlimited

  version         text default '1.0.0',
  sort_order      integer not null default 0,
  launched_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index tools_status_idx on tools (status, sort_order);

-- Tools included in a plan (used when access_type = 'plan')
create table plan_tools (
  plan_id uuid not null references plans(id) on delete cascade,
  tool_id uuid not null references tools(id) on delete cascade,
  primary key (plan_id, tool_id)
);

-- Explicit per-user grants (used when access_type = 'manual', or as an override)
create table user_tool_access (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  tool_id    uuid not null references tools(id) on delete cascade,
  source     grant_source not null default 'manual',
  granted_by uuid references profiles(id),
  expires_at timestamptz,                    -- null = permanent
  created_at timestamptz not null default now(),
  unique (user_id, tool_id)
);

-- ============================================================
-- 6.7  RUNS
-- ============================================================
create table tool_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  tool_id       uuid not null references tools(id) on delete cascade,
  status        run_status not null default 'queued',
  input         jsonb not null default '{}'::jsonb,
  output        jsonb,
  error_message text,
  duration_ms   integer,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index tool_runs_user_idx on tool_runs (user_id, created_at desc);
create index tool_runs_tool_idx on tool_runs (tool_id, created_at desc);

-- ============================================================
-- 6.8  BYOK KEY VAULT
--      There are no credits. There is no usage billing. Members bring
--      their own provider API keys, so platform compute cost is always zero.
-- ============================================================
create table user_api_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  provider      api_provider not null,
  label         text,                       -- 'Personal OpenAI', 'Work account'

  -- AES-256-GCM. Three columns, never one blob. Plaintext never touches the DB.
  ciphertext    text not null,              -- base64
  iv            text not null,              -- base64, unique per record
  auth_tag      text not null,              -- base64

  key_hint      text not null,              -- last 4 chars only, e.g. '••••a9F2'
  status        key_status not null default 'unverified',
  last_verified_at timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (user_id, provider, label)
);

create index user_api_keys_user_idx on user_api_keys (user_id);

-- The ONLY thing the client is ever allowed to read. Note: no ciphertext, no iv, no tag.
create view user_api_keys_public with (security_invoker = true) as
  select id, user_id, provider, label, key_hint, status, last_verified_at, last_used_at, created_at
  from user_api_keys;

-- Does this user hold every key a given tool requires?
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

-- ============================================================
-- 6.9  ACCESS CODES  (gift memberships / tool access without manual approval)
-- ============================================================
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
  unique (code_id, user_id)
);

-- ============================================================
-- 6.10  ENGAGEMENT
-- ============================================================
create table feature_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  title       text not null,
  body        text,
  status      text not null default 'open',   -- open | planned | building | shipped | declined
  shipped_tool_id uuid references tools(id) on delete set null,
  vote_count  integer not null default 0,     -- denormalized, kept in sync by trigger
  created_at  timestamptz not null default now()
);

create table feature_request_votes (
  request_id uuid not null references feature_requests(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

create table announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text,
  variant      text not null default 'info',  -- info | success | warning
  tool_id      uuid references tools(id) on delete set null,
  is_published boolean not null default false,
  published_at timestamptz,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  title      text not null,
  body       text,
  href       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on notifications (user_id, read_at, created_at desc);

-- Waitlist for coming_soon tools ("notify me") — demand signal before you build
create table tool_interest (
  tool_id    uuid not null references tools(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tool_id, user_id)
);

-- ============================================================
-- 6.11  AUDIT LOG
-- ============================================================
create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references profiles(id) on delete set null,
  action      text not null,             -- 'application.approve' | 'tool.grant' | 'membership.revoke' | ...
  entity_type text,
  entity_id   uuid,
  target_user uuid references profiles(id) on delete set null,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

create index audit_logs_created_idx on audit_logs (created_at desc);

-- ============================================================
-- 6.12  SETTINGS (singleton, admin-editable, no redeploy needed)
-- ============================================================
create table app_settings (
  id                    boolean primary key default true check (id),
  applications_open     boolean not null default true,
  auto_approve          boolean not null default false,
  trial_days            integer not null default 0,     -- 0 = no auto-expiry on approval
  default_plan_id       uuid references plans(id),
  skool_invite_url      text,
  discord_webhook_url   text,
  maintenance_mode      boolean not null default false,
  updated_at            timestamptz not null default now()
);

insert into app_settings (id) values (true);
```

---

## 7. Authorization: helper functions + RLS

Enable RLS on **every** table. Use `security definer` helpers to avoid recursive policy
evaluation (a classic Supabase footgun — never query `profiles` from inside a `profiles`
policy).

```sql
-- ---- helpers -------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin' and is_suspended = false
  );
$$;

create or replace function public.has_active_membership(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.user_id = uid
      and m.status in ('active', 'trialing')
      and (m.expires_at is null or m.expires_at > now())
  );
$$;

-- THE access engine. Every read and every run must go through this.
create or replace function public.can_access_tool(p_tool_id uuid, uid uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  t          tools%rowtype;
  active     boolean;
  suspended  boolean;
begin
  select * into t from tools where id = p_tool_id;
  if not found then return false; end if;
  if t.status not in ('published', 'maintenance') then
    return public.is_admin();
  end if;

  select is_suspended into suspended from profiles where id = uid;
  if coalesce(suspended, true) then return false; end if;

  if public.is_admin() then return true; end if;

  -- explicit per-user grant always wins
  if exists (
    select 1 from user_tool_access a
    where a.user_id = uid and a.tool_id = p_tool_id
      and (a.expires_at is null or a.expires_at > now())
  ) then
    return true;
  end if;

  -- open to any signed-in user, membership or not
  if t.access_type = 'public_preview' then
    return uid is not null;
  end if;

  active := public.has_active_membership(uid);
  if not active then return false; end if;

  -- open to every active member
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

  -- access_type = 'manual' and no explicit grant found above
  return false;
end $$;
```

**Access resolution, stated plainly:**

1. Suspended user → no.
2. Admin → yes, always.
3. Explicit `user_tool_access` row (not expired) → yes. *This is your per-user override.*
4. Tool is `public_preview` → yes for any signed-in user.
5. No active membership → no.
6. Tool is `members` → yes. *This is your "give all users access" switch.*
7. Tool is `plan` → yes if the member's plan includes it.
8. Tool is `manual` → no (only step 3 grants it).

So the admin has exactly the two levers you asked for: flip `access_type` to `members`
to open a tool to everyone, or set it to `manual` and grant per-user.

**RLS policy summary** (write these out in full in the migration):

| Table | Members can | Admin can |
|---|---|---|
| `profiles` | select/update own row (not `role`, not `is_suspended`) | all |
| `applications` | insert own; select own | all |
| `memberships` | select own | all |
| `plans` | select where `is_active` | all |
| `tools` | select where `status in ('published','coming_soon','maintenance')` | all |
| `user_tool_access` | select own | all |
| `plan_tools` | select | all |
| `tool_runs` | select own; **insert only via Server Action** (deny direct client insert) | all |
| `user_api_keys` | select own **via `user_api_keys_public` view only** (never ciphertext); insert/delete own | select metadata only — admin can never read a member's key |
| `access_codes` | none (redeem via Server Action) | all |
| `feature_requests` | select all; insert own; update own while `status='open'` | all |
| `feature_request_votes` | select all; insert/delete own | all |
| `announcements` | select where `is_published` | all |
| `notifications` | select own; update own `read_at` | all |
| `tool_interest` | select own; insert/delete own | all |
| `audit_logs` | none | select |
| `app_settings` | select (public fields only, via a view) | all |

Guard the `profiles.role` column with a trigger: a non-admin must never be able to set
`role = 'admin'` on any row, including their own.

---

## 8. Route map

### Public

| Route | Purpose |
|---|---|
| `/` | Landing page. Hero, the shipping log, tool grid, how it works, apply CTA. |
| `/tools` | Public catalog. All `published` + `coming_soon` tools. Locked. |
| `/tools/[slug]` | Public tool page. Description, build video, input preview (disabled), "Apply for access". SEO-optimized. |
| `/changelog` | Every tool launch + update, newest first. |
| `/apply` | The application form. Turnstile-protected. |
| `/apply/thanks` | Confirmation + waitlist position. |
| `/login` | Google OAuth + magic link. |
| `/auth/callback` | Supabase auth callback. |

### Member app (auth required)

| Route | Purpose |
|---|---|
| `/dashboard` | **Apps section.** If no access: empty state + "Apply for access" CTA or pending-status card. If access: grid of unlocked tools. |
| `/dashboard/tools/[slug]` | The tool runner. Form on the left, output on the right. |
| `/dashboard/runs` | Run history. Filter by tool. Click into any past run to see input + output. |
| `/dashboard/runs/[id]` | Single run detail. |
| `/dashboard/requests` | Feature request board. Submit + upvote. |
| `/dashboard/redeem` | Enter an access code. |
| `/dashboard/keys` | **The key vault.** Add, verify, relabel, and delete provider API keys. Shows which tools each key unlocks. |
| `/dashboard/settings` | Profile, membership status, referral link. |

### Admin (`role = 'admin'` required — enforce in middleware **and** in every Server Action)

| Route | Purpose |
|---|---|
| `/admin` | Metrics: pending applications, active members, runs (7d), top tools, run success rate, signup trend. |
| `/admin/applications` | Review queue. Filter by status. Bulk approve. Each row expands to show all answers. Approve → pick plan + tools + expiry, one click. |
| `/admin/users` | Searchable table: name, email, membership, plan, keys connected, last run, tools count. |
| `/admin/users/[id]` | **The important one.** Per-user tool access matrix (checkbox grid of every tool). Grant/revoke. Gift a membership. Suspend. See which providers they've connected (never the keys themselves). View their run history. |
| `/admin/tools` | Tool list. Drag to reorder. Duplicate a tool. |
| `/admin/tools/new` and `/admin/tools/[id]` | Tool editor: metadata, runtime config, **visual `input_schema` builder** (add/edit/reorder fields — do not make me hand-write JSON), output block builder, **required providers** picker, access type, "Test run" button that fires the webhook with sample data (using *my* admin keys) and shows the raw response. |
| `/admin/plans` | Plan CRUD + which tools each plan includes. |
| `/admin/codes` | Generate access codes. See redemptions. |
| `/admin/requests` | Feature requests sorted by votes. Set status. Link a shipped tool. |
| `/admin/announcements` | Compose + publish. |
| `/admin/audit` | Audit log, filterable. |
| `/admin/settings` | App settings (applications open/closed, auto-approve, trial days, Skool URL, Discord webhook). |

The tool editor's "Test run" button is not optional. Without it, debugging a new tool means
poking at production.

---

## 9. The tool runner (`webhook_form`)

The single most important flow in the app. Implement it as a Server Action, never client-side.

```
1.  User submits the auto-rendered form.
2.  Server Action:
      a. Verify auth.
      b. Verify can_access_tool(tool_id) — re-check server-side, always.
      c. Verify tool.status = 'published'  (if 'maintenance', show a notice and stop).
      d. Verify has_required_keys(tool_id) — if false, stop and point the user at /dashboard/keys,
         naming exactly which provider is missing.
      e. Verify the daily rate limit (count today's runs for this user+tool). Abuse guard only.
      f. Validate input against a Zod schema compiled from tool.input_schema.
3.  Insert tool_runs row with status='running'.
4.  Decrypt the user's keys for tool.required_providers. In memory only. Never logged,
    never written back to the DB, never returned to the client.
5.  POST to tool.webhook_url:
      Headers: X-BLAI-Signature (HMAC-SHA256 of body with tool.webhook_secret),
               X-BLAI-Run-Id, X-BLAI-User-Id
      Body:    {
                 run_id, user_id, tool_slug,
                 input:   { ...validated form values },
                 secrets: { openai: "sk-...", elevenlabs: "..." }   // the member's own keys
               }
      Timeout: tool.timeout_seconds
6.  On 2xx: update run → status='success', output=response, completed_at, duration_ms.
    On error/timeout: update run → status='error'/'timeout', error_message.
    If the provider returns 401/403, mark that user_api_keys row status='invalid' and tell
    the member their key stopped working. This is the single most common failure in BYOK —
    handle it explicitly, not as a generic error.
7.  Update user_api_keys.last_used_at.
8.  Return the run to the client. Render with <ToolOutput />.
```

**Never persist `secrets` anywhere.** Not in `tool_runs.input`, not in logs, not in error
messages, not in Sentry breadcrumbs. Strip the key before writing the run row. Write a unit
test that asserts this.

**n8n contract:** every workflow reads its credentials from the incoming webhook body, not
from an n8n credential store. Disable execution-data saving on these workflows, or set them
to save only on error with the body redacted.

**Long-running tools:** n8n workflows can take minutes. Support an async path — if the
webhook responds `202 { "async": true }`, leave the run in `running`, and expose a callback
endpoint:

```
POST /api/runs/callback
  Headers: X-BLAI-Signature (HMAC of body with the tool's webhook_secret)
  Body:    { run_id, status: "success" | "error", output?, error_message? }
```

Verify the HMAC. Reject anything unsigned. The dashboard subscribes to `tool_runs` via
Supabase Realtime so the UI updates the moment the callback lands. No polling.

---

## 10. BYOK — bring your own keys

**The economic model of this platform: the member pays their provider, not me. Platform
compute cost is always zero. There are no credits, no usage metering, no billing. A
membership buys access to the tools; the member supplies the fuel.**

### Encryption

- AES-256-GCM, `node:crypto`. Master key in `ENCRYPTION_KEY` (32 bytes, base64), env only.
- Fresh random 12-byte IV per record. Store `ciphertext`, `iv`, `auth_tag` separately.
- Encrypt in the Server Action, before insert. Decrypt only inside `lib/keys.ts`, only in the
  runner, only in memory.
- The client never receives ciphertext. Reads go through the `user_api_keys_public` view.
  Once a key is saved, **nobody — not the member, not the admin — can read it back**. They can
  only replace it. Say this in the UI.
- Rotating `ENCRYPTION_KEY` invalidates every stored key. Document that. Don't rotate casually.

### Verification

Every key gets a **Verify** button that makes one cheap, read-only call to the provider:

| Provider | Verification call |
|---|---|
| `openai` | `GET /v1/models` |
| `anthropic` | `POST /v1/messages` with 1 token |
| `google_ai` | `GET /v1beta/models` |
| `elevenlabs` | `GET /v1/user` |
| `openrouter` | `GET /api/v1/key` |
| others | a documented cheapest endpoint |

Verify on save, and re-verify when a run gets a 401/403. Store the result in `status`.

### Making BYOK not hurt

BYOK is the right economics but it is real friction. Three rules that protect conversion:

1. **Every tool that can run without a key, must.** Set `required_providers = '{}'` and
   `access_type = 'public_preview'`. A new signup should be able to run *something* useful
   within 30 seconds of landing, before they ever hear the word "API key". This is the whole
   funnel.
2. **The tool card says what it needs, before they click.** A small mono chip:
   `needs: openai`. If they don't have it, the chip is amber and clicking it goes straight to
   the key vault, pre-filtered to that provider.
3. **The key vault teaches.** For each provider: a one-paragraph "how to get this key", a
   direct link to the provider's key page, an honest note on likely cost per run, and a plain
   statement of what we do with the key. Not a legal disclaimer — a straight answer.

### Admin keys

The admin has their own keys in the same vault. The tool editor's "Test run" uses them. This
means you can build and test a tool before a single member has connected anything.

---

## 11. Emails + notifications

Use Resend. Every email is also written to `notifications` for the in-app bell.

| Trigger | To | Content |
|---|---|---|
| Application submitted | Applicant | "We got it." Expected review time. |
| Application submitted | Admin (Discord webhook, not email) | Name, email, use case, willingness to pay. Link to review. |
| Application approved | Applicant | "You're in." Login link, what's unlocked, Skool invite link. |
| Application waitlisted | Applicant | Honest, warm, keeps them engaged. |
| New tool published | All active members | Tool name, what it does, link. |
| Tool access granted | That user | Which tool, link. |
| Membership expiring in 7 days | That member | Renew / reapply. |
| A key stopped working (401 during a run) | That member | Which provider, which tool failed, link to the key vault. Once per key, not per run. |
| Feature request shipped | Requester + upvoters | "You asked for this. It's live." |

Never send an email from a client component. All sends happen in Server Actions or Edge
Functions.

---

## 12. Design

**The design system lives in `DESIGN.md`. It is not optional, and it is not a suggestion.**

Before you write a single component, read `DESIGN.md` end to end. Every color, type size,
spacing value, radius, motion duration, and piece of interface copy comes from that file. If
you need something the design system doesn't have, add it to `DESIGN.md` first, then use it.
Never style ad hoc.

Two things from it that shape the architecture, so they belong here too:

- **The signature moment is the run.** The instant a member clicks Run is the emotional core
  of this product. It gets a designed choreography, not a spinner. Build the runner UI around
  that moment, not around the form.
- **Empty states are the most important screens in the app.** A new signup sees an empty Apps
  section. That screen has to sell, orient, and convert, all without a single row of data.

---

## 13. Security — non-negotiable

- RLS on every table, from the first migration.
- `SUPABASE_SERVICE_ROLE_KEY` never appears in a client component, a `NEXT_PUBLIC_` var, or a
  client-reachable bundle.
- Every Server Action re-derives the user from the session. Never accept a `user_id` from the
  client and trust it.
- Admin checks happen in **three** places: middleware (route guard), the page (Server
  Component), and the Server Action (the mutation). Middleware alone is not authorization.
- `can_access_tool()` is checked server-side on every run, even though the UI already hid the
  button.
- All webhook traffic (outbound to n8n, inbound to the callback) is HMAC-signed.
- Turnstile on `/apply`. Plus a honeypot field. Plus a rate limit by IP.
- `tools.webhook_secret` and `webhook_url` are never sent to the client. Select explicit
  columns; do not `select *` on `tools` in a Server Component that passes data to the client.
- **Member API keys:** encrypted at rest (AES-256-GCM), decrypted only in the runner, never
  logged, never persisted into `tool_runs`, never readable by anyone — including the admin —
  once saved. `ENCRYPTION_KEY` is server-only and is never committed.
- Log every admin mutation to `audit_logs`.

---

## 14. Environment variables

```bash
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server only
RESEND_API_KEY=
RESEND_FROM_EMAIL=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
ENCRYPTION_KEY=                     # 32 random bytes, base64. Encrypts member API keys. Server only.
ADMIN_BOOTSTRAP_EMAIL=              # this email is promoted to admin on first signup
```

---

## 15. Conventions

```
app/
  (marketing)/          # public: landing, tools, changelog, apply
  (auth)/               # login, callback
  (app)/dashboard/      # member app
  (admin)/admin/        # admin
  api/runs/callback/    # the only public API route
components/
  tools/                # ToolForm, ToolOutput, ToolCard, RunStatus
  ui/                   # shadcn
lib/
  supabase/             # server.ts, client.ts, admin.ts (service role)
  access.ts             # canAccessTool, requireAdmin, requireMember
  schema.ts             # Zod: compile input_schema -> Zod schema
  crypto.ts             # AES-256-GCM encrypt/decrypt. Nothing else imports node:crypto.
  keys.ts               # key vault: save, verify, list (public view), decryptForRun
  runner.ts             # the webhook execution logic
  audit.ts
actions/                # Server Actions, grouped by domain
supabase/migrations/
```

- Server Actions live in `actions/`, each file starts with `"use server"`, each action starts
  with an auth check.
- Types are generated from the database: `supabase gen types typescript`. Never hand-write
  row types.
- No `any`. No `@ts-ignore`.

---

## 16. Build order

Stop after each phase. Show me what works. Wait for a go-ahead.

**Phase 0 — Foundation**
Next.js 15 + TS + Tailwind + shadcn. Supabase project wired. Fonts loaded. Design tokens in
`globals.css`. Empty layouts for marketing / app / admin. Deployed to Vercel.
*Done when:* the three shells render and the site is live.

**Phase 1 — Auth + profiles**
Migration 6.2. Google OAuth + magic link. `handle_new_user` trigger. Middleware route guards.
`ADMIN_BOOTSTRAP_EMAIL` promotes the first admin. RLS on `profiles`.
*Done when:* I can sign in, my profile row exists, and `/admin` is blocked for a normal user.

**Phase 2 — Tools schema + public catalog**
Migrations 6.3, 6.6. Seed 3 sample tools. `/tools`, `/tools/[slug]` with locked state and
video embed. Landing page with the Shipping Log.
*Done when:* the public site sells the product to a stranger.

**Phase 3 — Application funnel**
Migration 6.4. `/apply` with Turnstile + honeypot. `/apply/thanks`. Discord webhook ping on
new application. `/admin/applications` review queue with approve / waitlist / reject.
*Done when:* someone can apply and I can see it in the admin queue.

**Phase 4 — Membership + the access engine**
Migrations 6.5, 6.7 (partial), 6.11. All helper functions from Section 7. Approving an
application creates a membership + grants tools. `/dashboard` shows the empty Apps state for
applicants and the tool grid for members. `/admin/users/[id]` with the per-user tool access
matrix.
*Done when:* I can approve a user, tick a tool for them, and they see exactly that tool —
and flipping a tool to `access_type='members'` opens it for everyone at once.

**Phase 5 — The BYOK key vault**
Migration 6.8. `lib/crypto.ts` (AES-256-GCM) and `lib/keys.ts`. `/dashboard/keys`: add,
verify, relabel, delete. Provider guides. `has_required_keys()`. Tool cards show their
`needs: provider` chip.
*Done when:* I can save an OpenAI key, verify it, and confirm the plaintext exists nowhere
in the database, the logs, or any client payload.

**Phase 6 — The tool runner**
`ToolForm` + `ToolOutput` generic renderers. `lib/schema.ts` (JSON → Zod). `lib/runner.ts`
with HMAC signing, key injection, timeout, 401-detection, and the async callback route.
Realtime run updates. The full run choreography from `DESIGN.md`. `/dashboard/runs`.
*Done when:* I can wire a real n8n workflow, a member runs it with their own key, and the
run feels good enough that I want to record it for YouTube.

**Phase 7 — Admin tool editor**
Visual `input_schema` builder. Output block builder. Required-providers picker. "Test run"
using my admin keys. `/admin` metrics.
*Done when:* I can create and ship a brand-new working tool without opening VS Code.

**Phase 8 — Email + notifications**
Migration 6.10 (notifications). Resend templates from Section 11. In-app bell.
Announcements banner.

**Phase 9 — Access codes + referrals**
Migration 6.9. `/admin/codes`. `/dashboard/redeem`. Referral link + auto-grant on N referrals.

**Phase 10 — Community loop**
Migration 6.10 (feature requests, tool interest). Feature request board with upvotes.
`/changelog`. "Notify me" on `coming_soon` tools. Shipped-request notifications.

---

## 17. Acceptance criteria for the whole thing

Before this is called done, all of these must be true:

- [ ] A stranger can find a tool page via Google, understand it, and apply in under 60 seconds.
- [ ] I can approve an application in one click and the user gets an email.
- [ ] I can open one tool to every member with a single dropdown change.
- [ ] I can grant one specific tool to one specific user with a single checkbox.
- [ ] I can create an entirely new tool — form, execution, output rendering — from the admin
      dashboard, without a deploy.
- [ ] A member cannot run a tool they don't have access to, even by crafting the request by hand.
- [ ] A brand-new signup can run at least one useful tool without connecting any API key.
- [ ] A member's API key cannot be read back by anyone — not by them, not by me, not by a
      leaked database dump without the encryption key.
- [ ] No API key ever appears in `tool_runs`, in a log line, or in a client payload.
- [ ] The platform's compute bill for any member's usage is exactly zero.
- [ ] A run that fails on a bad key says so plainly and links to the fix.
- [ ] No table is readable without RLS permitting it.
- [ ] Adding Paddle later requires zero schema migrations.
- [ ] Every screen matches `DESIGN.md`. No ad-hoc styles anywhere in the codebase.
