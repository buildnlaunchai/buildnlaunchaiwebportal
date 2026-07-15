-- ============================================================================
-- Phase 6 — The tool runner.  (CLAUDE.md §6.7, §9)
--
-- Async-first: a run outlives the request that started it. The Server Action
-- inserts a row and hands off to the run-tool Edge Function, which does the work
-- in a background task and writes the result straight back here. The browser
-- watches this table over Realtime. Nothing holds an HTTP request open.
-- ============================================================================

create type run_status as enum ('queued', 'running', 'success', 'error', 'timeout');

create table tool_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  tool_id       uuid not null references tools(id) on delete cascade,
  status        run_status not null default 'queued',

  input         jsonb not null default '{}'::jsonb,   -- validated form values. NEVER secrets.
  output        jsonb,
  error_message text,
  duration_ms   integer,

  -- created_at + tools.timeout_seconds. A run still 'running' past this is swept
  -- to 'timeout' by the reaper — nothing else will ever fail a dead async run.
  expires_at    timestamptz,

  -- file/image outputs are re-hosted to the run-artifacts bucket and kept 30
  -- days. Past this the file blocks render as expired; text is kept forever.
  artifacts_expire_at timestamptz,

  -- which provider keys the run actually used (shown on the receipt line).
  providers_used api_provider[] not null default '{}',

  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index tool_runs_user_idx on tool_runs (user_id, created_at desc);
create index tool_runs_tool_idx on tool_runs (tool_id, created_at desc);
-- The reaper reads this. Partial: only live runs are ever scanned.
create index tool_runs_reaper_idx on tool_runs (expires_at)
  where status in ('queued', 'running');

-- ---------------------------------------------------------------------------
-- RLS: a member sees only their own runs. There is NO insert/update policy for
-- any client role — the runner writes with the service role. A member can never
-- fabricate a run row or flip a status by hand.
-- ---------------------------------------------------------------------------
alter table tool_runs enable row level security;

create policy tool_runs_select_own
  on tool_runs for select to authenticated
  using (user_id = auth.uid());

create policy tool_runs_select_admin
  on tool_runs for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Realtime: the runner page subscribes to its own row, so the UI updates the
-- instant the background task writes the result. Realtime respects RLS, so a
-- subscriber only ever receives their own rows.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table tool_runs;

-- ---------------------------------------------------------------------------
-- The run reaper (§9.5). A pure SQL cron job — no Edge Function needed for a
-- one-line UPDATE. Every minute, any run still queued/running past its
-- expires_at becomes 'timeout'. Without this, a killed Edge Function leaves a
-- spinner turning forever in someone's dashboard.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule(
  'run-reaper',
  '* * * * *',
  $$
    update tool_runs
       set status = 'timeout',
           completed_at = now(),
           error_message = 'The tool never reported back in time.'
     where status in ('queued', 'running')
       and expires_at is not null
       and expires_at < now()
  $$
);

-- ---------------------------------------------------------------------------
-- run-artifacts storage bucket (private). The runner streams file/image output
-- URLs into it at completion; members read only their own via a signed URL.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('run-artifacts', 'run-artifacts', false)
on conflict (id) do nothing;

-- A member may read objects under their own {user_id}/... prefix. The runner
-- writes with the service role (bypasses this).
create policy "run_artifacts_read_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'run-artifacts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
