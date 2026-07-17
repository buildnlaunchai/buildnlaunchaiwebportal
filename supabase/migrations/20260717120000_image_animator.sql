-- ============================================================
-- Phase 11 — the first `iframe` tool: the Living Image Animator.
--
-- A row, not code (§3). What is unusual here is only what an iframe tool IS: a
-- standalone app we built separately, which the hub embeds and hands a signed
-- token asserting who the user is and that they may open it. The hub runs no
-- handler for it and stores no runs — the app owns its own work and its own
-- schema. What the hub still owns is the only thing that matters: access.
--
-- THE SLUG IS LOAD-BEARING AND IS NOT A TYPO.
--
-- `image_animator` breaks this table's kebab-case convention on purpose. The
-- deployed app already checks `tools.includes('image_animator')` and requires
-- `aud = 'image_animator'` on every token (its lib/hub/verify.ts). The row is
-- free to set now; the live app is not. Renaming this slug silently locks every
-- member out of the app with a claim-validation failure, so if you are here to
-- "fix" the inconsistency: don't, or change the app first and redeploy it.
-- ============================================================

insert into tools
  (slug, name, tagline, description, category, icon, status, access_type,
   runtime, required_providers, version, sort_order, launched_at,
   input_schema, output_schema)
values
  ('image_animator',
   'Living Image Animator',
   'Bring a still photo to life — subject cut out, depth mapped, gently moving.',
   E'Upload a still image. It separates the subject from the background, estimates depth, and animates the whole thing into a short, quietly alive clip you can export as video.\n\nThe AI runs **in your browser**, not on a server: the model downloads once and the image never leaves your machine. That means no API key to connect and nothing to pay for — but the first run pulls a ~176 MB model, so give it a moment on a slow connection.',
   'content', 'image', 'published', 'members',
   'iframe',
   -- No provider keys: the model runs client-side, so there is no key to bring
   -- and has_required_keys() is trivially true. This is a tool a brand-new
   -- member can use the minute they are approved (§10).
   '{}',
   '1.0.0', 5,
   '2026-07-17T09:00:00Z',
   -- An iframe tool renders no generated form and no output blocks: the app IS
   -- the interface. Both stay empty rather than being faked, so <ToolForm> and
   -- <ToolOutput> are never asked to render something that does not exist.
   '{"fields":[]}'::jsonb,
   '{"type":"blocks","blocks":[]}'::jsonb);

-- The runtime config. embed_url lives in tool_secrets, not tools, for the same
-- structural reason as everything else in that table: `tools` is world-readable
-- and this is not a column a client should be able to select (§6.6b). The hub
-- reads it server-side and passes it as a prop, after an access check.
--
-- The subdomain is not cosmetic. animator.buildnlaunchai.com shares its
-- registrable domain with the hub at www.buildnlaunchai.com, which makes the
-- iframe first-party and lets the app's session cookie survive. A *.vercel.app
-- URL here would be cross-site — Safari would block the cookie outright and
-- every member would see the app's locked screen. See TEMPLATE.md, "Embedded
-- apps are served from a hub subdomain".
insert into tool_secrets (tool_id, embed_url)
select id, 'https://animator.buildnlaunchai.com' from tools where slug = 'image_animator';
