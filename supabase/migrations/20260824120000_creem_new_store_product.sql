-- ============================================================
-- Point the 'member' plan at the product in the CURRENT Creem store.
--
-- The old Creem store was deleted and rebuilt, which took its product ids with
-- it. plans.provider_price_id still held prod_3gsru7qPVVruCa0FqFfHvi from
-- migration 20260808130000, so every checkout attempt died at Creem with:
--
--     HTTP 404  {"status":404,"message":["Product not found"]}
--
-- Verified against the live test API before writing this, so the replacement is
-- a checked fact rather than a copied string:
--   prod_3gsru7qPVVruCa0FqFfHvi -> 404 Product not found   (the reported bug)
--   prod_4MqjbtbJZj7yPFWdzazRkg -> 200, mode=test, active,
--                                  recurring every-month, 1000 USD
--
-- The 1000 matters: it equals plans.price_monthly, so the price a member is
-- shown on /pricing is the price Creem will actually charge. A product id that
-- resolves but bills a different amount would be a worse bug than a 404,
-- because nothing would surface it until a customer complained.
--
-- This is exactly the change lib/billing.ts was designed to absorb: the
-- checkout target is DATA, not config, so swapping stores is one UPDATE and no
-- redeploy. Nothing in the application changes.
--
-- STILL TEST MODE. mode='test' above is not an oversight — CREEM_TEST_MODE is
-- true and this deploy takes no real money. Going live needs a LIVE-mode
-- product id here (test ids do not resolve against the live API, which is the
-- same class of failure this migration is fixing), plus a live API key, a live
-- webhook secret, and CREEM_TEST_MODE=false.
--
-- A new migration rather than an edit to 20260808130000: the runner tracks
-- applied versions and will never re-run an edited file, so amending that one
-- would leave this fix unapplied on every database where it had already run —
-- silently, with a broken checkout as the symptom.
-- ============================================================

update plans
   set provider_price_id = 'prod_4MqjbtbJZj7yPFWdzazRkg'
 where slug = 'member'
   and provider = 'creem';
