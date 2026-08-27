-- ============================================================================
-- The last two accounts scripts/verify-credits.mjs stranded, and the last time
-- a migration like this should be needed.
--
-- Same cause as 20260828150000: the probe granted real credit, the ledger is
-- append-only, and the cascade behind a user delete is therefore refused. Same
-- escape hatch, same members-before-admins ordering, same refusal to touch
-- anything carrying a membership or an application.
--
-- WHAT CHANGED SO THERE IS NOT A THIRD ONE. The probe no longer moves any
-- credit. It calls credit_admin_adjust with `p_credits: 0`, which is rejected as
-- `invalid` — but only AFTER the admin check, so the two answers still say
-- exactly what the test needs (`not_admin` for a member, `invalid` for an admin)
-- while writing no ledger row at all. Its throwaway accounts now delete cleanly
-- in its own `finally`, and it reports loudly if they ever stop doing so.
-- ============================================================================

do $$
declare
  v_emails text[] := array[
    'credits-member-1787865879750@example.com',
    'credits-admin-1787865879750@example.com'
  ];
  v_id uuid;
  v_email text;
  v_gone integer := 0;
begin
  perform set_config('app.erasing_user', 'on', true);

  for v_email in
    select e from unnest(v_emails) as e
     order by (select p.role = 'admin' from profiles p
                join auth.users u on u.id = p.id where u.email = e) nulls first
  loop
    select id into v_id from auth.users where email = v_email;
    if v_id is null then
      raise notice 'already gone: %', v_email;
      continue;
    end if;

    if exists (select 1 from memberships where user_id = v_id)
       or exists (select 1 from applications where user_id = v_id) then
      raise exception 'refusing to erase % — it has a membership or an application', v_email;
    end if;

    delete from auth.users where id = v_id;
    v_gone := v_gone + 1;
  end loop;

  raise notice 'erased % probe account(s)', v_gone;
end $$;
