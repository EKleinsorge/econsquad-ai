-- supabase/migrations/20260908_unit_economics.sql
--
-- ═══════════════════════════════════════════════════════════════════════
--  WHAT A CUSTOMER COSTS, AND WHETHER THEY ARE WORTH IT
-- ═══════════════════════════════════════════════════════════════════════
--
-- Eric: "I want to see what the cost per acquisition is and make sure there is
-- a return. I want to compare that to paid advertising also."
--
-- Two things were missing, and NEITHER CAN BE BACKFILLED. That is what makes
-- them urgent ahead of the screen that reads them.
--
-- 1. NOTHING RECORDED WHERE A CUSTOMER CAME FROM. The only attribution in the
--    product was affiliate referrals. Somebody arriving from a Google ad, from
--    one of Emma's emails, from LinkedIn, or by typing the address, all looked
--    identical in profiles. Cost per acquisition by channel was not a hard sum
--    to do - the input simply did not exist.
--
-- 2. NOTHING RECORDED WHAT A MISSION COST. specialist-chat calls gpt-4o with a
--    2,000 token cap, aria-analysis and gmail-calendar call Claude. All three
--    APIs return the exact token counts in the response body, and all three
--    threw them away. The only visibility was a monthly total on two vendor
--    dashboards - no per customer, no per specialist, no margin.
--
-- FIRST TOUCH, NOT LAST. Attribution is captured on the first page somebody
-- ever lands on and held until they sign up, which may be weeks later. Last
-- touch would credit the signup to whatever they happened to click most
-- recently - usually a direct visit or a branded search - and would make every
-- channel that actually introduced them look worthless.

BEGIN;

-- ── Where each person came from ──────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS acq_channel   text,      -- 'outreach','google-ads','linkedin','organic','direct','affiliate','referral'
  ADD COLUMN IF NOT EXISTS acq_source    text,      -- utm_source
  ADD COLUMN IF NOT EXISTS acq_medium    text,      -- utm_medium
  ADD COLUMN IF NOT EXISTS acq_campaign  text,      -- utm_campaign
  ADD COLUMN IF NOT EXISTS acq_content   text,      -- utm_content
  ADD COLUMN IF NOT EXISTS acq_term      text,      -- utm_term
  ADD COLUMN IF NOT EXISTS acq_referrer  text,      -- the referring URL, when there was one
  ADD COLUMN IF NOT EXISTS acq_landing   text,      -- the first page they saw
  ADD COLUMN IF NOT EXISTS acq_first_at  timestamptz;  -- when they first arrived, not when they signed up

CREATE INDEX IF NOT EXISTS profiles_acq_channel_idx ON public.profiles (acq_channel);

COMMENT ON COLUMN public.profiles.acq_channel IS
  'First-touch channel. Set once at signup from what was captured on the first visit, and never overwritten - a customer has exactly one origin.';

-- ── What every model call cost ───────────────────────────────────────
-- One row per call. Written by the edge functions from the usage block the
-- provider already returns, so this is recording a fact rather than estimating.
CREATE TABLE IF NOT EXISTS public.model_usage (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       uuid,                    -- null for internal work (Emma's research)
  user_email    text,
  feature       text NOT NULL,           -- 'specialist-chat','aria-analysis','gmail-calendar','emma-research'
  specialist_id integer,
  provider      text NOT NULL CHECK (provider IN ('openai','anthropic')),
  model         text NOT NULL,
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  -- Cost is computed at write time from the rate card below rather than at read
  -- time, because prices change and a mission run last March cost what it cost.
  cost_usd      numeric(12,6) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_usage_user_idx    ON public.model_usage (user_id);
CREATE INDEX IF NOT EXISTS model_usage_created_idx ON public.model_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS model_usage_feature_idx ON public.model_usage (feature);

-- ── The rate card ────────────────────────────────────────────────────
-- Editable, because provider pricing changes and nobody should have to redeploy
-- an edge function to correct a number. Prices are USD per MILLION tokens.
-- VERIFY THESE AGAINST THE PROVIDERS' CURRENT PRICING PAGES BEFORE TRUSTING
-- ANY MARGIN NUMBER - they are seeded from published rates but they move.
CREATE TABLE IF NOT EXISTS public.model_rates (
  model            text PRIMARY KEY,
  provider         text NOT NULL,
  input_per_mtok   numeric(10,4) NOT NULL,
  output_per_mtok  numeric(10,4) NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  note             text
);

INSERT INTO public.model_rates (model, provider, input_per_mtok, output_per_mtok, note) VALUES
  ('gpt-4o',                    'openai',    2.50, 10.00, 'CHECK against openai.com/pricing'),
  ('claude-sonnet-4-6',         'anthropic', 3.00, 15.00, 'CHECK against anthropic.com/pricing'),
  ('claude-haiku-4-5-20251001', 'anthropic', 1.00,  5.00, 'CHECK against anthropic.com/pricing')
ON CONFLICT (model) DO NOTHING;

-- ── Money spent outside the product ──────────────────────────────────
-- Google Ads, LinkedIn, sponsorships, a conference booth. Entered by hand:
-- pulling spend automatically needs an OAuth integration per platform, and the
-- number is one figure a month that Eric already sees on an invoice.
CREATE TABLE IF NOT EXISTS public.channel_spend (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel      text NOT NULL,            -- must match profiles.acq_channel to be comparable
  period_start date NOT NULL,
  period_end   date NOT NULL,
  amount_usd   numeric(12,2) NOT NULL CHECK (amount_usd >= 0),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS channel_spend_channel_idx ON public.channel_spend (channel, period_start);

-- ── What each channel actually produced ──────────────────────────────
-- Signups, paying customers, revenue to date, and the model cost those people
-- have run up. Spend is joined separately because it is periodic rather than
-- per person.
CREATE OR REPLACE VIEW public.channel_performance AS
WITH people AS (
  SELECT coalesce(p.acq_channel,'unattributed') AS channel,
         p.id, p.email, p.plan, p.plan_tier, p.plan_interval,
         p.subscription_status, p.created_at, p.canceled_at
    FROM public.profiles p
),
cost AS (
  SELECT user_id, sum(cost_usd) AS model_cost
    FROM public.model_usage GROUP BY user_id
)
SELECT
  pe.channel,
  count(*)                                                          AS signups,
  count(*) FILTER (WHERE pe.subscription_status = 'active')         AS paying_now,
  count(*) FILTER (WHERE pe.canceled_at IS NOT NULL)                AS cancelled,
  round(coalesce(sum(c.model_cost),0)::numeric, 2)                  AS model_cost_usd,
  round((coalesce(sum(c.model_cost),0)
         / nullif(count(*),0))::numeric, 4)                         AS model_cost_per_signup
FROM people pe
LEFT JOIN cost c ON c.user_id = pe.id
GROUP BY pe.channel;

-- ── What a single customer costs to serve ────────────────────────────
CREATE OR REPLACE VIEW public.customer_cost AS
SELECT p.id, p.email, p.full_name, coalesce(p.acq_channel,'unattributed') AS channel,
       p.plan, p.plan_tier, p.subscription_status, p.created_at,
       count(m.id)                                   AS model_calls,
       coalesce(sum(m.input_tokens),0)               AS input_tokens,
       coalesce(sum(m.output_tokens),0)              AS output_tokens,
       round(coalesce(sum(m.cost_usd),0)::numeric,4) AS model_cost_usd,
       (SELECT count(*) FROM public.task_history t WHERE t.user_id = p.id) AS missions
  FROM public.profiles p
  LEFT JOIN public.model_usage m ON m.user_id = p.id
 GROUP BY p.id, p.email, p.full_name, p.acq_channel, p.plan, p.plan_tier,
          p.subscription_status, p.created_at;

ALTER TABLE public.model_usage   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_rates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_spend ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['model_usage','model_rates','channel_spend'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_admin ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_admin ON public.%I FOR ALL '
                   'USING (public.is_current_user_admin()) '
                   'WITH CHECK (public.is_current_user_admin())', t, t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

COMMIT;
