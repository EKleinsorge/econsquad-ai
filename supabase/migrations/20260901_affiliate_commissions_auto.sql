-- ============================================================
-- Affiliate commissions, automated
--
-- Until now nothing created a commission. stripe-webhook contained zero
-- references to affiliates, so a partner could refer someone who paid for a
-- year and earn nothing unless an admin remembered to click "+ Commission"
-- every month. The affiliate guide promises "10% of each subscriber's
-- monthly fee, paid every month for as long as they stay", so this closes
-- the gap between the promise and the code.
--
-- This migration does the database half. The webhook half is in
-- supabase/functions/stripe-webhook/index.ts and must be deployed too.
--
-- WHAT IT ADDS
--
--  1. affiliate_commissions.stripe_invoice_id, UNIQUE.
--     Stripe redelivers events. Without a natural key, a redelivered
--     invoice.payment_succeeded would pay the partner twice. The unique
--     index makes the insert idempotent: the second attempt raises 23505
--     and the webhook treats that as "already handled".
--
--  2. affiliates.commission_rate, default 0.10.
--     So the rate lives in data rather than being hardcoded in a deployed
--     function, and a specific partner can be given different terms without
--     a redeploy.
--
--  3. Triggers that maintain affiliates.total_earned, total_referrals and
--     paid_referrals.
--     These columns are what the admin Affiliates page displays, and nothing
--     has ever written to them — they are all still 0. Doing this with
--     triggers rather than in the webhook means the numbers stay correct no
--     matter what creates a row: the webhook, the "+ Commission" button, or
--     a manual edit in the SQL editor.
--
-- Idempotent. Safe to re-run.
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- ============================================================

BEGIN;

-- ── 1. Idempotency key ───────────────────────────────────────
ALTER TABLE public.affiliate_commissions
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text;

COMMENT ON COLUMN public.affiliate_commissions.stripe_invoice_id IS
  'The Stripe invoice this commission was earned on. UNIQUE, so a redelivered webhook event cannot pay a partner twice. NULL for manually added commissions.';

-- Partial: manual commissions have no invoice and must not collide with
-- each other on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_commissions_invoice_uniq
  ON public.affiliate_commissions (stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

-- ── 2. Per-partner rate ──────────────────────────────────────
ALTER TABLE public.affiliates
  ADD COLUMN IF NOT EXISTS commission_rate numeric(5,4) NOT NULL DEFAULT 0.10;

COMMENT ON COLUMN public.affiliates.commission_rate IS
  'Fraction of each payment paid to this partner. 0.10 = the standard 10% in the affiliate guide. Change per partner for custom terms without redeploying the webhook.';

-- ── 3. Keep the roll-up columns honest ───────────────────────
CREATE OR REPLACE FUNCTION public.recalc_affiliate_totals(p_affiliate uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.affiliates a
  SET total_earned = COALESCE((
        SELECT SUM(c.amount) FROM public.affiliate_commissions c
        WHERE c.affiliate_id = a.id AND c.status <> 'cancelled'
      ), 0),
      total_referrals = COALESCE((
        SELECT COUNT(*) FROM public.affiliate_referrals r
        WHERE r.affiliate_id = a.id
      ), 0),
      paid_referrals = COALESCE((
        SELECT COUNT(*) FROM public.affiliate_referrals r
        WHERE r.affiliate_id = a.id AND r.converted_to_paid
      ), 0)
  WHERE a.id = p_affiliate;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalc_affiliate_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_affiliate_totals(OLD.affiliate_id);
    RETURN OLD;
  END IF;
  PERFORM public.recalc_affiliate_totals(NEW.affiliate_id);
  -- An UPDATE that moves a row between partners has to fix both.
  IF TG_OP = 'UPDATE' AND OLD.affiliate_id IS DISTINCT FROM NEW.affiliate_id THEN
    PERFORM public.recalc_affiliate_totals(OLD.affiliate_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aff_commissions_totals ON public.affiliate_commissions;
CREATE TRIGGER trg_aff_commissions_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.affiliate_commissions
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_affiliate_totals();

DROP TRIGGER IF EXISTS trg_aff_referrals_totals ON public.affiliate_referrals;
CREATE TRIGGER trg_aff_referrals_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.affiliate_referrals
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_affiliate_totals();

COMMIT;

-- Backfill whatever already exists, so the page stops showing zeros for
-- rows created before the triggers existed.
SELECT public.recalc_affiliate_totals(id) FROM public.affiliates;

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- VERIFY
-- ============================================================

-- 1. The new columns are there.
SELECT table_name, column_name, data_type, column_default
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  (   (table_name = 'affiliate_commissions' AND column_name = 'stripe_invoice_id')
        OR (table_name = 'affiliates'            AND column_name = 'commission_rate'))
ORDER  BY table_name;

-- 2. The unique index exists — this is what stops double payment.
SELECT indexname FROM pg_indexes
WHERE  schemaname = 'public' AND indexname = 'affiliate_commissions_invoice_uniq';

-- 3. Both triggers are attached.
SELECT event_object_table AS table_name, trigger_name, action_timing, event_manipulation
FROM   information_schema.triggers
WHERE  trigger_name IN ('trg_aff_commissions_totals','trg_aff_referrals_totals')
ORDER  BY table_name, event_manipulation;

-- 4. Current partner state after the backfill.
SELECT code, status, commission_rate, total_referrals, paid_referrals, total_earned
FROM   public.affiliates
ORDER  BY created_at;
