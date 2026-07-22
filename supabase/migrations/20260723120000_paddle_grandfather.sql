-- ============================================================
-- Paddle subscription billing — schema prep (Phase 2)
--
-- Groundwork for replacing the free apply→approve flow with a paid $10/mo Paddle
-- subscription. Three ADDITIVE changes, nothing destructive:
--   1. Grandfather every current active member (non-destructive marker).
--   2. Seed the paid 'member' plan the webhook attaches on a successful sub.
--   3. A paddle_events idempotency table so a retried webhook never double-processes.
--
-- memberships.provider / provider_subscription_id already exist (payment-ready
-- from day one), so a paid sub needs no new column there. can_access_tool /
-- user_tool_access are untouched: Paddle only ever writes `memberships`, the same
-- surface the access engine already reads.
-- ============================================================

-- 1. Grandfather current members ------------------------------------------------
-- A non-destructive marker: `source` stays truthful (referral / application /
-- gift) and we stamp WHEN someone became a pre-paid legacy member. The
-- "convert to paid later" cohort is simply an active membership with no Paddle
-- subscription (provider is distinct from 'paddle'); this column is for human
-- clarity, not for gating. Idempotent: the null guard means a re-run is a no-op.
alter table memberships
  add column if not exists grandfathered_at timestamptz;

update memberships
   set grandfathered_at = now()
 where status in ('active', 'trialing')
   and grandfathered_at is null;

comment on column memberships.grandfathered_at is
  'When this member was grandfathered as a legacy free member (before paid Paddle billing). NULL for anyone created after the switch, including paid subscribers.';

-- 2. The paid plan --------------------------------------------------------------
-- $10/mo, billed through Paddle. NOT is_default: comps and trials keep the free
-- `founding` default, and the webhook attaches THIS plan explicitly by slug.
-- provider_price_id is filled in Phase 3, once the sandbox price exists.
insert into plans
  (slug, name, description, price_monthly, currency, provider, is_default, is_active, sort_order)
values
  ('member', 'Member',
   'Full access to every tool. $10/mo, billed through Paddle. You bring your own API keys.',
   1000, 'USD', 'paddle', false, true, 1)
on conflict (slug) do nothing;

-- 3. Webhook idempotency --------------------------------------------------------
-- Paddle retries deliveries, so the webhook must never process the same event
-- twice. The handler inserts the event id FIRST; a unique-violation means
-- "already seen, skip". Service-role only: RLS on, ZERO policies = deny-all — the
-- same structural boundary as tool_secrets. No client role can read or write it.
create table if not exists paddle_events (
  event_id     text primary key,        -- Paddle's event id, e.g. 'evt_01h...'
  event_type   text not null,           -- 'subscription.activated', etc.
  processed_at timestamptz not null default now()
);

alter table paddle_events enable row level security;
-- (deliberately no policies — deny-all to anon/authenticated)
