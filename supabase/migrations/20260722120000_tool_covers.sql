-- ============================================================
-- tool-covers — public Storage bucket for tool card thumbnails.
--
-- Covers are shown on the PUBLIC catalog (/tools) and on dashboard cards, so the
-- bucket is public-read. Uploads and deletes go exclusively through the admin
-- Server Action (actions/admin-tools.ts) on the service-role client, which
-- bypasses RLS — so NO insert/update/delete policy is granted to any client
-- role. The client can never write to this bucket directly.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('tool-covers', 'tool-covers', true)
on conflict (id) do nothing;

-- Public read: a cover is meant to be seen by anyone, the same as the tool card
-- it sits on. (A public bucket already serves objects at /object/public/**;
-- this policy makes the intent explicit and also covers authenticated API reads.)
create policy "tool covers are publicly readable"
  on storage.objects for select
  using (bucket_id = 'tool-covers');
