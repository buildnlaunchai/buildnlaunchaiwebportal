-- ============================================================================
-- Phase 8 — Email + notifications.  (CLAUDE.md §6.10, §7, §11)
--
-- Every email is also written here for the in-app bell. Members read their own
-- notifications and mark them read; they never insert (that's the service role,
-- from Server Actions and the run-tool Edge Function). No email is ever sent
-- from a client component (§11).
-- ============================================================================

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  title      text not null,
  body       text,
  href       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on notifications (user_id, read_at, created_at desc);

-- Members may set read_at on their own rows — and ONLY read_at. Column grant,
-- because RLS grants rows, not columns: without this a member could rewrite the
-- title/body of their own notifications.
revoke update on notifications from anon, authenticated;
grant update (read_at) on notifications to authenticated;
-- No insert/delete for clients: notifications are written with the service role.

alter table notifications enable row level security;

create policy notifications_select_own
  on notifications for select to authenticated
  using (user_id = auth.uid());

create policy notifications_update_own
  on notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notifications_all_admin
  on notifications for select to authenticated
  using (public.is_admin());

-- The bell subscribes to this over Realtime, so a new notification appears
-- without a refresh. Realtime respects RLS — a subscriber only gets their own.
alter publication supabase_realtime add table notifications;

-- ============================================================================
-- Announcements (§6.10) — the banner. Admin composes and publishes; everyone
-- reads only the published ones (via RLS), so an unpublished draft never leaks.
-- ============================================================================
create table announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text,
  variant      text not null default 'info',   -- info | success | warning
  tool_id      uuid references tools(id) on delete set null,
  is_published boolean not null default false,
  published_at timestamptz,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create index announcements_published_idx on announcements (is_published, published_at desc);

alter table announcements enable row level security;

create policy announcements_select_published
  on announcements for select to anon, authenticated
  using (is_published);

create policy announcements_all_admin
  on announcements for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
