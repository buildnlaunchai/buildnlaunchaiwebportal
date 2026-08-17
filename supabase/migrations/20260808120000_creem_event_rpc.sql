-- ============================================================
-- process_creem_event — atomic, idempotent webhook processing (Creem)
--
-- A deliberate CLONE of process_paddle_event, not a refactor of it. Paddle is
-- still live and taking money; generalising both onto one shared RPC means
-- editing the working path to ship the unproven one. Once Creem is verified
-- end-to-end and Paddle is cut over, collapse the two into
-- process_provider_event(p_provider, ...) with a (provider, event_id) ledger —
-- that is a mechanical merge and a much safer one to do with both behaviours
-- already understood.
--
-- Same structure, same guarantees as the Paddle RPC:
--
--   * The creem_events PRIMARY KEY is the concurrency gate. A second concurrent
--     delivery of the same event blocks on the PK until this commits, then sees
--     the row and returns 'deduped' WITHOUT re-processing.
--   * If ANYTHING here raises, the whole function rolls back — INCLUDING the
--     claim — so Creem's retry re-runs cleanly. No event is ever half-processed,
--     double-processed, or orphaned.
--
-- It writes ONLY memberships (+ the creem_events ledger), with the same columns
-- every other grant path uses. can_access_tool / has_active_membership are
-- untouched.
-- ============================================================

-- 1. Webhook idempotency ledger --------------------------------------------------
-- Keyed on Creem's webhook event id (the SDK surfaces it as `webhookId`), the
-- direct analog of Paddle's event_id. Separate table from paddle_events so the
-- two providers cannot collide on an id and cannot deadlock each other.
--
-- Service-role only: RLS on, ZERO policies = deny-all — the same structural
-- boundary as tool_secrets and paddle_events. No client role can read or write it.
create table if not exists creem_events (
  event_id     text primary key,        -- Creem's webhook id, e.g. 'evt_...'
  event_type   text not null,           -- 'subscription.active', etc.
  processed_at timestamptz not null default now()
);

alter table creem_events enable row level security;
-- (deliberately no policies — deny-all to anon/authenticated)

-- 2. The processor ---------------------------------------------------------------
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

  -- GRANT. Exactly the three types the integration brief specifies.
  --
  -- NOTE: 'subscription.paid' is deliberately NOT here. It lands on every
  -- successful renewal, and Creem's own SDK treats it as a grant reason. With
  -- past_due revoking below, a member whose retry later succeeds is recovered
  -- only if Creem also re-sends subscription.active. If that turns out not to
  -- happen, add 'subscription.paid' to this list — it is one word, and the
  -- upsert is already idempotent.
  if p_event_type in (
    'checkout.completed', 'subscription.active', 'subscription.trialing'
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

  -- REVOKE. The six types the brief maps to revocation.
  elsif p_event_type in (
    'subscription.canceled', 'subscription.expired', 'subscription.unpaid',
    'subscription.past_due', 'refund.created', 'dispute.created'
  ) then
    -- Deactivate by SUBSCRIPTION id: a late event for an old sub won't disturb a
    -- membership that has since moved to a new subscription.
    --
    -- The `provider = 'creem'` guard is NEW versus the Paddle RPC and is the
    -- reason this is a clone rather than a copy. With two providers live at once,
    -- the user_id fallback below would otherwise let a Creem cancellation expire
    -- a membership that Paddle is still successfully billing — the exact
    -- cross-provider bug the parallel-running period invites.
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
    -- subscription.update / subscription.paid / subscription.scheduled_cancel /
    -- subscription.paused / any other type: claim + record only.
    --
    -- scheduled_cancel in particular MUST NOT revoke: the subscription stays
    -- active until the period ends, and subscription.expired lands then.
    null;
  end if;

  return 'processed';
end $$;

-- SECURITY: this grants paid memberships, so ONLY the service role (the webhook)
-- may execute it. Without this revoke, any signed-in user could call the RPC and
-- grant themselves a membership. The webhook connects as service_role.
revoke all on function public.process_creem_event(text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.process_creem_event(text, text, uuid, text)
  to service_role;
