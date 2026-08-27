-- ============================================================================
-- Make an orphaned background call LOUD.
--
-- The gateway's Responses route opens a hold, sends the work to OpenAI in
-- background mode, and settles when the client polls the result. If that poll
-- never comes — the laptop closed, the app crashed, a bug in the retry loop —
-- the hold expires, the member's reservation is handed back, and OPENAI STILL
-- BILLS US FOR THE WORK.
--
-- That is an accepted loss, and it is bounded: per_call_max_credits caps a
-- single call at $5. What is NOT acceptable is not knowing. A bug that orphans
-- every call would be invisible until the provider's invoice arrived weeks
-- later, and by then the question "since when?" has no answer.
--
-- So two things. The sweeper says something at the moment it happens, naming
-- the upstream id so it can be reconciled against OpenAI. And the count over
-- the last seven days is surfaced on /admin, because a log line nobody reads is
-- not a signal — it is an archive.
--
-- Only the sweeper changes here. Everything else in credit_holds_sweep is
-- restated verbatim from 20260827130000, because a plpgsql function has no
-- patch form.
-- ============================================================================

create or replace function public.credit_holds_sweep()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  h      record;
  v_n    integer := 0;
  v_held integer;
begin
  for h in
    select id, user_id, max_credits, note, tool_slug
      from credit_holds
     where status = 'open'
       and expires_at < now()
     -- Stable order across concurrent sweeps, so two of them cannot take the
     -- same two balance rows in opposite orders.
     order by user_id, id
  loop
    select held into v_held
      from credit_balances where user_id = h.user_id for update;

    update credit_balances
       set held = greatest(0, v_held - h.max_credits)
     where user_id = h.user_id;

    update credit_holds
       set status = 'expired', resolved_at = now()
     where id = h.id and status = 'open';

    -- A hold carrying an upstream reference is a call somebody else has
    -- already done work for. That is the expensive kind of expiry, and it gets
    -- said out loud with the id needed to go and check.
    if h.note is not null and h.note like 'openai:%' then
      raise warning
        'ORPHANED BACKGROUND CALL: hold % (% credits, tool %) expired unsettled, upstream %. OpenAI has billed us; the member has not been charged.',
        h.id, h.max_credits, coalesce(h.tool_slug, '?'), h.note;
    end if;

    v_n := v_n + 1;
  end loop;

  return v_n;
end $$;

revoke all on function public.credit_holds_sweep() from public, anon, authenticated;
grant execute on function public.credit_holds_sweep() to service_role;


-- ============================================================================
-- ROLLBACK
--
--   Restore credit_holds_sweep from 20260827130000 — identical except that it
--   has no `raise warning` block. No other object changes here.
-- ============================================================================
