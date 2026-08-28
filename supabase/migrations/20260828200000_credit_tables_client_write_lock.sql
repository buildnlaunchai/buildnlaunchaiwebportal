-- ============================================================================
-- Two credit tables were writable by client roles as far as GRANTS were
-- concerned. Only RLS was stopping the write, and it was stopping it silently.
--
-- ─── HOW THIS SURFACED ──────────────────────────────────────────────────────
--
-- verify-topup asserts that a member cannot edit the price list, because
-- credit_packages says how many credits $5 buys and a member who could write it
-- could set their own balance. The assertion failed — not because the write
-- succeeded, but because it returned 204.
--
-- 204 is PostgREST reporting an UPDATE that matched ZERO ROWS. anon and
-- authenticated hold table-level INSERT/UPDATE/DELETE from Supabase's default
-- grants; RLS then filtered every row away, because credit_packages has only a
-- SELECT policy. So the data was safe. What was not safe is the shape of the
-- answer: a refusal indistinguishable from a success, which is what a probe
-- reads as a pass and what a future policy edit would turn into a real write
-- with nothing else left to catch it.
--
-- credit_settings is the same, and it matters more: it holds the margin, the
-- rate, the per-call cap and the kill switch. Its `credit_settings_all_admin`
-- policy (FOR ALL, using is_admin()) is the only thing standing between a
-- member and setting the margin to zero. One policy, doing all the work, on the
-- row that decides what everything costs.
--
-- The other four credit tables — balances, ledger, lots, holds — were revoked
-- when they were created. These two were missed.
--
-- ─── WHY THIS BREAKS NOTHING, CHECKED RATHER THAN ASSUMED ───────────────────
--
-- Two days ago a revoke exactly like this one was already in place on
-- profiles.credit_mode_override, and it locked out the ADMIN as well — a grant
-- is checked before RLS and knows nothing about roles. So this was not applied
-- until every writer was found:
--
--   credit_packages  — no writer. Seeded here, product ids set by hand.
--   credit_settings  — no writer. `grep credit_settings` across actions/, app/
--                      and lib/ returns reads only; the kill switch has always
--                      been flipped with the service role.
--
-- SELECT is untouched, so /admin/credits keeps reading both through the admin's
-- own session.
--
-- IF AN EDITOR IS EVER BUILT for either table, the answer is a security-definer
-- RPC that checks is_admin itself — the credit_set_mode_override shape from
-- 20260828140000 — and NOT a re-grant. A grant wide enough for the admin is a
-- grant wide enough for everybody.
-- ============================================================================

revoke insert, update, delete on credit_packages from anon, authenticated;
revoke insert, update, delete on credit_settings from anon, authenticated;

do $$
declare
  n integer;
begin
  select count(*) into n
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('credit_packages', 'credit_settings')
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  assert n = 0, 'client roles still hold write grants on the credit tables: ' || n;

  -- And reading still works, which is the half a careless revoke breaks.
  select count(*) into n
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('credit_packages', 'credit_settings')
     and grantee in ('anon', 'authenticated')
     and privilege_type = 'SELECT';
  assert n > 0, 'SELECT was revoked too — /admin/credits and the price list would break';
end $$;
