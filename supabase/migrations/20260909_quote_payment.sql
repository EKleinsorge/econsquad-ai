-- supabase/migrations/20260909_quote_payment.sql
--
-- ═══════════════════════════════════════════════════════════════════════
--  GETTING PAID FOR A QUOTE
-- ═══════════════════════════════════════════════════════════════════════
--
-- Runs after 20260909_quote_requests.sql and 20260909_quote_builder.sql.
--
-- ⚠️ WON AND PAID ARE DIFFERENT EVENTS, AND THE GAP IS THE POINT
--
-- A purchase order arrives, and a cheque clears three weeks later. If both
-- collapse into one status you lose exactly the thing worth knowing: what has
-- been committed versus what is actually in the bank. So `status = 'won'`
-- continues to mean "they accepted", and payment is recorded separately here.
--
-- ⚠️ WHAT IS STILL NOT STORED
--
-- No card number, no bank account, no routing number. paid_method is a word.
-- paid_reference is a cheque number or a purchase order number - the thing
-- written on the stub, not the thing that moves the money. Stripe holds
-- everything else, which is the entire reason to use Stripe.
--
-- EXPIRY IS DERIVED, NOT A STATUS
--
-- quote_valid_until already exists. Making "expired" a status would mean
-- somebody has to remember to set it, and nobody will - so the list would
-- quietly fill with quotes marked live that expired months ago. The view below
-- computes it instead. The same reasoning as quote_total being generated: a
-- fact the database can work out should never be a field a human maintains.

BEGIN;

ALTER TABLE public.quote_requests
  -- When the money actually arrived, not when they said yes.
  ADD COLUMN IF NOT EXISTS paid_at        timestamptz,
  ADD COLUMN IF NOT EXISTS paid_amount    numeric(12,2) CHECK (paid_amount IS NULL OR paid_amount >= 0),
  ADD COLUMN IF NOT EXISTS paid_method    text CHECK (paid_method IN ('card','ach','check','wire','other')),
  -- Cheque number, PO number, or a Stripe payment id. A reference, never an
  -- instrument.
  ADD COLUMN IF NOT EXISTS paid_reference text,
  ADD COLUMN IF NOT EXISTS paid_note      text,

  -- ── Stripe, when they want to pay online ─────────────────────────
  -- Deliberately NOT wired into PRICE_TO_PLAN. That map drives plan and
  -- plan_tier on a PERSON'S profile; a Team purchase belongs to an
  -- organisation and would be filed as one individual's subscription tier,
  -- silently corrupting the Revenue page. The webhook matches these invoices
  -- on metadata instead.
  ADD COLUMN IF NOT EXISTS stripe_invoice_id     text,
  ADD COLUMN IF NOT EXISTS stripe_invoice_url    text,
  ADD COLUMN IF NOT EXISTS stripe_invoice_status text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id    text;

CREATE INDEX IF NOT EXISTS quote_requests_paid_idx    ON public.quote_requests (paid_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS quote_requests_inv_idx
  ON public.quote_requests (stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;

COMMENT ON COLUMN public.quote_requests.paid_reference IS
  'Cheque number, PO number or Stripe payment id. A reference to a payment, never any part of the instrument used to make it.';

-- ── Paying settles the deal ──────────────────────────────────────────
-- Somebody who has paid has plainly won, and leaving that to be remembered is
-- how a list stops being trustworthy. Never drags a deal backwards, and never
-- overrides an explicit 'lost' - a refunded or written-off deal stays lost.
CREATE OR REPLACE FUNCTION public.quote_paid_advances_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.paid_at IS NOT NULL AND OLD.paid_at IS NULL
     AND NEW.status IN ('new','contacted','quoted') THEN
    NEW.status := 'won';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS quote_paid_advances_status_trg ON public.quote_requests;
CREATE TRIGGER quote_paid_advances_status_trg
  BEFORE UPDATE OF paid_at ON public.quote_requests
  FOR EACH ROW EXECUTE FUNCTION public.quote_paid_advances_status();

-- ── What state is each quote really in ───────────────────────────────
-- One place that works out the things a person should never have to maintain
-- by hand: whether a quote has expired, and how much is owed.
CREATE OR REPLACE VIEW public.quote_pipeline AS
SELECT q.*,
       (q.quote_sent_at IS NOT NULL)                       AS quote_is_sent,
       (q.paid_at IS NOT NULL)                             AS is_paid,
       -- Expired only means anything for a quote that was sent, is not paid,
       -- and has not already been settled either way.
       (q.quote_sent_at IS NOT NULL
        AND q.paid_at IS NULL
        AND q.status NOT IN ('won','lost','spam')
        AND q.quote_valid_until IS NOT NULL
        AND q.quote_valid_until < current_date)             AS is_expired,
       CASE
         WHEN q.quote_valid_until IS NULL THEN NULL
         ELSE (q.quote_valid_until - current_date)
       END                                                  AS days_until_expiry,
       CASE
         WHEN q.paid_at IS NOT NULL THEN 0
         ELSE coalesce(q.quote_total, 0) - coalesce(q.paid_amount, 0)
       END                                                  AS outstanding
  FROM public.quote_requests q;

-- A view is not covered by the base table's RLS unless it runs as the invoker.
-- Without this, quote_pipeline would hand every signed-in user the name, employer
-- and phone number of every prospect who has ever asked for a quote.
ALTER VIEW public.quote_pipeline SET (security_invoker = true);

REVOKE ALL ON public.quote_pipeline FROM anon;
GRANT SELECT ON public.quote_pipeline TO authenticated;

COMMIT;
