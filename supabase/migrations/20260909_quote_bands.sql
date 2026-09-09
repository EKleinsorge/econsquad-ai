-- supabase/migrations/20260909_quote_bands.sql
--
-- ═══════════════════════════════════════════════════════════════════════
--  VOLUME PRICING FOR TEAM QUOTES
-- ═══════════════════════════════════════════════════════════════════════
--
-- Above six users the quote builder left the per-seat price blank, so every
-- large deal was priced from scratch. That is fine for a handful and wrong for
-- a pipeline: Eric's buyers are public bodies whose purchases are public
-- records, and two similar counties landing on different numbers is a
-- conversation nobody wants to have.
--
-- A TABLE, NOT A CONSTANT. The same reasoning as model_rates: a price that will
-- change should never require a redeploy, and nobody should have to ask an
-- engineer to alter what they charge.
--
-- ⚠️ THE LOWER BANDS ARE NOT YET JUSTIFIED BY COST
--
-- model_rates is still seeded rather than verified against OpenAI's and
-- Anthropic's published pricing, so what a seat costs to SERVE is currently
-- unknown. The 16+ bands below are therefore a commercial guess, not a margin
-- decision. They are seeded so the mechanism works and marked so nobody
-- mistakes them for arithmetic. Verify the model prices, look at
-- customer_cost, and then set these deliberately.
--
-- HOW A BAND APPLIES
--
-- The rate applies to EVERY user, not marginally: 20 users at $750 is $15,000,
-- not six at one price and fourteen at another. Marginal banding is normal in
-- metered billing and baffling on a one-page quote a board has to approve.
--
-- Bands are keyed on TOTAL named users - the number the customer counts, which
-- is paid seats plus any free ones.
--
-- ⚠️ INTERNAL. NOT PUBLISHED, AND NOT READABLE BY CUSTOMERS.
--
-- This is Eric's calculator for working out a number while he is talking to a
-- buyer. The pricing page says "teams over 5 - custom quote" and nothing more.
--
-- An earlier draft of this migration granted SELECT to every authenticated
-- user, on the reasoning that what a product costs is not a secret. That was
-- wrong here: it would let any signed-in member read the discount ladder and
-- discover that a thirty-seat buyer pays $700 while they pay $825. Admin only,
-- both read and write. The quote builder runs in admin.html as Eric, so
-- nothing legitimate loses access.

BEGIN;

CREATE TABLE IF NOT EXISTS public.quote_price_bands (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  min_users     integer NOT NULL CHECK (min_users >= 1),
  -- null means "and upwards", so the top band never leaves a gap.
  max_users     integer CHECK (max_users IS NULL OR max_users >= min_users),
  price_per_user numeric(10,2) NOT NULL CHECK (price_per_user >= 0),
  -- The published 5+1 offer is a band like any other, but it is the one that
  -- appears on the pricing page, so it is flagged: changing it means changing
  -- the website too.
  is_published  boolean NOT NULL DEFAULT false,
  note          text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS quote_price_bands_min_idx
  ON public.quote_price_bands (min_users);

-- Seeded only if empty, so re-running never overwrites prices Eric has changed.
INSERT INTO public.quote_price_bands (min_users, max_users, price_per_user, is_published, note)
SELECT * FROM (VALUES
  (1,  6,    825.00, true,  'The published Team offer: 5 seats at $990 plus a free 6th = $4,950 for six users, which is $825 each. Changing this means changing the pricing page.'),
  (7,  15,   825.00, false, 'Same rate as the published offer - no extra discount for being slightly larger, and nothing to justify against cost.'),
  (16, 30,   750.00, false, 'UNVERIFIED against cost per seat. model_rates is still seeded rather than checked, so this is a commercial guess.'),
  (31, NULL, 700.00, false, 'UNVERIFIED against cost per seat. Same caveat as the band above.')
) AS v(min_users, max_users, price_per_user, is_published, note)
WHERE NOT EXISTS (SELECT 1 FROM public.quote_price_bands);

COMMENT ON TABLE public.quote_price_bands IS
  'Per-user price by total named users, applied to every user rather than marginally. Edit here rather than in code. The 16+ bands are commercial guesses until model_rates is verified and cost per seat is known.';

-- ── What should N users cost ─────────────────────────────────────────
-- Returns null rather than a fallback when no band matches. A quote that
-- silently falls back to a default price is the failure this whole feature has
-- been avoiding: an unpriced field is a question, a wrong price is a
-- commitment.
CREATE OR REPLACE FUNCTION public.quote_band_price(users integer)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT price_per_user
    FROM public.quote_price_bands
   WHERE users >= min_users
     AND (max_users IS NULL OR users <= max_users)
   ORDER BY min_users DESC
   LIMIT 1
$$;

ALTER TABLE public.quote_price_bands ENABLE ROW LEVEL SECURITY;

-- Admin only, for reading as well as writing. See the warning at the top: an
-- earlier version let any signed-in user read this, which would have exposed
-- the discount ladder to the customers being quoted from it.
DROP POLICY IF EXISTS quote_price_bands_admin ON public.quote_price_bands;
CREATE POLICY quote_price_bands_admin ON public.quote_price_bands FOR ALL
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- Dropped explicitly, so re-running this file removes the permissive policy
-- from any database that already got the first version.
DROP POLICY IF EXISTS quote_price_bands_read ON public.quote_price_bands;

REVOKE ALL ON public.quote_price_bands FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_price_bands TO authenticated;

-- quote_band_price is SECURITY INVOKER by default, so it is gated by the same
-- policy - a non-admin calling it gets null rather than a price.

COMMIT;
