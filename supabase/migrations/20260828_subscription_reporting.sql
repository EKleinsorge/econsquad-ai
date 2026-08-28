-- ============================================================
-- Subscription reporting columns
--
-- The webhook already receives all of this on every event and
-- discards it. Four consequences, all visible in the admin panel
-- on 2026-08-28 with the first live subscription:
--
--   1. A trialing customer's tier is unknowable. `plan` is set to
--      'trial' while trialing (index.html gates the countdown on
--      plan==='trial'), so Starter and Pro trials look identical.
--   2. Monthly and annual are indistinguishable, so any MRR figure
--      counts a $490/yr customer as $49/mo.
--   3. A cancellation sets `plan` back to 'trial', making a churned
--      customer identical to someone who never subscribed. There is
--      no cancellation history to count at all.
--   4. past_due is invisible — a failed payment looks like nothing.
--
-- These columns are ADDITIVE. `plan` keeps its exact current
-- meaning and updatePlan() keeps owning it, so no call site in
-- index.html changes. Nothing in the user-facing app reads these;
-- they exist for admin reporting.
--
-- Timing note: these only record from the moment they exist. A
-- cancellation that was never written down cannot be backfilled.
-- Run this BEFORE the first real subscriber, not after.
--
-- Run in the Supabase SQL Editor. Wrapped in a transaction.
-- ============================================================

BEGIN;

-- ── 1. The columns ───────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status text,
  ADD COLUMN IF NOT EXISTS plan_tier           text,
  ADD COLUMN IF NOT EXISTS plan_interval       text,
  ADD COLUMN IF NOT EXISTS canceled_at         timestamptz;

COMMENT ON COLUMN public.profiles.subscription_status IS
  'Stripe subscription.status verbatim: trialing | active | past_due | canceled | incomplete | unpaid. NULL = never subscribed. Deliberately untyped text — Stripe adds statuses.';
COMMENT ON COLUMN public.profiles.plan_tier IS
  'The tier actually chosen (starter | pro), kept even while trialing. Distinct from profiles.plan, which reads ''trial'' during a trial because the UI gates the countdown on it.';
COMMENT ON COLUMN public.profiles.plan_interval IS
  'month | year. Without this, annual and monthly subscribers are indistinguishable and every MRR figure is wrong.';
COMMENT ON COLUMN public.profiles.canceled_at IS
  'When the subscription ended. Only the most recent cancellation — a cancel/resubscribe/cancel cycle loses the first. Sufficient for counts; promote to an events table if cohort churn is ever needed.';

-- ── 2. Indexes for the queries the admin page will run ───────
CREATE INDEX IF NOT EXISTS idx_profiles_sub_status
  ON public.profiles(subscription_status);

-- Partial: the vast majority of rows are NULL here.
CREATE INDEX IF NOT EXISTS idx_profiles_canceled_at
  ON public.profiles(canceled_at DESC)
  WHERE canceled_at IS NOT NULL;

-- ── 3. Freeze them like the other privileged columns ─────────
-- RLS gates rows, not columns, and "Users can update own profile" is a
-- plain UPDATE ... USING (auth.uid() = id). Without this a user could set
-- their own subscription_status to 'active'. That grants nothing today —
-- there is no paywall — but it would quietly corrupt every admin number.
-- Same trigger installed 2026-08-24, extended with the four new columns.
CREATE OR REPLACE FUNCTION public.protect_privileged_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;                      -- service role / edge functions
  END IF;
  IF public.is_current_user_admin() THEN
    RETURN NEW;                      -- real admin, e.g. admin.html plan edits
  END IF;

  NEW.is_admin            := OLD.is_admin;
  NEW.plan                := OLD.plan;
  NEW.trial_start         := OLD.trial_start;
  NEW.trial_end           := OLD.trial_end;
  NEW.stripe_customer_id  := OLD.stripe_customer_id;
  NEW.subscription_status := OLD.subscription_status;
  NEW.plan_tier           := OLD.plan_tier;
  NEW.plan_interval       := OLD.plan_interval;
  NEW.canceled_at         := OLD.canceled_at;
  RETURN NEW;
END
$function$;

COMMIT;

-- ============================================================
-- VERIFY
-- ============================================================

-- 1. Columns exist.
SELECT column_name, data_type
FROM   information_schema.columns
WHERE  table_name = 'profiles'
  AND  column_name IN ('subscription_status','plan_tier','plan_interval','canceled_at')
ORDER  BY column_name;

-- 2. The freeze trigger is still attached.
SELECT tgname, tgenabled
FROM   pg_trigger
WHERE  tgrelid = 'public.profiles'::regclass AND NOT tgisinternal;

-- 3. All NULL for now. After redeploying stripe-webhook and resending
--    customer.subscription.created, Eric's row should read
--    trialing / starter / month.
SELECT email, plan, plan_tier, subscription_status, plan_interval,
       trial_end, canceled_at
FROM   public.profiles
WHERE  stripe_customer_id IS NOT NULL;

-- ============================================================
-- The four numbers this makes possible (for the admin page)
-- ============================================================
--
--   SELECT
--     count(*) FILTER (WHERE subscription_status = 'trialing')                    AS in_trial,
--     count(*) FILTER (WHERE subscription_status = 'active' AND plan_tier='starter') AS active_starter,
--     count(*) FILTER (WHERE subscription_status = 'active' AND plan_tier='pro')     AS active_pro,
--     count(*) FILTER (WHERE canceled_at > now() - interval '30 days')            AS canceled_30d
--   FROM public.profiles;
