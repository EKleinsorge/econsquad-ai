-- supabase/migrations/20260909_quote_bands_fix.sql
--
-- The bottom band was wrong, and Eric found it by asking what happens when
-- somebody wants six.
--
-- WHAT WAS WRONG
--
-- The band was written as "1-6 users at $825 each". It is not a per-user rate
-- at all - it is a FLAT $4,950 for up to six users, which happens to work out
-- at $825 each when all six are taken. Below that the arithmetic stops being
-- true, and the builder started giving bad advice:
--
--   A quote for 3 people correctly prefills 3 x $990 = $2,970, because three
--   people should simply buy three Pro subscriptions. The band then claimed
--   they were being overcharged and offered to "correct" it to $2,475 -
--   undercutting the published Pro annual price for no reason at all.
--
-- BELOW FIVE PEOPLE THERE IS NO TEAM DEAL
--
-- Three Pro seats cost $2,970. The Team plan costs $4,950. Quoting Team to a
-- three-person office would charge them nearly twice as much for the same
-- thing, so it is not a smaller version of the offer - it is the wrong product.
--
-- So the ladder now starts at five. Below that, bandFor() finds nothing, the
-- builder says nothing, and the quote is priced per Pro seat as it should be.
-- Silence is the correct advice when there is no band to apply.

BEGIN;

-- Only touch the seeded published band, and only if it is still exactly as
-- seeded. If Eric has already changed his own bottom band, leave it alone -
-- this is a correction to my mistake, not a licence to overwrite his pricing.
UPDATE public.quote_price_bands
   SET min_users = 5,
       note = 'The published Team offer: $4,950 flat for up to six users (5 paid at $990 plus a free 6th), which is $825 each when all six are used. Starts at five on purpose - below that the Team plan costs MORE than buying individual Pro seats, so there is no band and the builder stays quiet.'
 WHERE min_users = 1
   AND max_users = 6
   AND price_per_user = 825.00
   AND is_published = true;

COMMIT;
