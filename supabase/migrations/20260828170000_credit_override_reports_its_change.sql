-- ============================================================================
-- credit_set_mode_override now reports what it replaced, so the audit row can
-- stop guessing — and so a press that changes nothing writes nothing.
--
-- ─── WHY, and it is not the bug it looked like ──────────────────────────────
--
-- Four `credit.mode_override` rows turned up after what was remembered as one
-- press, which reads like double-logging. It was not: the four rows chain
-- null -> true -> false -> null -> true, each row's `from` equal to the previous
-- row's `to`, 34s / 4s / 8s apart. Duplicate logging repeats one pair; it cannot
-- produce a chain. Those were four real changes, and the audit was telling the
-- truth. What made them look identical was the SCREEN, which rendered the action
-- name and dropped the metadata — fixed separately.
--
-- But looking at it that closely turned up two ways this function COULD put a
-- row in the audit log for something that did not happen, and both are worth
-- closing while the reason is fresh:
--
--   1. A NO-OP IS STILL LOGGED. Setting `true` on a member who is already `true`
--      wrote "from true to true" — an event with no change in it. The buttons
--      disable the current state so it is hard to do from the credits screen,
--      but /admin/users/[id] carries the same control, and "hard to reach from
--      one screen" is not a property the audit log should depend on.
--
--   2. `from` WAS A SEPARATE READ. The action did SELECT, then UPDATE, in two
--      round trips. Between them the value can change, and the log would then
--      record a `from` that was never what this write replaced. Nobody has hit
--      it — there is one admin — but a log whose accuracy depends on there being
--      one admin is a log with an expiry date on it.
--
-- Both are fixed the same way: the function does the read and the write in one
-- transaction, taking the row lock, and RETURNS what it replaced. The caller
-- logs what the database says it did instead of what it separately observed, and
-- skips the row entirely when nothing moved.
--
-- The return type changes from text to jsonb, so this is a drop and recreate —
-- `create or replace` cannot change a return type. Everything else about the
-- function, including the guard and the reasoning behind the grant, is unchanged
-- from 20260828140000; read that header first.
-- ============================================================================

drop function if exists public.credit_set_mode_override(uuid, boolean);

create function public.credit_set_mode_override(
  p_user_id uuid,
  p_value boolean
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_before boolean;
begin
  -- Same guard, same reasoning, same order as credit_admin_adjust.
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    return jsonb_build_object('status', 'not_admin');
  end if;

  if p_user_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- `for update` is the whole point: it makes the value we report as `from` the
  -- value this statement actually replaced, not one observed a round trip ago.
  -- `into` on a no-row select leaves v_before NULL, which is indistinguishable
  -- from a member whose override IS null — so the miss is detected with FOUND,
  -- not by testing the variable.
  select credit_mode_override into v_before
    from profiles where id = p_user_id for update;

  if not found then
    return jsonb_build_object('status', 'no_such_user');
  end if;

  -- p_value is deliberately NOT null-checked: NULL is a real value here and
  -- means "follow the global switch", which is where every member starts and
  -- where most should stay. See credit_mode_for().
  --
  -- `is distinct from` rather than `<>` for the same reason: with NULL in play,
  -- `<>` answers NULL, and a change detector that returns NULL detects nothing.
  if v_before is not distinct from p_value then
    return jsonb_build_object('status', 'ok', 'from', to_jsonb(v_before), 'changed', false);
  end if;

  update profiles set credit_mode_override = p_value where id = p_user_id;

  return jsonb_build_object('status', 'ok', 'from', to_jsonb(v_before), 'changed', true);
end $$;

comment on function public.credit_set_mode_override(uuid, boolean) is
  'Set profiles.credit_mode_override for one member, and report what it '
  'replaced. Security definer because the column grant on profiles deliberately '
  'excludes this column for every client role including an admin''s — see the '
  'header of 20260828140000. Checks is_admin itself; a NULL auth.uid() is the '
  'trusted server context. Returns {status, from, changed}: `changed` is false '
  'when the value was already what was asked for, and the caller must not write '
  'an audit row for that.';

revoke all on function public.credit_set_mode_override(uuid, boolean) from public, anon;
grant execute on function public.credit_set_mode_override(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Proof, in a subtransaction that is rolled back.
-- ---------------------------------------------------------------------------
do $$
declare
  v_uid uuid;
  r     jsonb;
begin
  begin
    select id into v_uid from profiles limit 1;
    if v_uid is null then return; end if;

    -- auth.uid() is NULL here — the trusted server context — so the guard passes
    -- and what is under test is the reporting.
    r := public.credit_set_mode_override(v_uid, true);
    assert r->>'status' = 'ok', 'expected ok, got ' || r::text;
    assert (r->>'changed')::boolean, 'first write should report changed';

    r := public.credit_set_mode_override(v_uid, true);
    assert not (r->>'changed')::boolean, 'setting the same value must report changed=false';
    assert r->>'from' = 'true', 'from should be the value it found';

    r := public.credit_set_mode_override(v_uid, null);
    assert (r->>'changed')::boolean, 'true -> null is a change';
    assert r->>'from' = 'true', 'from should be true, got ' || coalesce(r->>'from', '<absent>');

    r := public.credit_set_mode_override(v_uid, null);
    assert not (r->>'changed')::boolean, 'null -> null is not a change';
    assert r->'from' = 'null'::jsonb, 'from should be json null';

    r := public.credit_set_mode_override(gen_random_uuid(), true);
    assert r->>'status' = 'no_such_user', 'expected no_such_user, got ' || r::text;

    raise exception 'rollback the assertions';
  exception when others then
    if sqlerrm <> 'rollback the assertions' then raise; end if;
  end;
end $$;
