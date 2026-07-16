-- ============================================================================
-- Phase 10 — Community loop.  (CLAUDE.md §6.10, §7)
--
-- INVARIANT PRESERVED: these are ENGAGEMENT tables — feature requests, votes,
-- tool interest. NONE of them grant tool access, and can_access_tool reads NONE
-- of them. The access engine stays the single source of truth.
-- ============================================================================

create table feature_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  title       text not null,
  body        text,
  status      text not null default 'open',   -- open | planned | building | shipped | declined
  shipped_tool_id uuid references tools(id) on delete set null,
  vote_count  integer not null default 0,     -- denormalized, kept in sync by trigger
  created_at  timestamptz not null default now()
);

create index feature_requests_votes_idx on feature_requests (vote_count desc, created_at desc);

create table feature_request_votes (
  request_id uuid not null references feature_requests(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

create table tool_interest (
  tool_id    uuid not null references tools(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tool_id, user_id)
);

-- ---------------------------------------------------------------------------
-- vote_count stays in sync via a trigger — security definer, so it can write
-- vote_count even though members can't (they may only insert/delete their own
-- vote row).
-- ---------------------------------------------------------------------------
create or replace function public.sync_vote_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    update feature_requests set vote_count = vote_count + 1 where id = new.request_id;
  elsif TG_OP = 'DELETE' then
    update feature_requests set vote_count = greatest(vote_count - 1, 0) where id = old.request_id;
  end if;
  return null;
end $$;

create trigger feature_request_votes_count
  after insert or delete on feature_request_votes
  for each row execute function public.sync_vote_count();

-- ===========================================================================
-- RLS
-- ===========================================================================

-- ---- feature_requests -----------------------------------------------------
-- Members may edit only the title/body of their OWN open request — column grant,
-- so a member can't set their own status='shipped' or forge vote_count.
revoke update on feature_requests from anon, authenticated;
grant update (title, body) on feature_requests to authenticated;

alter table feature_requests enable row level security;

create policy feature_requests_select_all
  on feature_requests for select to authenticated
  using (true);

create policy feature_requests_insert_own
  on feature_requests for insert to authenticated
  with check (user_id = auth.uid());

create policy feature_requests_update_own_open
  on feature_requests for update to authenticated
  using (user_id = auth.uid() and status = 'open')
  with check (user_id = auth.uid());

create policy feature_requests_all_admin
  on feature_requests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---- feature_request_votes ------------------------------------------------
alter table feature_request_votes enable row level security;

create policy votes_select_all
  on feature_request_votes for select to authenticated
  using (true);
create policy votes_insert_own
  on feature_request_votes for insert to authenticated
  with check (user_id = auth.uid());
create policy votes_delete_own
  on feature_request_votes for delete to authenticated
  using (user_id = auth.uid());

-- ---- tool_interest --------------------------------------------------------
alter table tool_interest enable row level security;

create policy interest_select_own
  on tool_interest for select to authenticated
  using (user_id = auth.uid());
create policy interest_insert_own
  on tool_interest for insert to authenticated
  with check (user_id = auth.uid());
create policy interest_delete_own
  on tool_interest for delete to authenticated
  using (user_id = auth.uid());
create policy interest_all_admin
  on tool_interest for select to authenticated
  using (public.is_admin());
