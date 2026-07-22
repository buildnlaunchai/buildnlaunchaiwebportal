-- ============================================================
-- Admin-uploadable site logo. Shown in the marketing header and the app
-- sidebar; falls back to the built-in daisy mark when unset. It is a PUBLIC
-- asset (everyone sees the logo), so it's exposed via the app_settings_public
-- view — the same safe, security-definer read path as the other public flags.
-- ============================================================

alter table app_settings add column if not exists logo_url text;

-- Re-create the public view to include logo_url (appended at the end, which
-- `create or replace view` permits). Still a security-definer view: it runs as
-- its owner and exposes ONLY these safe columns to anon/authenticated.
create or replace view app_settings_public as
  select applications_open, maintenance_mode, logo_url
  from app_settings
  where id = true;

grant select on app_settings_public to anon, authenticated;
