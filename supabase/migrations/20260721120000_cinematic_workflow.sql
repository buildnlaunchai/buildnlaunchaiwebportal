-- ============================================================
-- The second `iframe` tool: Cinematic Workflow.
--
-- Same shape as the Living Image Animator (20260717120000): a row, not code
-- (§3). A standalone app we built separately, embedded by the hub and handed a
-- signed RS256 token asserting who the user is and that they may open it. The
-- hub runs no handler and stores no runs — the app owns its own work and schema.
-- What the hub still owns is the only thing that matters: access.
--
-- THE SLUG IS LOAD-BEARING AND IS NOT A TYPO.
--
-- `cinematic_workflow` breaks this table's kebab-case convention on purpose, for
-- the same reason `image_animator` does: the deployed app
-- (cinematic-workflow-embedded, served at cinematic-workflow.buildnlaunchai.com)
-- checks `aud = 'cinematic_workflow'` and `tools.includes('cinematic_workflow')`
-- on every hub token. embed-token mints `aud`/`tools` from THIS slug, so renaming
-- it silently locks every member out with a claim-validation failure. If you are
-- here to "fix" the underscore: don't — or change the app's verify side first and
-- redeploy it.
--
-- Idempotent (`on conflict do nothing`) so applying it twice — or via `db push`
-- after the row already exists — is a safe no-op.
--
-- NOTE — placeholder copy. `tagline` is NOT NULL and no final copy was provided,
-- so tagline/description/category/icon below are reasonable placeholders. They
-- are data: edit them live in the admin tool editor with no deploy (§3).
-- ============================================================

insert into tools
  (slug, name, tagline, description, category, icon, status, access_type,
   runtime, required_providers, version, sort_order, launched_at,
   input_schema, output_schema)
values
  ('cinematic_workflow',
   'Cinematic Workflow',
   'Turn your footage into a cinematic edit.',                       -- PLACEHOLDER: edit in admin
   'Cinematic Workflow is an embedded Build & Launch app. Open it to start a session.', -- PLACEHOLDER
   'video', 'video', 'published', 'members',
   'iframe',
   -- An iframe app brings its own compute; the hub manages no provider keys for
   -- it, so has_required_keys() is trivially true and a member can open it the
   -- minute they are approved (§10).
   '{}',
   '1.0.0', 6,
   '2026-07-21T12:00:00Z',
   -- No generated form, no output blocks: the app IS the interface. Both stay
   -- empty rather than being faked.
   '{"fields":[]}'::jsonb,
   '{"type":"blocks","blocks":[]}'::jsonb)
on conflict (slug) do nothing;

-- Runtime config. embed_url lives in tool_secrets, not tools, because `tools` is
-- world-readable and this is not a column a client may select (§6.6b). The hub
-- reads it server-side and passes it as a prop, after an access check.
--
-- The subdomain is not cosmetic: cinematic-workflow.buildnlaunchai.com shares its
-- registrable domain with the hub (www.buildnlaunchai.com), which keeps the
-- iframe first-party so the app's own session cookie survives. A *.vercel.app URL
-- here would be cross-site and Safari would drop the cookie — every member would
-- see the app's locked screen. See TEMPLATE.md, "Embedded apps are served from a
-- hub subdomain".
insert into tool_secrets (tool_id, embed_url)
select id, 'https://cinematic-workflow.buildnlaunchai.com'
from tools where slug = 'cinematic_workflow'
on conflict (tool_id) do nothing;
