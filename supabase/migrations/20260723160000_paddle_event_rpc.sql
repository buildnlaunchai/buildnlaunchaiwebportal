-- ============================================================
-- process_paddle_event — atomic, idempotent webhook processing (Phase 4b)
--
-- Closes the race in the TS handler: SELECT-then-process-then-INSERT let N
-- concurrent duplicates of one event ALL process (harmless only because the
-- membership write is idempotent). This makes the paddle_events PRIMARY KEY the
-- real concurrency gate, and does the claim + the membership effect in ONE
-- transaction (this function):
--
--   * A second concurrent delivery of the same event blocks on the PK until this
--     commits, then sees the row and returns 'deduped' WITHOUT re-processing.
--   * If ANYTHING here raises, the whole function rolls back — INCLUDING the
--     claim — so Paddle's retry re-runs cleanly. No event is ever half-processed,
--     double-processed, or orphaned (the failure mode a naive claim-first insert
--     would have).
--
-- It writes ONLY memberships (+ the paddle_events ledger), with the same columns
-- every other grant path uses. can_access_tool / has_active_membership are
-- untouched. The enum has no 'canceled'/'past_due', so both deactivations map to
-- 'expired' (which the engine already denies).
-- ============================================================
create or replace function public.process_paddle_event(
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
  insert into paddle_events (event_id, event_type)
  values (p_event_id, p_event_type)
  on conflict (event_id) do nothing;

  if not found then
    return 'deduped';
  end if;

  if p_event_type in ('subscription.created', 'subscription.activated') then
    -- Our checkout always sets custom_data.user_id; without it we cannot attach
    -- a membership. The claim stands (recorded), so a retry won't loop forever.
    if p_user_id is null then
      return 'no_user';
    end if;

    select id into v_plan_id from plans where slug = 'member';

    insert into memberships (
      user_id, plan_id, status, source, is_gift, granted_by,
      started_at, expires_at, provider, provider_subscription_id
    ) values (
      p_user_id, v_plan_id, 'active', 'paddle', false, null,
      now(), null, 'paddle', p_subscription_id
    )
    on conflict (user_id) do update set
      plan_id                  = excluded.plan_id,
      status                   = 'active',
      source                   = 'paddle',
      is_gift                  = false,
      granted_by               = null,
      started_at               = now(),
      expires_at               = null,
      provider                 = 'paddle',
      provider_subscription_id = excluded.provider_subscription_id,
      updated_at               = now();

  elsif p_event_type in ('subscription.canceled', 'subscription.past_due') then
    -- Deactivate by SUBSCRIPTION id: a late event for an old sub won't disturb a
    -- membership that has since moved to a new subscription.
    if p_subscription_id is not null then
      update memberships set status = 'expired', updated_at = now()
       where provider_subscription_id = p_subscription_id;
    elsif p_user_id is not null then
      update memberships set status = 'expired', updated_at = now()
       where user_id = p_user_id;
    end if;

  else
    -- transaction.completed / any other type: claim + record only.
    null;
  end if;

  return 'processed';
end $$;

-- SECURITY: this grants paid memberships, so ONLY the service role (the webhook)
-- may execute it. Without this revoke, any signed-in user could call the RPC and
-- grant themselves a membership. The webhook connects as service_role.
revoke all on function public.process_paddle_event(text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.process_paddle_event(text, text, uuid, text)
  to service_role;
