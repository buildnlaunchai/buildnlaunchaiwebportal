-- ============================================================================
-- CREDIT SYSTEM — tools.consumes_credit + the access engine (3 of 3)
--
-- The rule changes from "member = access" to "member OR credit":
--
--   active member                        -> every tool they already had  (byok)
--   lapsed + consumes_credit + balance   -> that tool, paid in credit    (credit)
--   lapsed + no balance                  -> nothing                      (none)
--
--
-- ############################################################################
-- ##                                                                        ##
-- ##  ⚠️  SEQUENCING WARNING — READ BEFORE THE FIRST TOP-UP GOES ON SALE     ##
-- ##                                                                        ##
-- ##  THIS MIGRATION IS SAFE TODAY ONLY BECAUSE NOBODY CAN HOLD CREDIT.     ##
-- ##                                                                        ##
-- ##  can_access_tool() now returns TRUE for a lapsed member who has        ##
-- ##  credit. Three call sites read that boolean and CANNOT SEE THE MODE:   ##
-- ##                                                                        ##
-- ##    1. supabase/functions/_shared/client-gate.ts  ->  gate()            ##
-- ##       feeds desktop-keys and upworkpilot-keys. Both release the        ##
-- ##       member's DECRYPTED PROVIDER KEY on `hasAccess === true`.         ##
-- ##       A lapsed member in credit mode would therefore be handed their   ##
-- ##       BYOK key — the exact thing the business rule forbids, because    ##
-- ##       in credit mode WE pay the provider and they must not.            ##
-- ##                                                                        ##
-- ##    2. lib/runner.ts step (d)  ->  has_required_keys()                  ##
-- ##       In credit mode there is deliberately no member key, so this      ##
-- ##       gate REFUSES a run that should have been allowed. Fails in the   ##
-- ##       safe direction, but it means credit runs simply will not work    ##
-- ##       until it is mode-aware.                                          ##
-- ##                                                                        ##
-- ##    3. lib/key-release.ts and actions/key-release.ts                     ##
-- ##       The consent screen would offer key-release toggles to a lapsed   ##
-- ##       member who should not be releasing keys at all.                  ##
-- ##                                                                        ##
-- ##  All three are UNREACHABLE right now: credit_available() returns 0     ##
-- ##  for every user, because credit_topup() has no caller — no Creem       ##
-- ##  product, no gateway route, no UI, and no seeded credit. The `credit`   ##
-- ##  branch below is dead code the day this is applied, so behaviour for   ##
-- ##  every existing member is bit-for-bit unchanged.                       ##
-- ##                                                                        ##
-- ##  THE MOMENT A TOP-UP CAN BE BOUGHT, ALL THREE MUST ALREADY READ        ##
-- ##  tool_access() INSTEAD OF can_access_tool(). Ship them first. If this  ##
-- ##  ordering is lost, the first lapsed member with $5 of credit gets      ##
-- ##  their OpenAI key back and spends it themselves while we bill them     ##
-- ##  for credit they never consume. That is real money, in both            ##
-- ##  directions, and nothing in the schema can catch it.                   ##
-- ##                                                                        ##
-- ############################################################################
-- ============================================================================


-- ---------------------------------------------------------------------------
-- The mode a tool is open in.
--
-- 'none' is a member of the enum rather than a null, so a function returning it
-- always answers the question. A nullable mode invites `if mode = 'byok'` to be
-- written without an else, and a null that means "denied" silently reads as
-- "not yet decided" at every call site.
-- ---------------------------------------------------------------------------
create type tool_access_mode as enum ('none', 'byok', 'credit');


-- ---------------------------------------------------------------------------
-- tools.consumes_credit — does this tool spend credit?
--
-- NOT derived from required_providers, although today that column happens to be
-- an exact proxy across all four live tools. required_providers is edited in the
-- admin tool editor, whose mental model is "which keys does this tool need" —
-- and _shared/client-gate.ts already refuses to derive its provider allow-list
-- from it for the same reason. A field a form can change must not decide who
-- gets billed.
--
-- Publicly readable, like the rest of `tools`, and that is correct: which tools
-- cost credit is exactly what a pricing chip has to say out loud.
-- ---------------------------------------------------------------------------
alter table tools
  add column consumes_credit boolean not null default false;

comment on column tools.consumes_credit is
  'This tool calls a paid AI provider, so it can be run on platform credit. '
  'Set explicitly per tool — never derived from required_providers.';

-- The two live tools that call a provider: the desktop app (OpenAI +
-- ElevenLabs) and the UpworkPilot extension (OpenAI).
--
-- image_animator runs its model in the member's own browser and
-- cinematic_workflow makes no AI call at all, so both stay false — they are
-- membership features, and credit will not open them.
update tools set consumes_credit = true
 where slug in ('raw-footage-real-story', 'upworkpilot');


-- ---------------------------------------------------------------------------
-- tool_access_resolve — THE access engine. Same rules as before, plus a mode.
--
-- INTERNAL. The two public entry points below wrap it: can_access_tool for the
-- boolean (exactly as permissive as it has always been) and tool_access for the
-- mode (which reveals more, so it checks who is asking).
--
-- ORDER IS THE SPECIFICATION. It mirrors §7's access resolution exactly, and
-- _shared/client-gate.ts's licenceDenialReason() mirrors it in turn. Reorder
-- anything here and that file starts telling members the wrong reason.
-- ---------------------------------------------------------------------------
create or replace function public.tool_access_resolve(
  p_tool_id uuid,
  uid uuid default auth.uid()
)
returns tool_access_mode
language plpgsql stable security definer set search_path = public as $$
declare
  t          tools%rowtype;
  suspended  boolean;
begin
  -- Anonymous is never granted anything. Explicit, not a coalesce() accident.
  if uid is null then return 'none'; end if;

  select * into t from tools where id = p_tool_id;
  if not found then return 'none'; end if;

  -- draft / archived: only an admin can even see the runner.
  if t.status not in ('published', 'maintenance') then
    return case when public.is_admin(uid) then 'byok'::tool_access_mode
                else 'none'::tool_access_mode end;
  end if;

  select is_suspended into suspended from profiles where id = uid;
  if suspended is null then return 'none'; end if;   -- no profile = not a user
  if suspended then return 'none'; end if;           -- suspended beats everything

  if public.is_admin(uid) then return 'byok'; end if;

  -- Explicit per-user grant always wins, and it wins for a LAPSED member too —
  -- exactly as it did before this migration. A grant is a relationship someone
  -- deliberately created; credit is not what is paying for it.
  if exists (
    select 1 from user_tool_access a
    where a.user_id = uid and a.tool_id = p_tool_id
      and (a.expires_at is null or a.expires_at > now())
  ) then
    return 'byok';
  end if;

  -- Open to any signed-in user, membership or not.
  if t.access_type = 'public_preview' then
    return 'byok';
  end if;

  if public.has_active_membership(uid) then
    if t.access_type = 'members' then
      return 'byok';
    end if;

    if t.access_type = 'plan' then
      return case when exists (
        select 1
          from memberships m
          join plan_tools pt on pt.plan_id = m.plan_id
         where m.user_id = uid and pt.tool_id = p_tool_id
      ) then 'byok'::tool_access_mode else 'none'::tool_access_mode end;
    end if;

    -- access_type = 'manual' and no explicit grant above.
    return 'none';
  end if;

  -- ---- Lapsed. Credit opens exactly the tools that spend credit. ----------
  --
  -- No access_type condition here, deliberately. Tying the credit path to
  -- access_type = 'members' would work today (all four tools are 'members') and
  -- break silently later: per-tool subscriptions and one-time lifetime
  -- purchases will introduce 'manual' and 'plan' tools that genuinely should
  -- run on credit, and nobody would connect the failure to a condition written
  -- here a year earlier.
  --
  -- The relationship concern that condition was standing in for is already
  -- handled above, by the user_tool_access branch, which returns before this
  -- point.
  if t.consumes_credit and public.credit_available(uid) > 0 then
    return 'credit';
  end if;

  return 'none';
end $$;


-- ---------------------------------------------------------------------------
-- can_access_tool — unchanged signature, unchanged return type, new body.
--
-- THIS IS WHY NOTHING BREAKS. `create or replace function` keeps a function's
-- oid, so every existing caller — lib/runner.ts, _shared/client-gate.ts, the
-- runner page, lib/key-release.ts, accessible_tool_ids — keeps working with no
-- change at all. Returning tool_access_mode from here instead would have needed
-- a DROP, and a DROP would have taken accessible_tool_ids with it.
--
-- Note what it does NOT gain: the subject guard on tool_access below. This
-- function answers for any uid, from any caller, exactly as it always has. It
-- is a one-line wrapper so there is one copy of the rules — not a behaviour
-- change wearing a wrapper's clothes. The old body is preserved verbatim in the
-- rollback block at the foot of this file.
-- ---------------------------------------------------------------------------
create or replace function public.can_access_tool(
  p_tool_id uuid,
  uid uuid default auth.uid()
)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.tool_access_resolve(p_tool_id, uid) <> 'none';
$$;


-- ---------------------------------------------------------------------------
-- tool_access — the mode, for callers entitled to know it.
--
-- WHY THIS ONE CHECKS WHO IS ASKING AND can_access_tool DOES NOT.
--
-- The mode carries information the boolean never did: a `credit` answer means
-- that user holds a positive balance. can_access_tool has always answered for
-- an arbitrary uid, and every caller in the product relies on that — so it is
-- left exactly as permissive as it was. But widening it to leak "does this
-- person have money on the platform" to any signed-in member who asks would be
-- a new hole dug by a migration that was supposed to close one.
--
-- So: you may ask about yourself. An admin may ask about anyone. The service
-- role (auth.uid() is null — the Edge Functions, the runner) is unaffected,
-- which is what keeps gate() and embed-token working.
-- ---------------------------------------------------------------------------
create or replace function public.tool_access(
  p_tool_id uuid,
  uid uuid default auth.uid()
)
returns tool_access_mode
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and uid is distinct from auth.uid()
     and not public.is_admin(auth.uid())
  then
    return 'none';
  end if;

  return public.tool_access_resolve(p_tool_id, uid);
end $$;


-- ---------------------------------------------------------------------------
-- accessible_tool_modes — the whole dashboard grid, with modes, in one trip.
--
-- accessible_tool_ids stays exactly as it was; this is a sibling, not a
-- replacement, so nothing that reads the old one has to move. Use this one
-- where the UI needs to distinguish "you can run this on your own key" from
-- "this will cost you credit".
--
-- Goes through tool_access, so it inherits the same subject guard — and
-- resolves each tool ONCE, in a subquery, rather than calling the engine twice
-- per row to compute the value and then filter on it.
-- ---------------------------------------------------------------------------
create or replace function public.accessible_tool_modes(uid uuid default auth.uid())
returns table (tool_id uuid, mode tool_access_mode)
language sql stable security definer set search_path = public as $$
  select m.tool_id, m.mode
    from (
      select t.id as tool_id, public.tool_access(t.id, uid) as mode
        from tools t
    ) m
   where m.mode <> 'none';
$$;


-- ---------------------------------------------------------------------------
-- Grants.
--
-- tool_access_resolve is INTERNAL — it is the unguarded engine, and the only
-- things that may reach it are the two wrappers above (as the definer) and the
-- service role.
-- ---------------------------------------------------------------------------
revoke all on function public.tool_access_resolve(uuid, uuid)  from public, anon, authenticated;
grant execute on function public.tool_access_resolve(uuid, uuid)     to service_role;
grant execute on function public.tool_access(uuid, uuid)             to authenticated, service_role;
grant execute on function public.accessible_tool_modes(uuid)         to authenticated, service_role;


-- ============================================================================
-- ROLLBACK
--
-- Restores the pre-credit engine. can_access_tool's original body is reproduced
-- in full so this is a paste, not a reconstruction from git.
--
--   drop function if exists public.accessible_tool_modes(uuid);
--
--   create or replace function public.can_access_tool(p_tool_id uuid, uid uuid default auth.uid())
--   returns boolean language plpgsql stable security definer set search_path = public as $BODY$
--   declare
--     t          tools%rowtype;
--     suspended  boolean;
--   begin
--     if uid is null then return false; end if;
--     select * into t from tools where id = p_tool_id;
--     if not found then return false; end if;
--     if t.status not in ('published', 'maintenance') then
--       return public.is_admin(uid);
--     end if;
--     select is_suspended into suspended from profiles where id = uid;
--     if suspended is null then return false; end if;
--     if suspended then return false; end if;
--     if public.is_admin(uid) then return true; end if;
--     if exists (
--       select 1 from user_tool_access a
--       where a.user_id = uid and a.tool_id = p_tool_id
--         and (a.expires_at is null or a.expires_at > now())
--     ) then
--       return true;
--     end if;
--     if t.access_type = 'public_preview' then return true; end if;
--     if not public.has_active_membership(uid) then return false; end if;
--     if t.access_type = 'members' then return true; end if;
--     if t.access_type = 'plan' then
--       return exists (
--         select 1 from memberships m
--         join plan_tools pt on pt.plan_id = m.plan_id
--         where m.user_id = uid and pt.tool_id = p_tool_id
--       );
--     end if;
--     return false;
--   end $BODY$;
--
--   drop function if exists public.tool_access(uuid, uuid);
--   drop function if exists public.tool_access_resolve(uuid, uuid);
--   drop type if exists tool_access_mode;
--   alter table tools drop column if exists consumes_credit;
-- ============================================================================
