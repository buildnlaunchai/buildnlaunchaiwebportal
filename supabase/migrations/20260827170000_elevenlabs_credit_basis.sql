-- ============================================================================
-- ElevenLabs prices move from PER CHARACTER to PER ELEVENLABS CREDIT.
--
-- WHY, IN ONE PARAGRAPH. The gateway was reading a response header called
-- `x-character-count`. ElevenLabs has never sent one. It sends `character-cost`,
-- and that header is denominated in ElevenLabs CREDITS, not characters — a flash
-- model bills 0.5 credit per character, so "Test." (five characters) reports
-- `character-cost: 2`. Because the old code fell back to counting the request
-- text whenever the header was absent, and the header was ALWAYS absent, every
-- call this route ever served was billed from our own guess while looking
-- authoritative. Proved against the live API on 2026-08-27.
--
-- THE DOUBLE-DISCOUNT THIS AVOIDS. Reading `character-cost` into the old rates
-- would have halved the bill on flash twice over. The rates below were
-- per-character with flash's 0.5x already baked in ($0.05/1k vs $0.10/1k for the
-- standard models); the header applies that same 0.5x again. On a per-CREDIT
-- basis the discount lives in exactly one place — the credit count the provider
-- reports — so every ElevenLabs model now carries the SAME rate. Two identical
-- numbers in this table are the correct answer here, not a copy-paste slip.
--
--   $0.10 per 1,000 credits = 0.000100000000 per credit
--
-- Derived from the standard models, where one character is one credit and the
-- published price is $0.10 per 1,000 characters. Flash's own $0.05/1k is the
-- same rate seen through its 0.5 credit/character metering, which is the point.
--
-- Effect on a real bill, worked through so the direction is on the record:
--   flash, 200-character line   old: 200 x $0.00005 = $0.010
--                               new: ~100 credits x $0.0001 = $0.010   (unchanged)
--   multilingual, 200-char line old: 200 x $0.0001  = $0.020
--                               new: 200 credits x $0.0001 = $0.020    (unchanged)
-- So this is a change of BASIS, not of price — it stops being right by accident
-- and starts being right because the provider said so. What does change is that
-- normalisation and SSML expansion are now counted, because they are in the
-- provider's number and were never in ours.
-- ============================================================================

-- 'credit' joins the unit vocabulary. The label is load-bearing: a row that says
-- 'character' while holding a per-credit rate is the exact confusion that caused
-- the bug, and the next person to read this table deserves better.
alter table provider_model_prices
  drop constraint provider_model_prices_unit_check;

alter table provider_model_prices
  add constraint provider_model_prices_unit_check
  check (unit in ('token', 'character', 'credit'));

update provider_model_prices
   set unit = 'credit',
       input_usd_per_unit = 0.000100000000,
       source_note =
         'ElevenLabs pricing, read 2026-08-27: $0.10 per 1,000 credits. ' ||
         'PER CREDIT, not per character — the gateway bills from the ' ||
         'character-cost response header, which ElevenLabs denominates in its ' ||
         'own credits (flash = 0.5 credit/character, so its cheaper rate is ' ||
         'already inside the count). Every ElevenLabs model shares this rate on ' ||
         'purpose; giving flash a lower one here would discount it twice.',
       updated_at = now()
 where provider = 'elevenlabs';

-- A model priced per credit must never be read as if it were per character.
-- There is no column for that rule, so it is asserted once, here, at the moment
-- the basis changes.
do $$
declare
  wrong integer;
begin
  select count(*) into wrong
    from provider_model_prices
   where provider = 'elevenlabs'
     and (unit <> 'credit' or input_usd_per_unit <> 0.000100000000);
  if wrong > 0 then
    raise exception 'elevenlabs rows did not re-base cleanly: % row(s) wrong', wrong;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Rollback, if this ever has to go back:
--   update provider_model_prices set unit='character',
--          input_usd_per_unit = case model when 'eleven_flash_v2_5'
--            then 0.000050000000 else 0.000100000000 end
--    where provider='elevenlabs';
--   -- and revert usage.ts to a per-character reading, which was never correct.
-- ---------------------------------------------------------------------------
