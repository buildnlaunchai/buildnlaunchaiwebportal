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
2. To apply, they **sign in first** (Google, one click), then fill in the form. No payment, no card.
   Sign-in before apply is deliberate: an application is always attached to a real account,
   so approval has somewhere to put the membership, and the dashboard can always show the
   applicant their own status. There is no anonymous application and no email-claiming step.
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
| `visitor` | Not signed in | Browse landing page, public tool catalog, changelog. **Must sign in to apply.** |
| `applicant` | Signed in, no active membership | See empty Apps section + application status. Can run tools flagged `public_preview`. |
| `member` | Signed in, active membership | Run every tool they have access to. See run history. Vote on feature requests. |
| `admin` | You | Everything, plus the admin dashboard. |

Roles live on `profiles.role` (`member` | `admin`). "Applicant" is not a role — it is simply
a member-role user without an active membership. Keep this distinction; it prevents a whole
class of bugs.

---

## 3. The core idea: tools are data, not code

This is the most important architectural constraint in the project.

A tool is a **row in the `tools` table**, not a hardcoded page.

**Be precise about what this now means, because dropping n8n changed it.** A tool has two halves:

- **Its interface is data.** The form, the field types and validation, the output blocks and how
  they render, the access rule, the required providers, the rate limit, the copy, the ordering,
  the status — all of it is columns on a row, all of it editable from the admin dashboard, none
  of it a deploy. This is the leverage, and it survives the architecture change completely intact.
- **Its behaviour is code.** With n8n, the *work* was also clickable. It isn't now: a tool's logic
  is a TypeScript handler at `supabase/functions/run-tool/handlers/<slug>.ts`, and shipping it
  means `supabase functions deploy run-tool`.

So: **shipping a new tool is one handler file and one deploy command.** Everything else is the
admin dashboard. That is a real, deliberate trade — we gave up a clickable workflow builder and
got back a system where a member's API key never touches third-party software, where the tool is
in version control, typed, testable, and reviewable, and where there is no second platform to
keep alive. It is the right trade for a solo builder who can write TypeScript faster than he can
drag nodes. But do not tell yourself tools are "no code" any more. They are *no deploy for
everything a user can see*, which is still most of the win.

Every tool has a `runtime`:

| Runtime | What it is | When to use |
|---|---|---|
| `edge_function` | **The default.** Tool defines an `input_schema` (JSON). The platform auto-renders a form from it, invokes the `run-tool` Supabase Edge Function with the validated payload, and renders the result using `output_schema`. The tool's actual code is a handler file, dispatched by slug. | 90% of tools. See §9. |
| `internal` | A custom React route registered in a client-side registry, keyed by `tools.slug`. | Complex, stateful tools that a form can't express. |
| `iframe` | Renders `embed_url` in a sandboxed iframe with an auth token passed via query param. | Existing apps you already built. |
| `external_link` | Just opens `external_url` in a new tab, after an access check. | Escape hatch. |

**There is no external execution backend.** Tools are TypeScript that runs on our own Supabase
project. There is no n8n, no third-party workflow engine, and no outbound webhook. This is the
single most important consequence: **a member's API key never leaves infrastructure we control,
and never touches software that persists it.** See §9 and §10.

### `input_schema` shape

```jsonc
{
  "fields": [
    {
      "name": "channel_url",
      "label": "YouTube channel URL",
      "type": "url",            // text | textarea | url | email | number | select | multiselect | checkbox | date
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

**There is no `file` input type in the MVP.** File upload needs a Storage bucket, its own RLS,
a signed-URL handoff to the handler, and a retention policy — that is a feature, not a field type. If a
tool needs a file, it takes a URL to one. Revisit after Phase 7.

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

### Output files: re-hosted, and they expire

A `file` or `image` block's value is a URL a handler returned — typically a provider's temporary
CDN link. **We never link to it directly.** Those URLs expire, and dead links in run history make
the product look broken.

At run completion, the runner downloads every `file`/`image` URL in the output and re-hosts it
in the private Supabase Storage bucket `run-artifacts`, under `{user_id}/{run_id}/{key}`. The
stored path replaces the original URL in `tool_runs.output`. The runner sets
`tool_runs.artifacts_expire_at = now() + interval '30 days'`.

Artifacts are deleted by a scheduled job 30 days after the run. **Expiry is not a dead link** —
after `artifacts_expire_at`, `<ToolOutput>` still renders every other block normally and shows
the file block in an explicit *expired* state. The run's inputs, text, tables, and JSON are kept
forever; only the binaries age out. The UI says "Files are kept for 30 days" on the runner and in
run history, before the user needs to care.

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
- Tool registry + access engine + `edge_function` runner
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

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict)
  > This spec originally said Next 15. `create-next-app` now ships **16**, and on a greenfield
  > project pinning to the previous major means starting with migration debt for no benefit —
  > everything the spec relies on (App Router, Server Actions, RSC, Tailwind v4) is unchanged.
  > Amended rather than silently diverged from, per DESIGN.md's own rule.
- **Tailwind CSS v4** (CSS-first `@theme` tokens, no `tailwind.config.ts`) + **shadcn/ui**
- **Supabase**: Postgres, Auth, RLS, Storage, Edge Functions, Realtime
- **Zod** for all schema validation (shared between client and server)
- **react-hook-form** for forms
- **Server Actions** for all mutations. No custom API routes unless there is a webhook to receive.
- **Resend** for transactional email — and as Supabase Auth's custom SMTP provider
- **Cloudflare Turnstile** for the application form
- **Vercel (Hobby)** for the web app
- **Supabase Edge Functions** (Deno) as the execution backend for every tool. **No n8n. No
  external execution of any kind.**

Rules:

- Data fetching happens in **Server Components**. The client gets data as props.
- The **service role key never touches client code**. It lives in Server Actions and Edge
  Functions only.
- Every mutation re-verifies auth and authorization server-side. Never trust a client-supplied
  `user_id`.
- **Rate limiting lives in Postgres.** No Redis, no Upstash, no in-process counter. Vercel
  functions are stateless and share no memory, so an in-process limiter is not a limiter. See
  `rate_limit_hits` in §6.13.
- **We are on Vercel Hobby and we design for it.** Vercel functions cap at 60s — irrelevant now,
  because the runner Server Action returns in under a second and never waits for a tool to
  finish. Nothing in this product may depend on a Vercel plan above Hobby.
- **The binding constraint is Supabase's, not Vercel's.** A tool run is an Edge Function
  invocation, and it dies at the wall-clock limit: **150s on the Supabase Free plan, 400s on
  Pro.** That is now the hard ceiling on how long any tool can take. Read §9.1 before designing
  a tool.

---

## 6. Data model

Run these as Supabase migrations, in order, in `supabase/migrations/`.

```sql
-- ============================================================
-- 6.1  ENUMS
-- ============================================================
create type user_role          as enum ('member', 'admin');
create type application_status as enum ('pending', 'approved', 'waitlisted', 'rejected');

-- No 'none'. The absence of a memberships row IS "no membership". Two ways to spell one
-- state is how you get bugs where a user is simultaneously a member and not one.
create type membership_status  as enum ('trialing', 'active', 'expired', 'revoked');
create type tool_status        as enum ('draft', 'coming_soon', 'published', 'maintenance', 'archived');
create type tool_access_type   as enum ('public_preview', 'members', 'plan', 'manual');
create type tool_runtime       as enum ('edge_function', 'internal', 'iframe', 'external_link');
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
-- You must be signed in to apply. user_id is NOT NULL, so an approved application always has
-- an account to attach a membership to, and the applicant can always see their own status.
create table applications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
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

-- One open application per person. Keyed on user_id, not email, now that auth comes first.
create unique index applications_one_open_per_user
  on applications (user_id) where status = 'pending';
create index applications_status_idx on applications (status, created_at desc);

-- ============================================================
-- 6.5  MEMBERSHIPS
-- ============================================================
create table memberships (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references profiles(id) on delete cascade,
  plan_id       uuid references plans(id),
  status        membership_status not null,     -- no default. Be explicit. No row = no membership.
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
--
--      `tools` is PUBLICLY READABLE (published/coming_soon/maintenance rows). Therefore it
--      contains NOTHING that must stay secret. RLS grants rows, not columns — a member with
--      the anon key can select every column of every row a policy lets them see, straight
--      from the browser console. So the webhook URL and its signing secret do not live here.
--      They live in `tool_secrets`, which no client role can read at all. See 6.6b.
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
  runtime         tool_runtime not null default 'edge_function',

  -- Non-secret runtime config only. The client legitimately needs this to render.
  internal_key    text,                      -- internal; maps to the client registry

  input_schema    jsonb not null default '{"fields":[]}'::jsonb,
  output_schema   jsonb not null default '{"type":"blocks","blocks":[]}'::jsonb,

  -- BYOK: which provider keys the member must supply to run this tool.
  -- Empty array = runs on free/no-key APIs = can be offered as public_preview.
  required_providers api_provider[] not null default '{}',

  -- How long we let this tool run before the reaper calls it dead. NOT how long we hold an
  -- HTTP request open — we hold none. Must be <= the Supabase wall-clock limit (150s free /
  -- 400s Pro), because the Edge Function will be killed at that point regardless of what this
  -- column says. Enforced by a CHECK so a hopeful admin can't set 600 and wonder why.
  timeout_seconds    integer not null default 120 check (timeout_seconds between 5 and 400),
  rate_limit_per_day integer,                -- abuse guard only; null = unlimited

  version         text default '1.0.0',
  sort_order      integer not null default 0,
  launched_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index tools_status_idx on tools (status, sort_order);

-- ============================================================
-- 6.6b  TOOL_SECRETS
--       Service role only. No policy is written for `anon` or `authenticated`, and none ever
--       will be — RLS is on with zero policies, which denies everyone.
--
--       Honest note on the name: with n8n gone there is no longer a *credential* in here.
--       There is no webhook URL to leak and no HMAC secret to steal, because there is no
--       outbound webhook. What remains is runtime config the client has no business seeing —
--       which handler file executes, where an iframe points. The table stays separate anyway,
--       for the same structural reason as before: `tools` is publicly readable, and you cannot
--       accidentally leak a column you cannot join to. Keeping the boundary costs nothing and
--       means the next thing that IS a secret has an obvious home.
-- ============================================================
create table tool_secrets (
  tool_id        uuid primary key references tools(id) on delete cascade,

  -- edge_function: which handler in supabase/functions/run-tool/handlers/ runs this tool.
  -- Defaults to the tool's slug; overridable so two tools can share one handler (e.g. the same
  -- summarizer with different prompts baked into the row).
  function_name  text,

  embed_url      text,   -- iframe
  external_url   text,   -- external_link

  updated_at     timestamptz not null default now(),

  constraint embed_url_is_https
    check (embed_url is null or embed_url like 'https://%')
);

-- embed_url and external_url are not secrets either, but all runtime config has exactly one
-- home so that `select * from tools` can never be a mistake. The server reads them and passes
-- them to the client as props, after an access check.

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
  input         jsonb not null default '{}'::jsonb,   -- NEVER contains secrets. Unit-tested. §9.
  output        jsonb,
  error_message text,
  duration_ms   integer,

  -- Every run is async (§9). A run outlives the request that started it, so it carries
  -- everything needed to resume rendering from a cold page load.
  expires_at    timestamptz,   -- created_at + tools.timeout_seconds. A run still 'running'
                               -- past this is swept to 'timeout' by the reaper job.

  -- File/image outputs are re-hosted into the `run-artifacts` bucket and kept 30 days.
  -- Past this, the file blocks render as expired; every other block renders forever. See §3.
  artifacts_expire_at timestamptz,

  -- Which provider keys this run actually used. Shown on the receipt line. Never the keys.
  providers_used api_provider[] not null default '{}',

  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index tool_runs_user_idx on tool_runs (user_id, created_at desc);
create index tool_runs_tool_idx on tool_runs (tool_id, created_at desc);
-- The reaper reads this. Partial index: only live runs are ever scanned.
create index tool_runs_reaper_idx on tool_runs (expires_at)
  where status in ('queued', 'running');

-- ============================================================
-- 6.8  BYOK KEY VAULT
--      There are no credits. There is no usage billing. Members bring
--      their own provider API keys, so platform compute cost is always zero.
-- ============================================================
create table user_api_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  provider      api_provider not null,
  label         text,                       -- cosmetic only: 'Personal OpenAI', 'Work account'

  -- AES-256-GCM. Three columns, never one blob. Plaintext never touches the DB.
  ciphertext    text not null,              -- base64
  iv            text not null,              -- base64, unique per record
  auth_tag      text not null,              -- base64

  key_hint      text not null,              -- last 4 chars only, e.g. '••••a9F2'
  status        key_status not null default 'unverified',
  last_verified_at timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),

  -- ONE key per provider per user. Not (user, provider, label): `label` is nullable, and
  -- Postgres treats NULLs as distinct, so that constraint constrains nothing — a user could
  -- store fifty unlabelled OpenAI keys and the runner would have no rule for picking one.
  -- No screen in DESIGN.md asks "which key should this tool use?", so we don't build the
  -- question. Adding multi-key later is a purely additive migration.
  unique (user_id, provider)
);

create index user_api_keys_user_idx on user_api_keys (user_id);

-- Column privileges, not just RLS. THIS is what actually protects the ciphertext.
--
-- RLS decides which ROWS you see. It says nothing about COLUMNS. A `select own` policy on
-- this table therefore lets a member read their own ciphertext, iv and auth_tag directly
-- from the browser with the anon key — the view below is not a wall, it's a suggestion,
-- because `security_invoker = true` means the view runs as the caller anyway.
--
-- So we revoke the table wholesale and grant back only the safe columns. Now the view is
-- honest AND the direct-table path is closed. Both doors, one lock.
revoke all on user_api_keys from anon, authenticated;
grant select (id, user_id, provider, label, key_hint, status,
              last_verified_at, last_used_at, created_at)
  on user_api_keys to authenticated;

-- No insert/update/delete grant to any client role. Every write goes through a Server Action
-- with the service-role client, because every write has to encrypt first anyway, and the
-- action re-derives the user from the session. The client cannot write to this table at all.

-- What the client reads. There is no path to ciphertext, iv, or auth_tag from any client role.
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

-- ============================================================
-- 6.13  RATE LIMITS  (in Postgres. There is no Redis in this stack and there will not be.)
--
--       Vercel functions are stateless and share no memory, so an in-process counter is not
--       a rate limiter, it is a decoration. At our scale a table is free, correct, and adds
--       no vendor.
--
--       Per-tool run limits are NOT stored here — they are counted directly from tool_runs,
--       which is already the source of truth. This table is for things with no natural row:
--       application submissions by IP, key-verification calls.
-- ============================================================
create table rate_limit_hits (
  id         bigserial primary key,
  bucket     text not null,        -- 'apply:ip:203.0.113.4' | 'key_verify:user:<uuid>'
  created_at timestamptz not null default now()
);

create index rate_limit_hits_bucket_idx on rate_limit_hits (bucket, created_at desc);

-- Returns true if the caller is UNDER the limit, and records the hit. Atomic enough for an
-- abuse guard; we are not defending a bank vault.
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

-- ============================================================
-- 6.14  SCHEDULED JOBS  (pg_cron)
-- ============================================================
-- 1. The run reaper. Async runs have no request holding them open, so nothing else will ever
--    fail them. Without this, a killed Edge Function leaves a run spinning in the UI forever.
--    Every minute: any 'queued'/'running' run past its expires_at becomes 'timeout'.
--
-- 2. The artifact sweeper. Daily: delete `run-artifacts` storage objects for runs whose
--    artifacts_expire_at has passed. The tool_runs row is KEPT — only the binaries go.
--
-- Both are Edge Functions invoked by pg_cron. Write them in Phase 6.
```

---

## 7. Authorization: helper functions + RLS

Enable RLS on **every** table. Use `security definer` helpers to avoid recursive policy
evaluation (a classic Supabase footgun — never query `profiles` from inside a `profiles`
policy).

```sql
-- ---- helpers -------------------------------------------------

-- is_admin TAKES A SUBJECT. It does not read auth.uid() implicitly.
--
-- The original version hardcoded auth.uid(), which meant can_access_tool(tool, some_member)
-- answered "is the CALLER an admin", not "can THAT USER access this tool". Called from the
-- admin's own session — which is exactly where the per-user access matrix lives — it returned
-- true for every tool, for every member, silently. A permission check that is wrong only when
-- an admin runs it is the worst possible kind of wrong.
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = uid and role = 'admin' and is_suspended = false
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
--
-- Answers exactly one question: "may `uid` OPEN this tool's runner page?"
-- It does NOT answer "may `uid` run it right now" — that also needs the tool to be
-- 'published' (not 'maintenance'), the required keys to be present, and the rate limit to be
-- clear. The runner checks those separately. See §9. Keep the two ideas apart.
create or replace function public.can_access_tool(p_tool_id uuid, uid uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  t          tools%rowtype;
  suspended  boolean;
begin
  -- Anonymous is never granted access to anything. Explicit, not a coalesce() accident.
  if uid is null then return false; end if;

  select * into t from tools where id = p_tool_id;
  if not found then return false; end if;

  -- draft / archived: only an admin can even see the runner.
  if t.status not in ('published', 'maintenance') then
    return public.is_admin(uid);
  end if;

  select is_suspended into suspended from profiles where id = uid;
  if suspended is null then return false; end if;   -- no profile = not a user
  if suspended then return false; end if;           -- suspended beats everything, incl. admin

  if public.is_admin(uid) then return true; end if;

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
    return true;   -- uid is non-null by here
  end if;

  if not public.has_active_membership(uid) then return false; end if;

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

### RLS is not enough on its own — read this before writing a policy

**RLS grants rows. It says nothing about columns.** If a table has a `select` policy for
`authenticated`, a member can read *every column* of *every row that policy permits*, directly
from the browser with the anon key. They do not have to go through our Server Components, and
"we select explicit columns in the server query" protects nothing at all.

Two tables in this schema hold something a member must never read. Both are handled
structurally, not by convention:

| Danger | Wrong fix (what we are not doing) | What we do |
|---|---|---|
| Runtime config on `tools`, a publicly-readable table | "Select explicit columns in the Server Component" | The columns do not exist on `tools`. They live in `tool_secrets`, which has **RLS on and zero policies** — deny-all. Service role only. You cannot leak a column you cannot join to. |
| `user_api_keys.ciphertext` readable by its owner | "Read through the `user_api_keys_public` view" (the view is `security_invoker`, so it enforces nothing the base table doesn't) | **Column-level `GRANT`**: revoke the table from `anon`/`authenticated`, grant `select` on the safe columns only. |

**RLS policy summary** (write these out in full in the migration):

| Table | Members can | Admin can |
|---|---|---|
| `profiles` | select/update own row (not `role`, not `is_suspended`) | all |
| `applications` | insert own (auth required); select own | all |
| `memberships` | select own | all |
| `plans` | select where `is_active` | all |
| `tools` | select where `status in ('published','coming_soon','maintenance')` | all |
| **`tool_secrets`** | **nothing. RLS on, zero policies. Service role only.** | **nothing via the client. Admin reads/writes it through Server Actions on the service-role client.** |
| `user_tool_access` | select own | all |
| `plan_tools` | select | all |
| `tool_runs` | select own; **no insert/update policy at all** — the runner writes with the service role | all |
| `user_api_keys` | select own, **and only the columns granted above** — there is no path to `ciphertext`/`iv`/`auth_tag` from any client role. No insert/update/delete: all writes go through Server Actions. | select the same safe columns. The admin sees *which* providers a member connected, never the key. |
| `rate_limit_hits` | none | none. Service role / `rate_limit_take()` only. |
| `access_codes` | none (redeem via Server Action) | all |
| `feature_requests` | select all; insert own; update own while `status='open'` | all |
| `feature_request_votes` | select all; insert/delete own | all |
| `announcements` | select where `is_published` | all |
| `notifications` | select own; update own `read_at` | all |
| `tool_interest` | select own; insert/delete own | all |
| `audit_logs` | none | select. Inserts go through a `security definer` `log_audit()` function, so no role needs a direct insert grant. |
| `app_settings` | select (public fields only, via a view) | all |

Guard the `profiles.role` column with a trigger: a non-admin must never be able to set
`role = 'admin'` or clear `is_suspended` on any row, including their own.

**Bootstrapping the first admin.** There is no `ADMIN_BOOTSTRAP_EMAIL` and no bootstrap code
path. Postgres cannot read Vercel's environment, and the role-guard trigger above would block
the promotion anyway. Sign up like anyone else, then run one statement in the SQL editor, once,
forever:

```sql
update profiles set role = 'admin' where email = 'you@example.com';
```

A trigger exception that runs once in the product's life is not worth the trigger exception.

---

## 8. Route map

### Public

| Route | Purpose |
|---|---|
| `/` | Landing page. Hero, the shipping log, tool grid, how it works, apply CTA. |
| `/tools` | Public catalog. All `published` + `coming_soon` tools. Locked. |
| `/tools/[slug]` | Public tool page. Description, build video, input preview (disabled), "Apply for access". SEO-optimized. |
| `/changelog` | **Tool launches, newest first.** Launches only — the schema records `launched_at`, not an update history, so there is nothing honest to render for "updates". Do not fake it. If per-update entries are wanted later, that is a `tool_updates` table and a real feature. |
| `/apply` | The application form. **Auth required** — an unauthenticated visitor is sent to `/login?next=/apply` and lands straight back here. Turnstile + honeypot + per-IP rate limit still apply: a signed-in bot is still a bot. |
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

## 9. The tool runner (`edge_function`)

The single most important flow in the app. **Tools are TypeScript that runs on our own Supabase
project.** There is no external execution backend, no webhook out, and no third party in the
path of a member's API key.

### 9.1 What an Edge Function can and cannot do — read this before writing a tool

These are hard platform limits, verified against Supabase's docs (July 2026). A tool is not a
design until it fits inside this box.

| Limit | Value | What it actually means for a tool |
|---|---|---|
| **Wall clock** | **150s Free · 400s Pro** | The hard ceiling on a run. The function is killed at this point, mid-work, no matter what. `tools.timeout_seconds` must be ≤ this. |
| **CPU time** | **2s** (2000ms) | **Does not include async I/O.** This is the number people misread, and it's the one that makes this architecture work: waiting 90 seconds on an OpenAI response burns ~0ms of CPU. Only *your own computation* counts. |
| **Memory** | **256MB** | Never buffer a large file. Stream it. Re-hosting a 200MB artifact by loading it into a `Uint8Array` will kill the isolate. |
| **Request idle timeout** | 150s | Irrelevant to us: we respond in ~100ms and do the work in a background task. |
| **Script size** | 20MB bundled | Not a real constraint. All handlers share one bundle; keep dependencies lean anyway. |
| **Invocations** | 500K/mo Free · 2M/mo Pro | Not a real constraint at our scale. One run ≈ one invocation. |

#### The handler contract: a tool is I/O-bound, or it doesn't belong here

**This is a design constraint on every handler, not a footnote.** It decides which tools can
exist, so it belongs in the design conversation, before a line is written — not in a post-mortem.

The CPU/wall-clock distinction is the whole ballgame. These tools are I/O-bound almost by
definition: call an LLM, wait. Call an API, wait. Waiting is free — a 90-second OpenAI response
burns roughly **0ms** of the 2s CPU budget. That is why 2 seconds is generous rather than absurd.

What a handler may **not** do, because all of it burns real CPU:

- Parse or transform a large file in-process (a 50MB CSV, a big JSON blob).
- Any image, audio, or video work. Resizing a thumbnail is not a small thing here.
- Embedding math, similarity scoring, or clustering over more than a trivial number of vectors.
- Tight loops over large arrays. Anything with an `O(n²)` smell and a real `n`.
- Crypto beyond the key decrypt we already do.

If a tool needs to *compute*, it needs a different home, and **you must notice that while
designing the tool, not when it starts throwing 546s in production.** The question to ask of every
new tool, before anything else: *what is this doing while it isn't waiting on a network call?* If
the answer isn't "almost nothing", the tool is wrong for this platform.

When a tool genuinely needs to process a large file, the shape is: the *provider* does the work
(upload it to them, let their API chew on it), and the handler orchestrates. Orchestration is
I/O. Orchestration is free.

**A tool that takes longer than 400 seconds cannot exist in this architecture.** That is a real
loss versus n8n, which would happily grind for an hour, and it should be a conscious trade rather
than a surprise. Two escape hatches, in order of preference:

1. **Make the tool return sooner.** Most "long" automations are long because they process N items
   serially. Fan them out with `Promise.all` and the wall clock stops being the problem.
2. **Chunk across invocations.** Persist progress on the run row, re-invoke, resume. This is a
   real feature with real complexity — do not build it speculatively. Build it the first time a
   tool actually needs it, and not before.

On the **Free plan the ceiling is 150s**, which is tight for anything doing several sequential
LLM calls. Expect Supabase Pro ($25/mo) to become necessary the moment tools get real. That is
the platform's *only* fixed cost, and it is not a per-member cost — the BYOK economics in §10 are
untouched.

### 9.2 Shape

One Edge Function, `run-tool`. One handler file per tool, dispatched by slug.

```
supabase/functions/
  _shared/
    crypto.ts                    # AES-256-GCM. THE ONLY FILE THAT READS ENCRYPTION_KEY.
    types.ts                     # RunContext, ToolOutput
    providers.ts                 # thin typed wrappers per api_provider (incl. verify calls)
    artifacts.ts                 # stream a URL into the run-artifacts bucket
  run-tool/
    index.ts                     # service-role gate, load run, decrypt keys, dispatch, background task
    handlers/
      youtube-lead-finder.ts     # export default async (ctx) => output
      thumbnail-critic.ts
      ...
  key-vault/
    index.ts                     # save / verify a member's key. Encrypts and decrypts here.
  run-reaper/                    # pg_cron: fail runs that never finished
  artifact-sweeper/              # pg_cron: delete artifacts past 30 days
```

**`_shared/crypto.ts` is the only file in the entire codebase that reads `ENCRYPTION_KEY`, and it
runs only on Supabase.** There is no `lib/crypto.ts` in the Next app, because the Next app has
nothing to encrypt and no key to do it with.

**Shipping a new tool is: write one handler file, `supabase functions deploy run-tool`, then
create the row in the admin editor.** The deploy is the only thing that isn't clickable, and it
is one command. Everything a *user* sees — the form, the validation, the output rendering — still
comes entirely from the row. §3 is unchanged and remains the real leverage.

A handler is a pure-ish function. It receives validated input and the member's decrypted keys,
and returns an object matching the tool's `output_schema`. It does not touch the database, it
does not know what a run is, and it does not manage its own errors — `index.ts` owns all of that,
once, for every tool.

```ts
// handlers/youtube-lead-finder.ts
export default async function run(ctx: RunContext): Promise<Record<string, unknown>> {
  const { input, secrets } = ctx           // input is already Zod-validated against input_schema
  const channels = await searchChannels(input.channel_url, secrets.youtube_data)
  const summary  = await summarize(channels, secrets.openai)
  return { summary, leads: channels }      // keys match output_schema block keys
}
```

### 9.3 The flow

```
1.  Member submits the auto-rendered form.

2.  startRun() Server Action (Vercel). Returns in well under a second:
      a. Verify auth. Derive user_id from the session. Never from the request body.
      b. can_access_tool(tool_id, user_id) — re-check server-side, always, even though the UI
         already hid the button.
      c. tool.status = 'published'. If 'maintenance', stop with the notice from DESIGN.md §12.
      d. has_required_keys(tool_id) — if false, stop and name exactly which provider is missing,
         with a link to /dashboard/keys pre-filtered to it.
      e. Daily rate limit: count today's (UTC) tool_runs for this user+tool. The stricter of
         tools.rate_limit_per_day and the user's plans.max_runs_per_day wins. Abuse guard only.
      f. Validate input against a Zod schema compiled from tool.input_schema (lib/schema.ts).
      g. Insert tool_runs: status='running', input=<validated, NO SECRETS>,
         expires_at = now() + tools.timeout_seconds, providers_used = tool.required_providers.
      h. Invoke the Edge Function with the SERVICE ROLE key:
            POST https://<ref>.supabase.co/functions/v1/run-tool
            Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
            Body: { run_id }        <-- and nothing else. See below.
         Wait only for the 202. Ten-second timeout on the handshake — we are waiting for
         "accepted", not for work.
      i. Non-2xx or handshake timeout → mark the run 'error' immediately. Nothing was started.
      j. Return { run_id }.

    NOTE WHAT IS NOT IN THAT LIST: the Server Action never decrypts anything, never holds a
    plaintext key, and never sends one. The body is a run_id. Vercel cannot leak what it does
    not have. See §10.

3.  run-tool Edge Function:
      a. REJECT ANY CALLER THAT IS NOT THE SERVICE ROLE. See 9.4. This is not optional.
      b. Load the run row by run_id (service role), and its tool. The run row is the ONLY input
         we trust, because only our Server Action could have created it — and it already
         verified auth, access, status, keys and the rate limit before doing so.
      c. Read the member's ciphertext from user_api_keys for tool.required_providers, and
         DECRYPT IT HERE, with ENCRYPTION_KEY from Supabase secrets. This is the only place in
         the entire system where a plaintext member key exists.
      d. Look up the handler by function_name (or slug). Unknown slug → 'error', return 400.
      e. EdgeRuntime.waitUntil(work())  ← NOT awaited
         return new Response(null, { status: 202 })
      f. work(), now running in the background with the request already answered:
           - handler(ctx) with { input, secrets }
           - re-host any file/image URLs in the output into run-artifacts/{user_id}/{run_id}/{key},
             streaming, never buffering (256MB). Set artifacts_expire_at = now() + 30 days.
           - update tool_runs: status='success', output, completed_at, duration_ms
             — written directly, with the service role. There is no callback and no HTTP hop back.
           - update user_api_keys.last_used_at.
      g. On a thrown error: status='error', error_message (a sentence, not a stack trace).
      h. On a provider 401/403: set that user_api_keys row to status='invalid', mark the run
         'error' with the provider named, and email the member once per key (not per run). This
         is the most common failure in BYOK and it is a first-class path, not an edge case.
      g. addEventListener('beforeunload', ...) → the isolate is being shut down (wall clock, CPU,
         or memory). Write status='timeout' with the shutdown reason. Best-effort: it may not
         land, which is exactly why the reaper below exists and is not redundant.

4.  Realtime pushes the updated tool_runs row to the browser. The UI renders it. No polling.
```

**The Server Action never waits for the tool.** It hands off and returns. A member can close the
tab, close the laptop, come back tomorrow — the run finished without them and it is on
`/dashboard/runs/[id]`. This is the same async-first guarantee as before; only the executor
changed.

### 9.4 The Edge Function is on the public internet

`https://<ref>.supabase.co/functions/v1/run-tool` is reachable by anyone. **`verify_jwt` is not
authorization** — the anon key *is* a valid JWT, so the default setting would happily let any
visitor invoke `run-tool` with a hand-written body: someone else's `run_id`, arbitrary `secrets`,
any handler they like.

So the first thing `index.ts` does, before anything else:

```ts
const presented = req.headers.get('X-Runner-Secret') ?? ''
if (!timingSafeEqual(presented, Deno.env.get('RUNNER_SECRET'))) {
  return new Response('not found', { status: 404 })   // 404, not 401. Don't confirm it exists.
}
```

A DEDICATED secret (`RUNNER_SECRET`), not the service-role key: Supabase injects the *new-format*
secret key into functions while the startRun Server Action holds the *legacy JWT* service-role key,
so a byte-compare against `SUPABASE_SERVICE_ROLE_KEY` can never match. `RUNNER_SECRET` lives in
Supabase secrets AND in the app env, and its only job is to prove "our backend sent this". It
**cannot decrypt anything** — `ENCRYPTION_KEY` is not on Vercel — so it does not weaken §13, and
`run-tool` sets `verify_jwt = false` precisely so this check, not the gateway, is the gate.

Constant-time compare it. **The only caller in the world that may invoke `run-tool` is our own
Server Action**, which has already verified the session, the access grant, the tool status, the
keys, and the rate limit. The Edge Function trusts its input completely *because* nothing else
can reach it — and that trust is only safe as long as this check is the first line in the file.

### 9.5 The reaper (still required)

An Edge Function that is killed at the wall clock, runs out of memory, or dies in a way that
skips its own `beforeunload` handler will leave a run sitting in `running` forever, and a spinner
turning forever in someone's dashboard. Nothing else in the system will ever notice.

pg_cron, every minute: any run still `queued`/`running` past `expires_at` becomes `timeout`.
Not optional, and not Phase 8.

### 9.6 Secrets: the one rule

**Never persist `secrets` anywhere.** Not in `tool_runs.input`, not in a log line, not in an
error message, not in a Sentry breadcrumb, not in a thrown exception's `cause`. Strip keys before
the run row is written. **Write a unit test that asserts a saved run row, serialized, does not
contain a known test key** — and run it in CI, because this is the failure that ends the product.

A handler receives `ctx.secrets` and must never log it. `console.log(ctx)` in a handler is a
security incident, because Edge Function logs are retained. Say so in the handler template's
comment header, where someone writing tool #12 in a hurry will actually read it.
---

## 10. BYOK — bring your own keys

**The economic model of this platform: the member pays their provider, not me. Platform
compute cost is always zero. There are no credits, no usage metering, no billing. A
membership buys access to the tools; the member supplies the fuel.**

(The platform's *fixed* cost is a Supabase plan. That is not a per-member cost and does not
scale with usage. A thousand members running a thousand tools costs the same as one.)

### Where a key goes, exactly

Tools execute on our own Supabase project, and **all cryptography happens there too.** The full
path of a member's API key, end to end:

1. The member pastes the key into the vault. The browser sends it, over TLS, **directly to the
   `key-vault` Edge Function** — not through Vercel. The function derives the user from their
   JWT, encrypts with `ENCRYPTION_KEY` from Supabase secrets, stores the ciphertext, and
   discards the plaintext.
2. On a run, the `run-tool` Edge Function reads that ciphertext from the database and decrypts
   it, in memory, inside the same isolate that is about to use it.
3. The handler holds it for the length of one call to the provider.
4. The isolate dies. Nothing wrote it down.

**Vercel appears nowhere in that list.** It does not encrypt, it does not decrypt, it never sees
a plaintext key, and it does not hold `ENCRYPTION_KEY`. It is a UI and an auth layer. See §13.

There is no external workflow engine, no third-party execution log, no `EXECUTIONS_DATA_SAVE`
setting to remember, and no vendor that could retain a key by default while we weren't looking.
The previous design's single most dangerous failure mode — one un-ticked checkbox in n8n silently
writing every member's key to a database we don't own — **does not exist in this architecture.**
It isn't mitigated; it's gone.

The two things left to get right are both ours: don't log the key (§9.6), and don't let anyone
but our own Server Action invoke `run-tool` (§9.4).

### The `key-vault` Edge Function

Saving and verifying a key are the **one deliberate exception** to "every mutation is a Server
Action" (§5). The client calls this function directly, with the member's own JWT:

```
POST https://<ref>.supabase.co/functions/v1/key-vault
Authorization: Bearer <the member's access token>
Body: { action: 'save' | 'verify' | 'delete', provider, label?, plaintext? }
```

- **The user is derived from the JWT**, via `auth.getUser()`. A `user_id` in the body is ignored.
  If one is ever added, that is a vulnerability, not a convenience.
- `save` → encrypt, upsert (one key per provider), then immediately `verify`.
- `verify` → decrypt, make the cheapest read-only call to the provider (table below), write
  `status` and `last_verified_at`. Rate-limited per user via `rate_limit_take()`.
- `delete` → drop the row. No crypto needed, but it lives here so the vault has one door.

The exception is worth it precisely because of what it buys: **a plaintext API key never transits
Vercel at all.** Routing the save through a Server Action would mean the key passes through
Vercel's memory on its way to being encrypted — briefly, unlogged, and almost certainly fine. But
"almost certainly fine" is a weaker claim than "impossible", and this is the one asset in the
product where the difference is worth an architectural exception. Take the stronger claim.

### Encryption

- AES-256-GCM, **in Deno, in `supabase/functions/_shared/crypto.ts`**. That file is the only
  thing in the codebase that reads `ENCRYPTION_KEY`, and it only ever runs on Supabase.
- **`ENCRYPTION_KEY` lives in Supabase secrets and nowhere else.** Not in `.env.local`, not in
  `.env.example`, and — this is the point — **not in Vercel**. See §14.
- Fresh random 12-byte IV per record. Store `ciphertext`, `iv`, `auth_tag` separately.
- Encrypt in the `key-vault` function. Decrypt in the `key-vault` function (to verify) and in
  `run-tool` (to run). Nowhere else, ever.
- **One key per provider per user.** `unique (user_id, provider)`. Saving a second OpenAI key
  replaces the first. There is no "which key does this tool use?" question, so we never have to
  build a screen that answers it.
- The client never receives ciphertext — enforced by **column-level `GRANT`**, not by politely
  reading through a view. See §7.
- Rotating `ENCRYPTION_KEY` invalidates every stored key. Document that. Don't rotate casually.

### What we tell the user, and what is actually true

Do not claim the admin *cannot* read a member's key. It is not true: the admin holds
`ENCRYPTION_KEY` and the service-role key, and could write ten lines of code to decrypt anything.
An over-promise here is worse than no promise — the audience is technical, and they will work it
out.

The true claim is strong enough. **This is the exact copy. Use it verbatim in the key vault, and
say nothing stronger anywhere else in the product:**

> Your key is encrypted before it's stored. No screen in this product can show it back to you —
> or to me. A leaked database is useless without a key I keep off the server.

Every clause of that is literally, defensibly true.

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

- RLS on every table, from the first migration. **And remember RLS grants rows, not columns** —
  see §7. Anything a member must never read lives in a table they have no policy on, or behind
  a column-level `GRANT`. Never behind a convention.
- `SUPABASE_SERVICE_ROLE_KEY` never appears in a client component, a `NEXT_PUBLIC_` var, or a
  client-reachable bundle.
- Every Server Action re-derives the user from the session. Never accept a `user_id` from the
  client and trust it.
- Admin checks happen in **three** places: middleware (route guard), the page (Server
  Component), and the Server Action (the mutation). Middleware alone is not authorization.
- `can_access_tool()` is checked server-side on every run, even though the UI already hid the
  button. It takes an explicit subject — never rely on it reading `auth.uid()` for you.
- Runtime config is not on a client-readable table. It lives in `tool_secrets`, which has RLS on
  and no policies. There is nothing to remember not to select.

### The strongest claim this product can make — protect it

**Vercel holds no secret capable of exposing a member's API key, and no plaintext key ever passes
through it. Not in memory, not in transit, not for a millisecond.**

This is a *property of the architecture*, not a promise about our discipline, and that is exactly
what makes it worth having. It holds because:

- `ENCRYPTION_KEY` exists only in Supabase secrets. Vercel does not have it and must never be
  given it. A full compromise of the Vercel project — every env var, every log, the entire
  runtime — yields ciphertext and nothing else.
- The key vault is written by the browser calling the `key-vault` Edge Function **directly**.
  The plaintext key goes browser → Supabase. Vercel is not on the path.
- `run-tool` decrypts the ciphertext itself, from the database, inside the isolate that uses it.
  The Server Action sends it a `run_id` and nothing more.
- Therefore: no Vercel log line, no Sentry breadcrumb, no serialized Server Action argument, and
  no leaked Vercel env var can ever contain a member's key. There is nothing there to leak.

**Three things would silently destroy this property. Treat all three as production incidents:**

1. Adding `ENCRYPTION_KEY` to Vercel's environment "just for a script".
2. Routing the key-save through a Server Action because it's more consistent with §5.
3. Passing decrypted `secrets` in the `run-tool` request body because it's easier to debug.

Each is a small, reasonable-looking convenience. Each one converts an impossibility back into a
promise. If you find yourself reaching for one, the correct move is to write the code inside an
Edge Function instead.

### The execution boundary

There is no outbound webhook, so there is no HMAC signing, no callback endpoint, no replay
window, and no host allowlist. **All of that machinery existed to make it safe to hand a member's
key to someone else's server. We no longer do that, so it's deleted rather than maintained.**

What replaces it is a single check, and it carries the entire weight:

- **`run-tool` must reject any caller that is not the service role.** The function is on the
  public internet. `verify_jwt` is *not* authorization — the anon key is a valid JWT, so a
  visitor could otherwise invoke it directly with a forged body: someone else's `run_id`,
  arbitrary `secrets`, any handler. The first statement in `index.ts` compares the bearer token
  against `SUPABASE_SERVICE_ROLE_KEY` in constant time and 404s otherwise. See §9.4.
- Everything the Edge Function trusts — that the user is who they say, that they have access,
  that the tool is published, that their keys are theirs, that they're under the rate limit —
  was verified by the Server Action. That trust is sound **only** because nothing else can reach
  the function. If that check ever moves out of first position, the whole model collapses.

### The rest

- Turnstile on `/apply`, plus a honeypot field, plus a **per-IP rate limit in Postgres**
  (`rate_limit_take()`, §6.13). Not an in-process counter: Vercel functions share no memory, so
  an in-process limit is a limit of one instance, which is no limit. Auth is now also required
  to apply — but a signed-in bot is still a bot, so none of the above is dropped.
- **Member API keys:** encrypted at rest (AES-256-GCM), decrypted only inside a Supabase Edge
  Function and only for the length of one call, never logged, never persisted into `tool_runs`,
  never exposed by any interface in the product to anyone, including the admin. Be precise about
  this claim — see §10.
- **A key never reaches a third party.** Tools run on our own Supabase project. There is no
  external execution engine that could retain a key by default, and therefore no vendor setting
  we have to remember to turn off.
- **A handler must never log `ctx.secrets`.** Edge Function logs are retained. `console.log(ctx)`
  is a security incident, not a debugging convenience. See §9.6.
- Log every admin mutation to `audit_logs`.

---

## 14. Environment variables

```bash
NEXT_PUBLIC_SITE_URL=               # differs per environment.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server only
RESEND_API_KEY=
RESEND_FROM_EMAIL=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

### `ENCRYPTION_KEY` is not in that list. Its absence is deliberate.

**Do not add `ENCRYPTION_KEY` to Vercel. Do not add it to `.env.local`. Do not add it to
`.env.example`.** If you are reading this in six months, having just noticed it's missing and
assumed someone forgot: nobody forgot. It was removed on purpose, and putting it back would
quietly destroy the security property in §13.

It lives in **Supabase secrets, and only there**, because the only code that reads it is
`supabase/functions/_shared/crypto.ts`, which only ever runs on Supabase:

```bash
supabase secrets set ENCRYPTION_KEY="$(openssl rand -base64 32)"   # once, at setup
supabase secrets list                                              # confirm; never prints values
```

Back it up in a password manager the moment you generate it. **If you lose it, every member's
stored API key is permanently unrecoverable.** There is no reset path and there is not supposed
to be one.

The Edge Function runtime also gets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` injected by
the platform — you do not set those.

**There is no `ADMIN_BOOTSTRAP_EMAIL`.** Postgres cannot read this file, so the trigger could
never have used it. Promote yourself with one line of SQL, once. See §7.

---

## 15. Conventions

```
app/
  (marketing)/          # public: landing, tools, changelog, apply
  (auth)/               # login, callback
  (app)/dashboard/      # member app
  (admin)/admin/        # admin
components/
  tools/                # ToolForm, ToolOutput, ToolCard, RunStatus
  ui/                   # shadcn
lib/
  supabase/             # server.ts, client.ts, admin.ts (service role)
  access.ts             # canAccessTool, requireAdmin, requireMember
  schema.ts             # Zod: compile input_schema -> Zod schema
  keys.ts               # key vault, CLIENT side of it: list from the public view, and call
                        # the key-vault Edge Function to save/verify/delete. No crypto here.
  runner.ts             # startRun: validate, decrypt, invoke run-tool, expect 202
  ratelimit.ts          # thin wrapper over rate_limit_take()
  audit.ts
actions/                # Server Actions, grouped by domain
supabase/
  migrations/
  functions/
    run-tool/           # THE executor. index.ts + handlers/<slug>.ts + _shared/
    run-reaper/         # pg_cron: fail runs that outlived expires_at
    artifact-sweeper/   # pg_cron: delete run artifacts past 30 days
```

**There are no API routes.** `/api/runs/callback` is gone with n8n — nothing calls us from the
outside any more. If you find yourself adding an API route, stop and ask what is calling it.

- Server Actions live in `actions/`, each file starts with `"use server"`, each action starts
  with an auth check.
- Types are generated from the database: `supabase gen types typescript`. Never hand-write
  row types.
- No `any`. No `@ts-ignore`.

---

## 16. Build order

Stop after each phase. Show me what works. Wait for a go-ahead.

**Phase 0 — Foundation**
Next.js 15 + TS + **Tailwind v4** + shadcn. Supabase project wired. Fonts loaded. Design tokens
as CSS-first `@theme` in `globals.css`, `[data-theme]` dark variant. Empty layouts for
marketing / app / admin. Deployed to Vercel (Hobby).
*Done when:* the three shells render, both themes are correct, and the site is live.

**Phase 1 — Auth + profiles**
Migration 6.2. Google OAuth + magic link (Resend as Supabase's SMTP provider — the built-in
sender's rate limit will otherwise look like a bug in our code). `handle_new_user` trigger. The
`profiles.role` guard trigger. Middleware route guards. RLS on `profiles`. Promote yourself to
admin with the one-line SQL from §7 — there is no bootstrap env var.
*Done when:* I can sign in, my profile row exists, and `/admin` is blocked for a normal user.

**Phase 2 — Tools schema + public catalog**
Migrations 6.3, 6.6, **6.6b (`tool_secrets`)**. `tool_secrets` ships *with* `tools`, not as a
retrofit — the moment `tools` has a select policy and runtime config in the same row, that config
is public, and a "we'll split it out later" is a window during which it leaked. Seed 3
sample tools. `/tools`, `/tools/[slug]` with locked state and video embed. Landing page with the
Shipping Log.
*Done when:* the public site sells the product to a stranger — and `select * from tools` as a
logged-in member returns nothing I'd mind seeing on Twitter.

**Phase 3 — Application funnel**
Migrations 6.4, **6.13 (rate limits)**. `/apply` — **auth required** — with Turnstile + honeypot
+ per-IP Postgres rate limit. `/apply/thanks`. Discord webhook ping on new application.
`/admin/applications` review queue with approve / waitlist / reject.
*Done when:* someone can sign in, apply, and I see it in the admin queue.

**Phase 4 — Membership + the access engine**
Migrations 6.5, 6.7 (partial), 6.11. All helper functions from §7 — `is_admin(uid)` takes a
subject. Approving an application creates a membership + grants tools. `/dashboard` shows the
empty Apps state for applicants and the tool grid for members. `/admin/users/[id]` with the
per-user tool access matrix. **The command palette (⌘K)** — moved here from Phase 1, because in
Phase 1 it would have fuzzy-searched an empty array. Now there are tools, users, and runs to find.
*Done when:* I can approve a user, tick a tool for them, and they see exactly that tool — and
flipping a tool to `access_type='members'` opens it for everyone at once. And the access matrix
tells the truth when *I* am the one looking at it (see the `is_admin(uid)` note in §7).

**Phase 5 — The BYOK key vault**
Migration 6.8, including the column-level `GRANT`s — the view alone protects nothing.
**`supabase/functions/_shared/crypto.ts` (AES-256-GCM, Deno) and the `key-vault` Edge Function.**
`ENCRYPTION_KEY` set via `supabase secrets set` — never added to Vercel (§14).
`/dashboard/keys`: add, verify, relabel, delete — the browser calls `key-vault` directly, so a
plaintext key never transits Vercel. One key per provider. Provider guides. The honesty copy from
§10, verbatim. `has_required_keys()`. Tool cards show their three-state key chip (DESIGN.md §9).
*Done when:* I can save an OpenAI key, verify it, and confirm the plaintext exists nowhere in the
database, the logs, or any client payload; that `select ciphertext from user_api_keys` from the
browser console, as the key's own owner, is denied; and that `ENCRYPTION_KEY` appears in
`supabase secrets list` and in **no** Vercel environment.

**Phase 6 — The tool runner (Edge Functions, async-first)**
`ToolForm` + `ToolOutput` generic renderers. `lib/schema.ts` (JSON → Zod). `lib/runner.ts`
(`startRun` → invoke → 202, returns in under a second). The **`run-tool` Edge Function**:
service-role gate (§9.4), slug dispatch, `EdgeRuntime.waitUntil` background task, direct writes
to `tool_runs`, `beforeunload` shutdown capture. One real handler. Artifact re-hosting into
Storage (streaming), 30-day expiry. **The run reaper** (pg_cron) and the artifact sweeper.
Realtime run updates. The full run choreography from DESIGN.md §8, **including the resumed-run
state**. `/dashboard/runs`.
*Done when:* a member runs a real tool with their own key, **closes the tab, comes back, and the
finished run is there** — the run feels good enough that I want to record it for YouTube — and
invoking `run-tool` directly with the anon key gets a 404.

**Phase 7 — Admin tool editor**
Visual `input_schema` builder. Output block builder. Required-providers picker. "Test run"
using my admin keys. `/admin` metrics.
*Done when:* I can ship a brand-new tool by writing one handler file, running
`supabase functions deploy run-tool`, and doing everything else — form, validation, output
rendering, access, rate limit — from the admin dashboard. The deploy is the only step that isn't
a click, and it is one command.

**Phase 8 — Email + notifications**
Migration 6.10 (notifications). Resend templates from Section 11. In-app bell.
Announcements banner.

**Phase 9 — Access codes + referrals**
Migration 6.9. `/admin/codes`. `/dashboard/redeem`. Referral link + auto-grant on N referrals.

**Phase 10 — Community loop**
Migration 6.10 (feature requests, tool interest). Feature request board with upvotes.
`/changelog` — **launches only**; there is no update history in the schema and we do not invent
one. "Notify me" on `coming_soon` tools. Shipped-request notifications.

---

## 17. Acceptance criteria for the whole thing

Before this is called done, all of these must be true:

- [ ] A stranger can find a tool page via Google, understand it, sign in, and apply in under
      60 seconds.
- [ ] I can approve an application in one click and the user gets an email.
- [ ] I can open one tool to every member with a single dropdown change.
- [ ] I can grant one specific tool to one specific user with a single checkbox — and the access
      matrix shows me the truth, not "yes to everything because I'm the admin looking at it".
- [ ] I can ship an entirely new tool with **one handler file and one deploy command**, and do
      everything a user can see — form, validation, output rendering, access, rate limit, copy —
      from the admin dashboard with no deploy at all.
- [ ] A member cannot run a tool they don't have access to, even by crafting the request by hand.
- [ ] `run-tool` invoked directly with the anon key, or any JWT that isn't the service role,
      returns 404 and does nothing.
- [ ] A brand-new signup can run at least one useful tool without connecting any API key.
- [ ] **No interface in this product will show a stored API key back to anyone, including me**,
      and a leaked database dump is useless without `ENCRYPTION_KEY`, which is not in the
      database. (Stated exactly this way. I hold the key and the service role; pretending
      otherwise would be a lie to a technical audience.)
- [ ] **`ENCRYPTION_KEY` does not exist in any Vercel environment.** A total compromise of the
      Vercel project yields ciphertext and nothing else. No plaintext member key ever passes
      through Vercel, in memory or in transit. (§13)
- [ ] A member cannot read their own `ciphertext` column from the browser, as themselves.
- [ ] A member cannot read any row of `tool_secrets`, from the browser, as themselves.
- [ ] No API key ever appears in `tool_runs`, in a log line, or in a client payload.
- [ ] **No member's API key is ever sent to software I do not control.** There is no third-party
      execution engine in the path, so there is no vendor setting that could betray this by
      default.
- [ ] The platform's compute bill for any member's usage is exactly zero. The Supabase plan is a
      fixed cost and does not scale with members.
- [ ] A run that fails on a bad key says so plainly and links to the fix.
- [ ] A member can start a run, close the tab, come back an hour later, and find the finished
      run waiting — with its output intact.
- [ ] A run whose Edge Function is killed at the wall clock, or dies without writing a result, is
      `timeout` — not a spinner that turns forever.
- [ ] Every published tool completes inside the Supabase wall-clock limit (150s Free / 400s Pro),
      and no tool needs more than 2s of actual CPU.
- [ ] A run's file outputs are still downloadable a week later, and after 30 days the run still
      renders — with the file marked expired, not broken.
- [ ] Nothing in the product depends on a Vercel plan above Hobby.
- [ ] No table is readable without RLS permitting it, **and no column is readable that RLS
      merely failed to think about.**
- [ ] Adding Paddle later requires **no destructive migration and no data backfill**. (It will
      require *a* migration — an events table for webhook idempotency, at minimum. The promise
      is that nothing already stored has to move or be rewritten.)
- [ ] Every screen matches `DESIGN.md`. No ad-hoc styles anywhere in the codebase.
