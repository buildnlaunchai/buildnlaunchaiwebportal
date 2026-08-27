-- ============================================================================
-- WHY a credit member was refused — because "no" is not one answer.
--
-- tool_access_resolve returns 'none' for a lapsed member in three different
-- situations, and the four client endpoints turned all three into the same
-- sentence: "no active licence for this app".
--
--   1. They never had access.                      True. Say so.
--   2. Credit mode is switched OFF.                Their licence is exactly as
--                                                  it was. WE turned the system
--                                                  off. Telling them their
--                                                  membership ended is false,
--                                                  and it sends them to a
--                                                  checkout that fixes nothing.
--   3. Their credit ran out.                       Not a bug and not an edge
--                                                  case — it is what happens to
--                                                  EVERY credit customer, on the
--                                                  day they spend their balance.
--                                                  "Your membership does not
--                                                  include this app" is the
--                                                  wrong thing to tell someone
--                                                  who needs to buy credit.
--
-- ai-gateway/index.ts already carries a comment explaining why IT reads the kill
-- switch before the mode for exactly this reason. That fix never reached the
-- keys or licence endpoints, which shipped earlier. This function is how all six
-- callers get it at once.
--
-- IT EXPLAINS, IT NEVER DECIDES. The first thing it does is ask
-- tool_access_resolve, and it returns null unless that said 'none'. So it cannot
-- disagree with the access engine about access — the worst it can do is decline
-- to explain. That is deliberate: two functions that both decide is how the
-- answer starts depending on which one you asked.
-- ============================================================================

create or replace function public.credit_denial_reason(
  p_tool_id uuid,
  uid uuid default auth.uid()
)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  t          tools%rowtype;
  suspended  boolean;
begin
  -- Defer to the engine. Only a 'none' has anything to explain.
  if uid is null then return null; end if;
  if public.tool_access_resolve(p_tool_id, uid) <> 'none' then return null; end if;

  select * into t from tools where id = p_tool_id;
  if not found then return null; end if;
  if t.status not in ('published', 'maintenance') then return null; end if;

  -- A tool that does not spend credit can never be refused FOR credit reasons.
  if not t.consumes_credit then return null; end if;

  -- Suspension is its own answer and outranks everything, exactly as it does in
  -- tool_access_resolve. A suspended member must not be told to buy credit.
  select is_suspended into suspended from profiles where id = uid;
  if suspended is null or suspended then return null; end if;

  if public.is_admin(uid) then return null; end if;

  -- Still inside their membership: their 'none' is about the plan or the tool,
  -- nothing to do with credit.
  if public.has_active_membership(uid) then return null; end if;

  -- ---- The explanation is NOT ordered the way the engine is ---------------
  --
  -- tool_access_resolve checks the kill switch before the balance, and says why:
  -- "a disabled system costs one cheap read of a one-row table rather than a
  -- lookup per user". That is an argument about COST, and it is right for a
  -- function that only has to answer yes or no.
  --
  -- It is the wrong order for an explanation, and following it here produced a
  -- worse lie than the one this function was written to fix. With the switch
  -- off, EVERY lapsed member was told "credit mode is paused, nothing is wrong
  -- with your account" — including people who never bought a credit in their
  -- lives and whose membership simply ended. They would wait for a system they
  -- were never using to come back.
  --
  -- So the order here is by what the member can DO about it.

  -- Never held credit at all. The credit system is not their story; their
  -- membership is. Say nothing and let the ordinary reasons speak — a lapsed
  -- member hears "membership_inactive", which is exactly right for them.
  --
  -- `credit_lots` and not the balance, because the question is "was this ever a
  -- credit account", and a spent account has a balance of zero and a history.
  if not exists (select 1 from credit_lots where user_id = uid) then
    return null;
  end if;

  -- Past here they are a credit customer, and they were refused.

  -- Nothing they can do will help while the switch is off — not even topping up.
  -- So it outranks an empty balance for them, and only for them.
  if not (select credit_mode_enabled from credit_settings where id = true) then
    return 'credit_mode_disabled';
  end if;

  -- The switch is on, so an empty balance is the whole of it, and topping up is
  -- a thing they can actually do.
  if public.credit_available(uid) <= 0 then
    return 'credit_exhausted';
  end if;

  -- The engine said 'none' for a reason this function does not know about.
  -- Returning null is correct: the caller falls back to its generic wall rather
  -- than inventing a cause.
  return null;
end $$;

comment on function public.credit_denial_reason(uuid, uuid) is
  'Why a credit-eligible member was refused: credit_mode_disabled | '
  'credit_exhausted | null. EXPLAINS a ''none'' from tool_access_resolve and '
  'never decides one — it asks that function first and defers to it. Read by '
  'the four external-client endpoints so they stop reporting a switched-off '
  'system, or an empty balance, as a dead membership.';

revoke all on function public.credit_denial_reason(uuid, uuid) from public, anon;
grant execute on function public.credit_denial_reason(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Rollback:
--   drop function if exists public.credit_denial_reason(uuid, uuid);
--   -- and revert the four endpoints to a bare 403.
-- ---------------------------------------------------------------------------
