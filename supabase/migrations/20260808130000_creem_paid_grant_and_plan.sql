-- ============================================================
-- Creem becomes the sole payment provider.
--
-- Two changes, both additive to the 20260808120000 migration rather than edits
-- to it. A NEW migration deliberately, not a rewrite of the previous file: the
-- migration runner tracks applied versions and will never re-run an edited one,
-- so amending 20260808120000 would silently drop the subscription.paid fix below
-- on any database where it had already been applied. That failure is invisible
-- and its symptom is a paying member locked out, so it is not a risk worth
-- taking for tidiness.
-- ============================================================

-- 1. Point the 'member' plan at Creem -------------------------------------------
-- provider_price_id is where lib/billing.ts reads the checkout target from, and
-- it is deliberately data rather than an env var: "switching the price or moving
-- test→live is a one-row data change with no redeploy". It held the Paddle price
-- while both providers ran in parallel; Creem's product id takes it over now that
-- Paddle is retired.
--
-- Creem calls this a PRODUCT id (prod_…) where Paddle called it a price id. The
-- column keeps its name — it is the provider's checkout identifier either way,
-- and renaming it would be a destructive migration for a cosmetic gain.
update plans
   set provider          = 'creem',
       provider_price_id = 'prod_3gsru7qPVVruCa0FqFfHvi',
       description       = 'Full access to every tool. $10/mo, billed through Creem. You bring your own API keys.'
 where slug = 'member';

-- 2. subscription.paid now grants ------------------------------------------------
-- Resolves the gap flagged when this integration was written. Creem's docs
-- describe subscription.active as "received when a NEW subscription is created …
-- creating a new subscription object" — a creation event. The past_due docs say a
-- successful retry "transitions back to active", but that is a STATUS transition;
-- nothing documents the webhook re-firing.
--
-- If it does not re-fire and 'subscription.paid' is not a grant, a member who
-- goes past_due and then successfully pays is revoked and NEVER restored. That
-- failure is silent and it strands a paying customer.
--
-- Adding it is free in the opposite case: if subscription.active DOES re-fire,
-- the second event carries its own webhookId, dedupes, and changes nothing. An
-- asymmetric bet with no downside, so we take it.
--
-- subscription.paid also lands on every ordinary renewal, where the upsert simply
-- rewrites an already-active membership to the same values.
create or replace function public.process_creem_event(
  p_event_id        text,
  p_event_type      text,
  p_user_id         uuid,
  p_subscription_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
begin
  -- The atomic claim. The PK serialises concurrent duplicates; DO NOTHING +
  -- the FOUND check below turns a lost race into a clean 'deduped'.
  insert into creem_events (event_id, event_type)
  values (p_event_id, p_event_type)
  on conflict (event_id) do nothing;

  if not found then
    return 'deduped';
  end if;

  -- GRANT. 'subscription.paid' is the recovery path — see the note above.
  if p_event_type in (
    'checkout.completed', 'subscription.active', 'subscription.trialing',
    'subscription.paid'
  ) then
    -- Our checkout always sets metadata.referenceId to the profiles.id (the
    -- route derives it from the session, never from the client). Without it we
    -- cannot attach a membership. The claim stands (recorded), so a retry won't
    -- loop forever.
    if p_user_id is null then
      return 'no_user';
    end if;

    select id into v_plan_id from plans where slug = 'member';

    insert into memberships (
      user_id, plan_id, status, source, is_gift, granted_by,
      started_at, expires_at, provider, provider_subscription_id
    ) values (
      p_user_id, v_plan_id, 'active', 'creem', false, null,
      now(), null, 'creem', p_subscription_id
    )
    on conflict (user_id) do update set
      plan_id                  = excluded.plan_id,
      status                   = 'active',
      source                   = 'creem',
      is_gift                  = false,
      granted_by               = null,
      started_at               = now(),
      expires_at               = null,
      provider                 = 'creem',
      provider_subscription_id = excluded.provider_subscription_id,
      updated_at               = now();

  -- REVOKE.
  elsif p_event_type in (
    'subscription.canceled', 'subscription.expired', 'subscription.unpaid',
    'subscription.past_due', 'refund.created', 'dispute.created'
  ) then
    -- Deactivate by SUBSCRIPTION id: a late event for an old sub won't disturb a
    -- membership that has since moved to a new subscription.
    --
    -- The provider guard is retained even though Paddle is being retired: legacy
    -- rows may still carry provider='paddle', and a Creem event has no business
    -- expiring one of them.
    if p_subscription_id is not null then
      update memberships set status = 'expired', updated_at = now()
       where provider_subscription_id = p_subscription_id
         and provider = 'creem';
    elsif p_user_id is not null then
      update memberships set status = 'expired', updated_at = now()
       where user_id = p_user_id
         and provider = 'creem';
    end if;

  else
    -- subscription.update / subscription.scheduled_cancel / subscription.paused /
    -- any other type: claim + record only.
    --
    -- scheduled_cancel in particular MUST NOT revoke: the subscription stays
    -- active until the period ends, and subscription.expired lands then.
    null;
  end if;

  return 'processed';
end $$;

-- SECURITY: this grants paid memberships, so ONLY the service role (the webhook)
-- may execute it. CREATE OR REPLACE preserves existing grants, but restating them
-- keeps this migration correct if run against a database that never had the
-- previous one.
revoke all on function public.process_creem_event(text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.process_creem_event(text, text, uuid, text)
  to service_role;
