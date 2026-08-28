-- ============================================================================
-- A throwaway account with credit history cannot be deleted, and that has now
-- cost three hand-written cleanup migrations.
--
-- credit_ledger is append-only, so deleting a user cascades into the trigger and
-- is refused. Erasing one needs `set local app.erasing_user = 'on'` in the SAME
-- transaction, which PostgREST cannot express across two statements — so every
-- probe that grants credit strands an account in production, and each time the
-- fix has been a migration naming the specific uuids.
--
-- The consequence was worse than the litter: verify-credits was rewritten to
-- stop granting credit at all so it could clean up after itself, and
-- verify-credit-pages could not test the one ordering that actually broke in
-- production — the webhook winning the race, so the credit is already there when
-- the page renders. A test that cannot set up the failing case is not covering
-- it.
--
-- ─── WHAT MAKES THIS SAFE, AND IT IS NOT THE GRANT ──────────────────────────
--
-- Service-role-only would not be enough on its own: the webhook, the runner and
-- every verify script hold that role. The guard is the ACCOUNT, and it is
-- deliberately narrow. This refuses to touch anything that shows a sign of being
-- a real person:
--
--   * has a membership row, ever, of any status
--   * has an application, ever
--   * holds any API key
--   * has ever run a tool
--   * has any credit_ledger row whose source is not 'verify' or 'test'
--
-- The last one is the load-bearing clause. An account whose entire credit
-- history is synthetic is by definition not one that ever paid, and a real
-- purchase writes source='creem'. So the first real top-up — and every one
-- after — is outside what this function can reach, permanently, by construction
-- rather than by remembering.
--
-- It is not a general delete. It cannot be pointed at a member, and if it is,
-- it says so and does nothing.
-- ============================================================================

create or replace function public.erase_synthetic_credit_account(p_user_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_sources text[];
begin
  if p_user_id is null then
    return 'invalid';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    return 'no_such_user';
  end if;

  -- Every sign of a real person, checked before anything is removed.
  if exists (select 1 from memberships   where user_id = p_user_id)
  or exists (select 1 from applications  where user_id = p_user_id)
  or exists (select 1 from user_api_keys where user_id = p_user_id)
  or exists (select 1 from tool_runs     where user_id = p_user_id)
  then
    return 'not_synthetic';
  end if;

  -- And the clause that keeps every paid purchase out of reach: a real top-up
  -- has source='creem'.
  select array_agg(distinct source) into v_sources
    from credit_ledger where user_id = p_user_id;

  if v_sources is not null and exists (
    select 1 from unnest(v_sources) as s where s is null or s not in ('verify', 'test')
  ) then
    return 'not_synthetic';
  end if;

  -- Scoped to this transaction, and written out rather than hidden behind a
  -- helper, so the line says what it is doing. See 20260827120000.
  perform set_config('app.erasing_user', 'on', true);
  delete from auth.users where id = p_user_id;
  return 'ok';
end $$;

comment on function public.erase_synthetic_credit_account(uuid) is
  'Delete a throwaway test account whose credit history is entirely synthetic '
  '(every ledger source in verify/test) and which has no membership, '
  'application, API key or run. Refuses anything else with ''not_synthetic''. '
  'Exists because credit_ledger is append-only and PostgREST cannot set '
  'app.erasing_user across statements. See 20260828210000.';

revoke all on function public.erase_synthetic_credit_account(uuid) from public, anon, authenticated;
grant execute on function public.erase_synthetic_credit_account(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Proof, in a subtransaction that is rolled back. The important assertion is
-- the REFUSAL: a real account must be untouchable.
-- ---------------------------------------------------------------------------
do $$
declare
  v_member uuid;
  v_paid   uuid;
  r        text;
begin
  begin
    select user_id into v_member from memberships limit 1;
    if v_member is not null then
      r := public.erase_synthetic_credit_account(v_member);
      assert r = 'not_synthetic', 'a member must be refused, got ' || r;
    end if;

    -- Anyone holding a real, paid-for top-up.
    select user_id into v_paid from credit_ledger where source = 'creem' limit 1;
    if v_paid is not null then
      r := public.erase_synthetic_credit_account(v_paid);
      assert r = 'not_synthetic', 'a paid account must be refused, got ' || r;
    end if;

    r := public.erase_synthetic_credit_account(gen_random_uuid());
    assert r = 'no_such_user', 'expected no_such_user, got ' || r;

    r := public.erase_synthetic_credit_account(null);
    assert r = 'invalid', 'expected invalid, got ' || r;

    raise exception 'rollback the assertions';
  exception when others then
    if sqlerrm <> 'rollback the assertions' then raise; end if;
  end;
end $$;
