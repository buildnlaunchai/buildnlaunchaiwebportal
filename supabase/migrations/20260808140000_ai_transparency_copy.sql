-- ============================================================
-- AI transparency copy corrections.
--
-- Catalog copy is data (§3) and is normally edited in the admin tool editor with
-- no deploy. These three changes go in a migration anyway, because they are
-- compliance-relevant: they are the claims a payment provider reviews, and a
-- claim that only exists as an untracked admin edit cannot be reviewed, diffed,
-- or restored. Editing them later in the admin still works and still wins.
--
-- Each change below was verified against the code that actually runs, not
-- against what the copy assumed.
-- ============================================================

-- 1. Hacker News digest -----------------------------------------------------
-- "writes a tight digest" implied generation. The handler
-- (supabase/functions/run-tool/handlers/hacker-news-digest.ts) uses NO LLM — its
-- own comment says so: "it organizes, it doesn't opine." It sorts and formats
-- Algolia results. Saying that plainly is both accurate and a trust signal: it
-- is the tool a stranger runs first, and "no AI, no key, no account" is a better
-- first impression than an overclaim we'd have to walk back.
update tools set
  description = E'Pick a topic and a window. It reads the top Hacker News stories, filters to what matches, and organises them into a scannable digest with the links that matter.\n\nNo AI model is involved — it sorts and formats public Hacker News data, nothing more. It runs on the free Hacker News API: no key, no account, nothing to connect. It''s here so you can see how a tool feels before you commit to anything.'
where slug = 'hacker-news-digest';

-- 2. Living Image Animator --------------------------------------------------
-- The old copy said "the AI runs in your browser" without naming anything.
-- Verified in the app's own bundle: it loads onnx-community/ormbg-ONNX
-- (background removal) and onnx-community/depth-anything-v2-small (depth
-- estimation) through @huggingface/transformers 3.8.1 from jsDelivr. Open models,
-- no vendor API, no key. Naming them is the disclosure requirement AND the
-- strongest privacy claim we have, so it is worth the extra sentence.
update tools set
  description = E'Upload a still image. It separates the subject from the background, estimates depth, and animates the whole thing into a short, quietly alive clip you can export as video.\n\nIt runs two open-source models — ORMBG for background removal and Depth Anything V2 for depth — entirely **in your browser**, via Transformers.js. The models download once from a public CDN (about 176 MB, cached afterwards) and your image never leaves your machine: no API key to connect, no AI service involved, nothing to pay for.'
where slug = 'image_animator';

-- 3. Cinematic Workflow -----------------------------------------------------
-- ⚠️ THIS IS A PRODUCT-POSITIONING CHANGE, NOT A DISCLAIMER. READ BEFORE DEPLOY.
--
-- The shipped copy — tagline "Turn your footage into a cinematic edit",
-- description "an embedded Build & Launch app" — was placeholder text (see
-- 20260721120000) and it is not accurate. The app's own source was checked:
--
--   * package.json has no AI dependency of any kind.
--   * Its Supabase functions are storage-only (r2-multipart-upload,
--     generate-upload-url, storage-credentials).
--   * The only external hosts in its code are a Cloudflare docs link and
--     Google Drive.
--   * Its README describes "a self-hostable, Frame.io-style video review tool".
--
-- It does not edit footage and it does not generate anything. "Turn your footage
-- into a cinematic edit" promises a capability the product does not have, which
-- is the single largest overclaim on the site and exactly what an AI-wrapper
-- transparency review looks for.
--
-- The copy below describes what the app does. If the intent was always to ship
-- AI editing later, change the ROADMAP, not this row — do not restore a claim the
-- code cannot back.
update tools set
  tagline = 'Review video with your client — timecoded comments, versions, share links.',
  description = E'Create a workflow, add video versions, and collect timecoded, range, and spatially-pinned comments with threaded replies and attachments. Compare two versions side by side, and share a read-only link with clients who don''t have an account.\n\nNo AI model is used anywhere in this tool. Videos live in your own storage — nothing is sent to a third-party AI service.'
where slug = 'cinematic_workflow';
