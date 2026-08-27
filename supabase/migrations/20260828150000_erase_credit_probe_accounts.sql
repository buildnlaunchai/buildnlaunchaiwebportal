-- ============================================================================
-- Remove three throwaway accounts left behind by scripts/verify-credits.mjs.
--
-- WHY THEY COULD NOT BE DELETED THE ORDINARY WAY, which is the interesting part:
-- the probe exercises credit_admin_adjust, so each account acquired credit_ledger
-- rows — and credit_ledger is append-only by trigger. Deleting the auth user
-- cascades toward those rows, the trigger refuses, and the delete fails with
-- P0001. The admin account failed differently and for the same reason: it is the
-- `actor_id` on the rows it wrote, so a foreign key holds it in place.
--
-- Both are the ledger doing its job. An account that has spent or been granted
-- credit is not supposed to be quietly removable, because the ledger is the only
-- record of where money went.
--
-- So this uses the escape hatch the trigger itself documents in its hint:
-- `set local app.erasing_user = 'on'`, in the same transaction. That is the
-- deliberate, single, documented way to erase somebody — the same path a real
-- account deletion request would take.
--
-- Named individually rather than by a `like 'credits-%'` pattern, on purpose. A
-- pattern in a migration that erases accounts is a pattern that will one day
-- match somebody real.
--
-- AND THE ORDER MATTERS, which the first attempt found out the hard way: the
-- ledger rows belonging to a MEMBER carry the ADMIN as their `actor_id`, and
-- that foreign key holds the admin in place. Erasing the admin first fails on
-- 23503 no matter what the escape hatch says, because the rows pointing at it
-- still exist. Members first, then the admins whose names are on their rows.
-- ============================================================================

do $$
declare
  v_emails text[] := array[
    'credits-member-1787865570164@example.com',
    'credits-admin-1787865600059@example.com',
    'credits-member-1787865600059@example.com'
  ];
  v_id uuid;
  v_email text;
  v_gone integer := 0;
begin
  -- Scoped to this transaction only; it cannot leak into anything after it.
  perform set_config('app.erasing_user', 'on', true);

  -- Two passes: everyone who is not an admin, then the admins. See the note above.
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

    -- Refuse to touch anything that looks like a real member. A probe account
    -- has no membership and no application; if either exists, this is not the
    -- account this migration was written for and it stops rather than guesses.
    if exists (select 1 from memberships where user_id = v_id)
       or exists (select 1 from applications where user_id = v_id) then
      raise exception 'refusing to erase % — it has a membership or an application', v_email;
    end if;

    delete from auth.users where id = v_id;
    v_gone := v_gone + 1;
  end loop;

  raise notice 'erased % probe account(s)', v_gone;
end $$;
