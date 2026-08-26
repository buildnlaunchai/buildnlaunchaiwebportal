-- ============================================================================
-- CREDIT SYSTEM — core schema (1 of 3)
--
--   1. 20260827120000_credit_core.sql        <- you are here: enums + tables
--   2. 20260827130000_credit_rpcs.sql           every balance mutation
--   3. 20260827140000_tool_credit_access.sql    tools.consumes_credit + engine
--
-- Prepaid credit alongside BYOK. A member buys credit; a tool that calls an AI
-- provider can spend it instead of the member's own key. The economics:
--
--     charge = provider cost x margin multiplier,  1 credit = $0.01
--
-- Both numbers are admin-editable, and BOTH ARE FROZEN ONTO EVERY LEDGER ROW at
-- the moment of the movement. Changing the margin next month must not silently
-- rewrite what a member was charged last month — a ledger you can restate is not
-- a ledger.
--
-- ⚠️  READ THE SEQUENCING WARNING IN MIGRATION 3 BEFORE THE FIRST TOP-UP SHIPS.
--     It is the difference between this feature working and it giving away
--     BYOK keys to lapsed members. It is written there, next to the code that
--     causes it, rather than here.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ----------------------------------------------------------------------------
-- No seed credit for anyone. No Creem product. No gateway route. No UI. This
-- file and its two siblings are schema only, and nothing in the product can
-- reach them yet — which is exactly why they are safe to apply first.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Enums
--
-- tool_access_mode is NOT here — it lives in migration 3, with the access
-- engine that is its only consumer, so that migration can be rolled back on its
-- own without stranding a type.
-- ---------------------------------------------------------------------------
create type credit_entry_kind as enum (
  'topup',             -- bought credit. Creates a lot. Always positive.
  'debit',             -- spent on a provider call. Always negative.
  'refund',            -- a debit given back (the call failed after settling).
  'expiry',            -- a lot aged out unspent. Always negative.
  'admin_adjustment'   -- manual correction, either sign. The escape hatch.
);

create type credit_hold_status as enum (
  'open',       -- reserved, call in flight
  'settled',    -- the call finished and the real cost was debited
  'released',   -- the call failed; the reservation was handed back
  'expired'     -- nothing ever settled it and the sweeper reclaimed it
);


-- ---------------------------------------------------------------------------
-- credit_settings — one row, admin-editable
--
-- ADMIN-ONLY, and margin_multiplier is why. RLS grants ROWS, not columns
-- (CLAUDE.md §7), so a member-facing select policy on this table would hand
-- every member the exact markup on their own runs. There is no version of that
-- conversation that goes well, and no reason for the client to know the number.
--
-- What a member legitimately needs — what a credit is worth, and how long it
-- lasts — comes from credit_settings_public below.
-- ---------------------------------------------------------------------------
create table credit_settings (
  id                         boolean primary key default true check (id),

  -- What one credit is worth. 1 credit = $0.01.
  credit_usd_value           numeric(12,6) not null default 0.01,

  -- Charge = provider cost x this. 1.3 = a 30% margin.
  margin_multiplier          numeric(6,3)  not null default 1.3,

  -- Credit bought today expires this many months from today.
  expiry_months              integer       not null default 12,

  -- Abuse guards, both deliberately LOW to start. 500 credits = $5 on one call;
  -- 3000 = $30 in a day. Starting small and raising them against real usage is
  -- the safe direction; starting large and discovering the number in an invoice
  -- is not. Both are admin-editable precisely so they can be raised in a click.
  per_call_max_credits       integer       not null default 500,
  per_user_daily_max_credits integer       not null default 3000,

  updated_at                 timestamptz not null default now(),
  updated_by                 uuid references profiles(id),

  constraint credit_usd_value_positive
    check (credit_usd_value > 0),
  -- Below 1 would mean selling provider capacity at a loss; above 10 is almost
  -- certainly a typo (13 for 1.3) and would bill a member 10x. Both ends are
  -- guarded because a settings typo here spends real money.
  constraint margin_multiplier_sane
    check (margin_multiplier >= 1 and margin_multiplier <= 10),
  constraint expiry_months_sane
    check (expiry_months between 1 and 120),
  constraint per_call_max_positive
    check (per_call_max_credits > 0),
  constraint per_user_daily_max_positive
    check (per_user_daily_max_credits > 0),
  -- A per-call ceiling above the daily ceiling is incoherent: one call could
  -- never be allowed to complete. Catch it at write time, not at run time.
  constraint per_call_within_daily
    check (per_call_max_credits <= per_user_daily_max_credits)
);

insert into credit_settings (id) values (true);

create trigger credit_settings_touch_updated_at
  before update on credit_settings
  for each row execute function public.touch_updated_at();

alter table credit_settings enable row level security;

create policy credit_settings_all_admin
  on credit_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- The public read path, mirroring app_settings_public exactly: a DEFAULT
-- (security-definer) view, NOT security_invoker. It runs as its owner, so it
-- bypasses the admin-only policy above and exposes only these two columns to
-- everyone. A security_invoker view here would return zero rows to every
-- member, because they have no select policy on the base table — the mistake is
-- easy to make and silent, which is why the reasoning is written down.
create view credit_settings_public as
  select credit_usd_value, expiry_months
  from credit_settings
  where id = true;

grant select on credit_settings_public to anon, authenticated;


-- ---------------------------------------------------------------------------
-- credit_ledger — append-only. THE source of truth for money.
--
-- Every movement of credit is a row, and rows never change. That is not
-- fastidiousness: a refund or a card dispute has to answer "which purchase did
-- this spend come out of, and at what rate" months later, and a table you can
-- UPDATE cannot answer it — it can only assert it.
--
-- ONE ROW PER LOT CONSUMED. A debit that spans two purchases writes two rows,
-- sharing a hold_id and a run_id, each naming its own lot_id. That is what makes
-- the question above answerable by a query instead of a reconstruction.
--
-- Invariant, checkable at any time:
--     credit_balances.balance = sum(credit_ledger.credits) per user
-- ---------------------------------------------------------------------------
create table credit_ledger (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  kind          credit_entry_kind not null,

  -- SIGNED. +topup, -debit, +refund, -expiry, admin_adjustment either way.
  -- Never zero: a movement of nothing is not a movement, and allowing it would
  -- let a bug write rows that look like activity and change nothing.
  credits       integer not null check (credits <> 0),

  -- The running balance immediately after this row. Redundant with the sum
  -- above, and kept anyway: it makes the invariant checkable per row instead of
  -- per user, so a drift is caught at the row that caused it.
  balance_after integer not null check (balance_after >= 0),

  -- ---- FROZEN AT THE MOMENT OF THE MOVEMENT ----------------------------
  -- Never read live from credit_settings when reasoning about a past row.
  credit_usd_value_at   numeric(12,6) not null check (credit_usd_value_at > 0),
  margin_multiplier_at  numeric(6,3)  not null check (margin_multiplier_at > 0),

  -- ---- what was actually spent (debit rows) ----------------------------
  provider          api_provider,
  model             text,
  provider_cost_usd numeric(14,6) check (provider_cost_usd >= 0),

  -- ---- what it was spent on --------------------------------------------
  tool_id   uuid references tools(id) on delete set null,
  -- Denormalised on purpose. tool_id goes null if a tool is ever deleted, and a
  -- receipt that has forgotten what it was for is not a receipt.
  tool_slug text,
  run_id    uuid references tool_runs(id) on delete set null,
  hold_id   uuid,   -- FK added in migration 2, after credit_holds exists
  -- Which lot this row consumed. Set on debit/expiry/refund; null on topup,
  -- where the link runs the other way (credit_lots.ledger_id).
  lot_id    uuid,

  -- ---- provenance --------------------------------------------------------
  source    text,   -- 'creem' | 'admin' | 'system'
  reference text,   -- the provider's own id, e.g. a Creem checkout id
  note      text,
  actor_id  uuid references profiles(id),

  created_at timestamptz not null default now()
);

create index credit_ledger_user_idx on credit_ledger (user_id, created_at desc);
create index credit_ledger_run_idx  on credit_ledger (run_id) where run_id is not null;
create index credit_ledger_hold_idx on credit_ledger (hold_id) where hold_id is not null;

-- Idempotency for anything driven by a webhook. A Creem retry delivering the
-- same checkout twice must credit the member once. Partial, because only
-- externally-referenced rows have a reference to be unique on.
create unique index credit_ledger_reference_uniq
  on credit_ledger (kind, reference) where reference is not null;

-- A debit must say what it cost us; a topup has no provider cost to record.
-- Stated as a constraint rather than a convention because the alternative is
-- discovering a year of debits with no cost basis during a dispute.
alter table credit_ledger add constraint credit_ledger_debit_has_cost
  check (kind <> 'debit' or provider_cost_usd is not null);

-- Sign discipline, per kind. A 'topup' of -50 or an 'expiry' of +50 is a bug
-- that would otherwise balance perfectly and be invisible.
alter table credit_ledger add constraint credit_ledger_sign_by_kind
  check (
    (kind = 'topup'  and credits > 0) or
    (kind = 'refund' and credits > 0) or
    (kind = 'debit'  and credits < 0) or
    (kind = 'expiry' and credits < 0) or
    (kind = 'admin_adjustment')
  );

-- ---- append-only enforcement ----------------------------------------------
--
-- UPDATE and DELETE are both blocked, for everyone, superuser and service role
-- included. A correction is a new row (refund, or admin_adjustment), never an
-- edit — that is the whole point of the table, and a rule with an exception for
-- whoever is holding the service key is not a rule.
--
-- THE ONE DOOR: deleting an ACCOUNT. user_id cascades from profiles, so erasing
-- a member would otherwise be impossible — the cascade's DELETE hits this
-- trigger and the whole transaction dies, which turns "delete this user" in the
-- Supabase dashboard into an error nobody can explain.
--
-- So erasure announces itself:
--
--     set local app.erasing_user = 'on';
--     delete from auth.users where id = '...';
--
-- Deliberate, auditable, and scoped to one transaction by `set local`. What it
-- is NOT is a way to quietly remove a single inconvenient row: anyone reaching
-- for it has to write the line, and the line says what they are doing.
create or replace function public.credit_ledger_append_only()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.erasing_user', true), '') = 'on'
  then
    return old;
  end if;

  raise exception
    'credit_ledger is append-only: % on row % refused. Write a correcting row instead.',
    tg_op, old.id
    using hint =
      'To erase an account, set local app.erasing_user = ''on'' in the same transaction.';
end $$;

create trigger credit_ledger_no_update
  before update or delete on credit_ledger
  for each row execute function public.credit_ledger_append_only();

alter table credit_ledger enable row level security;

-- Select-own ONLY. There is deliberately no admin policy on this table.
--
-- CLAUDE.md §7 records what happened the last time one was added "for a screen
-- that might want it": permissive policies combine with OR, so a member-facing
-- query that leaned on RLS to scope itself listed every member's rows to the
-- admin. Admin reads here go through a Server Action on the service-role client
-- with an explicit .eq("user_id", ...), which is a scoping strategy. A second
-- permissive policy is not.
create policy credit_ledger_select_own
  on credit_ledger for select
  to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on credit_ledger from anon, authenticated;


-- ---------------------------------------------------------------------------
-- credit_balances — the readable balance
--
-- Derived from the ledger, stored separately because summing a growing ledger
-- on every page load is not a plan. Kept in step with it inside the same
-- transaction as every insert, by the RPCs in migration 2.
--
--     available = balance - held
--
-- `held` is reserved-but-not-yet-spent (see credit_holds). A hold does NOT move
-- `balance` and does NOT write a ledger row, which is what keeps the invariant
-- "balance = sum(ledger)" true at every instant, including mid-call.
-- ---------------------------------------------------------------------------
create table credit_balances (
  user_id    uuid primary key references profiles(id) on delete cascade,
  balance    integer not null default 0 check (balance >= 0),
  held       integer not null default 0 check (held >= 0),
  updated_at timestamptz not null default now(),

  -- The last line of defence against a negative available balance. Every RPC
  -- locks this row before mutating it, so this should never fire — and it is
  -- here for the day one of them doesn't.
  constraint credit_balances_held_within_balance check (held <= balance)
);

create trigger credit_balances_touch_updated_at
  before update on credit_balances
  for each row execute function public.touch_updated_at();

alter table credit_balances enable row level security;

create policy credit_balances_select_own
  on credit_balances for select
  to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on credit_balances from anon, authenticated;


-- ---------------------------------------------------------------------------
-- credit_lots — one per purchase, so expiry can be honest
--
-- Credit expires 12 months after it was BOUGHT, which means the system has to
-- know which purchase a spend came out of. A single running balance cannot
-- answer that, so each topup opens a lot and every debit consumes lots
-- oldest-first (FIFO by expires_at).
--
-- Invariant:  credit_balances.balance = sum(credit_lots.credits_remaining)
-- ---------------------------------------------------------------------------
create table credit_lots (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  -- The topup row that opened this lot. Cascades with it.
  ledger_id         uuid not null references credit_ledger(id) on delete cascade,

  credits_total     integer not null check (credits_total > 0),
  credits_remaining integer not null check (credits_remaining >= 0),

  expires_at        timestamptz not null,
  created_at        timestamptz not null default now(),

  constraint credit_lots_remaining_within_total
    check (credits_remaining <= credits_total)
);

-- The FIFO consumption path and the expiry sweep both read exactly this.
-- Partial: a spent lot is never a candidate for either, so it is not indexed.
create index credit_lots_fifo_idx
  on credit_lots (user_id, expires_at)
  where credits_remaining > 0;

create index credit_lots_expiry_idx
  on credit_lots (expires_at)
  where credits_remaining > 0;

alter table credit_lots enable row level security;

create policy credit_lots_select_own
  on credit_lots for select
  to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on credit_lots from anon, authenticated;

-- Now that credit_lots exists, close the ledger's reference to it.
alter table credit_ledger
  add constraint credit_ledger_lot_fk
  foreign key (lot_id) references credit_lots(id) on delete set null;


-- ---------------------------------------------------------------------------
-- credit_holds — reserve before the call, settle after it
--
-- A provider call's real cost is only known once it returns, so the runner
-- reserves an estimated maximum first and settles the true amount afterwards.
-- Without this, two calls started at once could each see the same balance and
-- both spend it.
--
-- Every hold carries expires_at, and a sweeper reclaims anything still open
-- past it (migration 2). That is not tidiness: a hold that is never settled or
-- released holds a member's credit hostage forever, and the failure mode is a
-- member who paid and cannot spend.
-- ---------------------------------------------------------------------------
create table credit_holds (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,

  tool_id     uuid references tools(id) on delete set null,
  tool_slug   text,
  run_id      uuid references tool_runs(id) on delete set null,

  -- The most this call is allowed to cost. Charged amount is min(actual, this).
  max_credits integer not null check (max_credits > 0),

  status      credit_hold_status not null default 'open',
  expires_at  timestamptz not null,

  -- Why it resolved the way it did — the release reason, usually. Its own
  -- column rather than borrowed space in tool_slug: a field that means two
  -- things depending on status is a field that gets read wrong.
  note        text,

  -- The first debit row this hold produced, when it settled. First, because a
  -- settle spanning two lots writes two rows; they share this hold's id, so the
  -- full set is one query away.
  settled_ledger_id uuid references credit_ledger(id) on delete set null,

  created_at  timestamptz not null default now(),
  resolved_at timestamptz,

  -- An open hold has not resolved; a resolved one has. Keeps a settle that
  -- forgot to stamp the time from looking like a live reservation.
  constraint credit_holds_resolved_consistent
    check ((status = 'open') = (resolved_at is null))
);

-- The sweeper's only query.
create index credit_holds_sweeper_idx
  on credit_holds (expires_at) where status = 'open';

create index credit_holds_user_idx on credit_holds (user_id, created_at desc);
create index credit_holds_run_idx  on credit_holds (run_id) where run_id is not null;

alter table credit_holds enable row level security;

create policy credit_holds_select_own
  on credit_holds for select
  to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on credit_holds from anon, authenticated;

-- And close the ledger's reference to a hold.
alter table credit_ledger
  add constraint credit_ledger_hold_fk
  foreign key (hold_id) references credit_holds(id) on delete set null;


-- ============================================================================
-- ROLLBACK  (paste into the SQL editor to undo this migration)
--
-- Safe to run only while no credit exists — which is true until the gateway
-- route in a later step actually sells any. After that, this DROPS REAL MONEY
-- RECORDS. Take a dump of credit_ledger first, always.
--
--   drop view if exists credit_settings_public;
--   alter table credit_ledger drop constraint if exists credit_ledger_hold_fk;
--   alter table credit_ledger drop constraint if exists credit_ledger_lot_fk;
--   drop table if exists credit_holds;
--   drop table if exists credit_lots;
--   drop table if exists credit_ledger;
--   drop table if exists credit_balances;
--   drop table if exists credit_settings;
--   drop function if exists public.credit_ledger_append_only();
--   drop type if exists credit_hold_status;
--   drop type if exists credit_entry_kind;
-- ============================================================================
