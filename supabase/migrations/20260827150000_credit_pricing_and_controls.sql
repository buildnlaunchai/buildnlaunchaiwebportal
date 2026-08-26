-- ============================================================================
-- CREDIT SYSTEM — provider pricing, the kill switch, and a concurrency cap
--
-- Everything the AI gateway needs from the database before it can exist. The
-- gateway itself is the next step; this is the table it prices against and the
-- two controls that stop it running away.
--
-- WHY A PRICING TABLE AND NOT A CODE CONSTANT
-- ----------------------------------------------------------------------------
-- _shared/client-gate.ts deliberately keeps its provider allow-list in code,
-- with a note explaining that moving a security boundary into a form field is
-- how it stops being one. This is the other kind of thing: a provider's price is
-- a commercial fact that changes on THEIR schedule, not ours, and finding out
-- about a price cut should not require a deploy.
--
-- It is also, and not incidentally, A MODEL ALLOW-LIST. The gateway rejects any
-- model with no row here, which means a client cannot ask for a model twenty
-- times more expensive than the one it was built around. That is why an unknown
-- model must never fall back to a default rate: a fallback is a guess about
-- money, wrong in one direction on every call until someone notices.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- provider_model_prices
--
-- numeric(20,12) is not decoration. The smallest rate here is gpt-4o-mini input
-- at $0.15 per million tokens = 0.000000150000 per token — seven leading zeros
-- before a significant digit. A numeric(12,6) would silently round it to zero
-- and every call on that model would cost nothing.
-- ---------------------------------------------------------------------------
create table provider_model_prices (
  id       uuid primary key default gen_random_uuid(),
  provider api_provider not null,
  model    text not null,

  -- What one unit IS. OpenAI bills tokens and splits input from output;
  -- ElevenLabs bills characters and has no output side at all.
  unit     text not null check (unit in ('token', 'character')),

  input_usd_per_unit  numeric(20,12) not null check (input_usd_per_unit >= 0),
  -- Zero for character-billed providers, where there is only one rate.
  output_usd_per_unit numeric(20,12) not null default 0
    check (output_usd_per_unit >= 0),

  is_active boolean not null default true,

  -- WHERE THIS NUMBER CAME FROM. A comment in this file would be the obvious
  -- place, except that the person who edits this row in six months is looking
  -- at a table, not at a migration they have never opened. Provenance belongs
  -- next to the number it justifies.
  source_note text,

  -- When this price stops being trustworthy — a promotional rate's end date.
  -- A DATE and not a comment because it has to be QUERYABLE: the admin
  -- dashboard reads it and says something out loud. A fact nobody is shown is
  -- a fact nobody acts on.
  review_after date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (provider, model)
);

-- The gateway's only lookup.
create index provider_model_prices_active_idx
  on provider_model_prices (provider, model)
  where is_active;

create trigger provider_model_prices_touch_updated_at
  before update on provider_model_prices
  for each row execute function public.touch_updated_at();

alter table provider_model_prices enable row level security;

-- Admin only, and no public view alongside it — unlike credit_settings, there
-- is nothing here a member needs. This table is our COST BASIS: what we pay a
-- provider, before margin. A member's own price is credit_usd_value, which they
-- can already read, and the credits a call costs, which the gateway tells them.
create policy provider_model_prices_all_admin
  on provider_model_prices for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- Seed. Models taken from the CODE that will call the gateway, not from a
-- catalogue — an unused model priced here is dead weight, and a used one
-- missing here is a run that fails for a reason nobody can see.
--
--   UpworkPilot        sidepanel/components/settings.js:40-41
--   Raw Footage script src/lib/scriptProviders.ts:21-23
--   Raw Footage voice  src-tauri/src/elevenlabs.rs:604,613
--
-- Prices from developers.openai.com/api/docs/pricing and elevenlabs.io/pricing,
-- both read 2026-08-27. Per-unit values are the published per-million (OpenAI)
-- or per-thousand (ElevenLabs) rate divided out, written in full rather than as
-- an expression so the stored number is exactly what was reviewed.
--
-- NOTE ON A STALE SOURCE, because it nearly went in: several pricing aggregators
-- still list Terra at $2.50/$15 and Luna at $1.00/$6.00. Those are the rates
-- from BEFORE OpenAI's 2026-07-30 cut. The figures below are OpenAI's own.
-- ---------------------------------------------------------------------------
insert into provider_model_prices
  (provider, model, unit, input_usd_per_unit, output_usd_per_unit, source_note, review_after)
values
  -- ---- OpenAI, chat completions (UpworkPilot) ----------------------------
  -- Not on OpenAI's current frontier list, but still published and still what
  -- the extension sends. They get priced because they get used.
  ('openai', 'gpt-4o-mini', 'token', 0.000000150000, 0.000000600000,
   'OpenAI pricing page, read 2026-08-27: $0.15/1M in, $0.60/1M out. Matches the extension''s own hardcoded table in sidepanel/utils/ai-engine.js.', null),

  ('openai', 'gpt-4o', 'token', 0.000002500000, 0.000010000000,
   'OpenAI pricing page, read 2026-08-27: $2.50/1M in, $10.00/1M out.', null),

  -- ---- OpenAI, Responses API (Raw Footage script) ------------------------
  ('openai', 'gpt-5.6-luna', 'token', 0.000000200000, 0.000001200000,
   'OpenAI pricing page, read 2026-08-27: $0.20/1M in, $1.20/1M out (post 2026-07-30 cut).', null),

  ('openai', 'gpt-5.6-terra', 'token', 0.000002000000, 0.000012000000,
   'OpenAI pricing page, read 2026-08-27: $2.00/1M in, $12.00/1M out (post 2026-07-30 cut).', null),

  -- PROMOTIONAL. OpenAI's own words: "GPT-5.6 Sol's promotional pricing is
  -- available at least through November 21, 2026." Standard is $5/$30.
  --
  -- Seeded at the ACTUAL price we pay, not the standard one. This column is a
  -- cost basis; seeding $5/$30 would bill members for a cost we do not incur,
  -- which is a hidden margin wearing a safety jacket.
  --
  -- The risk is real and runs the other way: when the promo ends, output goes
  -- $20 -> $30, a 50% rise against a 1.3 margin that only absorbs 30%. An
  -- output-heavy call would run at a loss. review_after is what makes that
  -- visible instead of silent.
  ('openai', 'gpt-5.6-sol', 'token', 0.000004000000, 0.000020000000,
   'OpenAI pricing page, read 2026-08-27: PROMOTIONAL $4.00/1M in, $20.00/1M out. Standard is $5.00/$30.00. Re-check on expiry — output rises 50% and the 1.3 margin does not cover it.',
   date '2026-11-21'),

  -- ---- ElevenLabs, text-to-speech (Raw Footage narration) ----------------
  -- Character-billed, so output_usd_per_unit stays 0. Every letter, digit,
  -- punctuation mark and space counts.
  ('elevenlabs', 'eleven_multilingual_v2', 'character', 0.000100000000, 0,
   'ElevenLabs pricing, read 2026-08-27: $0.10 per 1,000 characters.', null),

  ('elevenlabs', 'eleven_v3', 'character', 0.000100000000, 0,
   'ElevenLabs pricing, read 2026-08-27: $0.10 per 1,000 characters.', null),

  ('elevenlabs', 'eleven_flash_v2_5', 'character', 0.000050000000, 0,
   'ElevenLabs pricing, read 2026-08-27: $0.05 per 1,000 characters.', null);


-- ---------------------------------------------------------------------------
-- credit_settings — the kill switch and the concurrency cap
-- ---------------------------------------------------------------------------
alter table credit_settings
  add column max_concurrent_holds integer not null default 3,
  add column credit_mode_enabled  boolean not null default false;

alter table credit_settings
  add constraint max_concurrent_holds_sane
  check (max_concurrent_holds between 1 and 50);

comment on column credit_settings.max_concurrent_holds is
  'How many calls one member may have in flight at once. Default 3: the desktop '
  'app is strictly sequential (elevenlabs.rs synthesises one line at a time, in '
  'a for loop with an await inside — no join_all, no spawn anywhere in its '
  'source), so it needs 1; the extension needs about 1. Three covers a member '
  'running both at once plus a retry, and bounds a runaway to 3x concurrent '
  'spend. Raise it against real traffic, never against a guess.';

comment on column credit_settings.credit_mode_enabled is
  'THE KILL SWITCH. False stops credit mode dead, without a deploy: a runaway '
  'cost, a provider outage, a bug in the gateway. Read in TWO places — '
  'tool_access_resolve, so the tool closes cleanly rather than appearing open '
  'and failing on every run, and credit_hold_open, as defence in depth. '
  'Defaults FALSE: credit mode turns on when someone decides it does.';


-- ---------------------------------------------------------------------------
-- credit_settings_public — the member's window
--
-- CREATE OR REPLACE VIEW can append columns but not remove or reorder them, so
-- this adds credit_mode_enabled at the end. A member legitimately needs to know
-- whether credit mode exists at all; margin_multiplier and the two caps stay
-- exactly as hidden as they were.
-- ---------------------------------------------------------------------------
create or replace view credit_settings_public as
  select credit_usd_value, expiry_months, credit_mode_enabled
  from credit_settings
  where id = true;

grant select on credit_settings_public to anon, authenticated;


-- ---------------------------------------------------------------------------
-- tool_access_resolve — the kill switch closes the tool
--
-- Body is IDENTICAL to 20260827140000's except for the credit branch. It is
-- restated in full rather than patched because a plpgsql function has no patch
-- form, and reading half a rule in one file and half in another is how the two
-- drift apart.
--
-- WHY THE FLAG BELONGS HERE and not only in credit_hold_open: without it, a
-- lapsed member with credit sees the tool open on their dashboard while every
-- run fails at hold time — and their BYOK key is withheld too, because they ARE
-- in credit mode. Open to look at, dead to use, no key either. Reading the flag
-- here makes the kill switch mean what it says: credit mode does not exist
-- right now, so nothing is entitled through it.
-- ---------------------------------------------------------------------------
create or replace function public.tool_access_resolve(
  p_tool_id uuid,
  uid uuid default auth.uid()
)
returns tool_access_mode
language plpgsql stable security definer set search_path = public as $$
declare
  t          tools%rowtype;
  suspended  boolean;
begin
  if uid is null then return 'none'; end if;

  select * into t from tools where id = p_tool_id;
  if not found then return 'none'; end if;

  if t.status not in ('published', 'maintenance') then
    return case when public.is_admin(uid) then 'byok'::tool_access_mode
                else 'none'::tool_access_mode end;
  end if;

  select is_suspended into suspended from profiles where id = uid;
  if suspended is null then return 'none'; end if;
  if suspended then return 'none'; end if;

  if public.is_admin(uid) then return 'byok'; end if;

  if exists (
    select 1 from user_tool_access a
    where a.user_id = uid and a.tool_id = p_tool_id
      and (a.expires_at is null or a.expires_at > now())
  ) then
    return 'byok';
  end if;

  if t.access_type = 'public_preview' then
    return 'byok';
  end if;

  if public.has_active_membership(uid) then
    if t.access_type = 'members' then
      return 'byok';
    end if;

    if t.access_type = 'plan' then
      return case when exists (
        select 1
          from memberships m
          join plan_tools pt on pt.plan_id = m.plan_id
         where m.user_id = uid and pt.tool_id = p_tool_id
      ) then 'byok'::tool_access_mode else 'none'::tool_access_mode end;
    end if;

    return 'none';
  end if;

  -- ---- Lapsed. Credit opens exactly the tools that spend credit. ----------
  --
  -- No access_type condition, deliberately — see 20260827140000 for why tying
  -- this to 'members' would break silently when per-tool purchases arrive.
  --
  -- The kill switch is checked BEFORE the balance, so a disabled system costs
  -- one cheap read of a one-row table rather than a lookup per user.
  if t.consumes_credit
     and (select credit_mode_enabled from credit_settings where id = true)
     and public.credit_available(uid) > 0
  then
    return 'credit';
  end if;

  return 'none';
end $$;


-- ---------------------------------------------------------------------------
-- credit_hold_open — kill switch + concurrency cap
--
-- Two new refusals: 'credit_mode_disabled' and 'too_many_concurrent'.
--
-- ON LOCK PLACEMENT, because the two checks genuinely differ:
--
--   The CONCURRENCY COUNT IS INSIDE THE BALANCE ROW LOCK. It is per-user state
--   and two calls racing would each read 2 and each open a third. Counting it
--   in the gateway instead of here would have exactly that race, which is the
--   whole reason it lives in this function.
--
--   The KILL SWITCH IS NOT, and does not need to be. It is one global boolean;
--   there is no per-user state to race on, and the outcome is identical either
--   side of the lock. Checking it first also means that when the switch is off
--   — precisely when something is on fire and calls are arriving — a thousand
--   requests fail without any of them taking a row lock. A kill switch whose
--   own path contends for locks is working against itself.
--
-- The count ignores holds past their expires_at. The sweeper only runs each
-- minute, so without that clause a member whose client crashed would be locked
-- out of their own quota until the next tick, by holds that are already dead.
-- This way it heals immediately and the sweeper just does the bookkeeping.
-- ---------------------------------------------------------------------------
create or replace function public.credit_hold_open(
  p_user_id     uuid,
  p_tool_id     uuid,
  p_max_credits integer,
  p_run_id      uuid default null,
  p_ttl_seconds integer default 900
)
returns table (status text, hold_id uuid, available integer)
language plpgsql security definer set search_path = public as $$
declare
  s        credit_settings%rowtype;
  v_bal    integer;
  v_held   integer;
  v_avail  integer;
  v_today  integer;
  v_open   integer;
  v_slug   text;
  v_hold   uuid;
begin
  hold_id := null;
  available := 0;

  if p_user_id is null or p_max_credits is null or p_max_credits <= 0 then
    status := 'invalid';
    return next;
    return;
  end if;

  select * into s from credit_settings where id = true;

  -- The kill switch. First, cheap, and before any lock.
  if not s.credit_mode_enabled then
    status := 'credit_mode_disabled';
    return next;
    return;
  end if;

  if p_max_credits > s.per_call_max_credits then
    status := 'over_call_cap';
    available := public.credit_available(p_user_id);
    return next;
    return;
  end if;

  insert into credit_balances (user_id) values (p_user_id)
    on conflict (user_id) do nothing;

  select balance, held into v_bal, v_held
    from credit_balances where user_id = p_user_id for update;

  v_avail := v_bal - v_held;
  available := v_avail;

  -- Concurrency, inside the lock. Dead holds do not count against a member.
  --
  -- ALIASED, and it has to be: this function's OUT parameter is called `status`,
  -- so an unqualified `status = 'open'` is ambiguous between the plpgsql
  -- variable and the column, and Postgres refuses the whole function at runtime.
  -- The same trap is waiting for anything else added here that touches a column
  -- named status, hold_id or available.
  select count(*) into v_open
    from credit_holds h
   where h.user_id = p_user_id
     and h.status = 'open'
     and h.expires_at > now();

  if v_open >= s.max_concurrent_holds then
    status := 'too_many_concurrent';
    return next;
    return;
  end if;

  -- Today's spend, UTC, plus everything currently reserved. See the note in
  -- 20260827130000 about why the outer `at time zone 'utc'` is load-bearing.
  select coalesce(sum(-credits), 0) into v_today
    from credit_ledger
   where user_id = p_user_id
     and kind = 'debit'
     and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');

  if v_today + v_held + p_max_credits > s.per_user_daily_max_credits then
    status := 'over_daily_cap';
    return next;
    return;
  end if;

  if v_avail < p_max_credits then
    status := 'insufficient';
    return next;
    return;
  end if;

  select slug into v_slug from tools where id = p_tool_id;

  insert into credit_holds (
    user_id, tool_id, tool_slug, run_id, max_credits, expires_at
  ) values (
    p_user_id, p_tool_id, v_slug, p_run_id, p_max_credits,
    now() + make_interval(secs => greatest(30, p_ttl_seconds))
  ) returning id into v_hold;

  update credit_balances
     set held = v_held + p_max_credits
   where user_id = p_user_id;

  status := 'ok';
  hold_id := v_hold;
  available := v_avail - p_max_credits;
  return next;
end $$;

revoke all on function public.credit_hold_open(uuid, uuid, integer, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.credit_hold_open(uuid, uuid, integer, uuid, integer)
  to service_role;


-- ---------------------------------------------------------------------------
-- prices_needing_review — what the admin dashboard reads
--
-- A queryable review_after only helps if something asks the question. Three
-- months from now nobody will remember the Sol promotion, which is the entire
-- reason this exists rather than a note in a migration nobody re-opens.
-- ---------------------------------------------------------------------------
create or replace function public.prices_needing_review()
returns table (provider api_provider, model text, review_after date, source_note text)
language sql stable security definer set search_path = public as $$
  select p.provider, p.model, p.review_after, p.source_note
    from provider_model_prices p
   where p.is_active
     and p.review_after is not null
     and p.review_after <= current_date
   order by p.review_after asc;
$$;

revoke all on function public.prices_needing_review() from public, anon;
grant execute on function public.prices_needing_review() to authenticated, service_role;


-- ============================================================================
-- ROLLBACK
--
--   drop function if exists public.prices_needing_review();
--
--   -- credit_hold_open: restore from 20260827130000 (drop the kill-switch and
--   -- concurrency blocks; everything else is unchanged).
--   -- tool_access_resolve: restore from 20260827140000 (the credit branch
--   -- loses its `credit_mode_enabled` condition).
--
--   create or replace view credit_settings_public as
--     select credit_usd_value, expiry_months from credit_settings where id = true;
--
--   alter table credit_settings
--     drop constraint if exists max_concurrent_holds_sane,
--     drop column if exists credit_mode_enabled,
--     drop column if exists max_concurrent_holds;
--
--   drop table if exists provider_model_prices;
--
-- The view must be replaced BEFORE the columns are dropped — it selects one.
-- ============================================================================
