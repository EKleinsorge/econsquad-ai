-- supabase/migrations/20260909_quote_requests.sql
--
-- ═══════════════════════════════════════════════════════════════════════
--  TEAM QUOTE REQUESTS — the Team card's button now leads somewhere
-- ═══════════════════════════════════════════════════════════════════════
--
-- WHAT WAS THERE BEFORE
--
-- The Team card's "Request a quote" button ran contactEnterprise(), which set
-- window.location.href to a mailto: link. On a browser with no mail handler
-- registered — Chrome on Windows with webmail, which is most of the buyers this
-- card is aimed at — a mailto: does NOTHING. No error, no tab, no feedback. The
-- button on the $4,950 card was silently dead for a large share of the people
-- most likely to press it, and nothing recorded that they had tried.
--
-- ⚠️ WHAT THIS TABLE DELIBERATELY DOES NOT HOLD
--
-- payment_pref is how somebody would LIKE to pay: 'card', 'invoice', 'check'.
-- It is a word, never a number. No card number, no expiry, no CVC, no routing
-- or account number, no ACH detail is collected by the form, accepted by the
-- edge function, or stored here. Card payment means Eric sends a Stripe link;
-- invoice and check mean an invoice with remittance details going the other
-- way. Nothing that would make this table a payments record ever enters it,
-- which is what keeps a quote request an ordinary business record.
--
-- Nor is there an IP address. The organisation and the email already say who
-- this is; an IP would add nothing except a retention policy.

BEGIN;

CREATE TABLE IF NOT EXISTS public.quote_requests (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Who is asking
  full_name     text NOT NULL,
  organization  text NOT NULL,
  email         text NOT NULL,
  phone         text,
  role_title    text,

  -- What they want. Seats is a request, not a commitment — the card sells 5+1,
  -- but a county asking for 12 is the conversation this button exists to start.
  seats         integer CHECK (seats IS NULL OR (seats > 0 AND seats <= 5000)),

  -- HOW they want to pay, never WITH WHAT. See the warning above.
  payment_pref  text CHECK (payment_pref IN ('card','invoice','check','unsure')),
  -- Public buyers frequently need a quote in hand before a board meeting, and
  -- that date is the single most useful thing for deciding what to send back.
  timeline      text,
  notes         text,

  -- Where this lead came from, carried over from the same first-touch record
  -- that profiles.acq_* uses. A Team lead that arrives with no channel is a
  -- hole in the CAC numbers, and the Team card is where the money is.
  acq_channel   text,
  acq_campaign  text,
  acq_source    text,
  landing       text,
  referrer      text,

  -- Working state, so a request is something Eric can close rather than a row
  -- that sits there looking identical whether or not it was answered.
  status        text NOT NULL DEFAULT 'new'
                CHECK (status IN ('new','contacted','quoted','won','lost','spam')),
  internal_note text,

  -- Whether the notification email actually went out. A quote request that is
  -- saved but never announced is worse than one that fails loudly: Eric would
  -- have no reason to look. The admin list shows this.
  emailed_at    timestamptz,
  email_error   text,

  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quote_requests_created_idx ON public.quote_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS quote_requests_status_idx  ON public.quote_requests (status);
CREATE INDEX IF NOT EXISTS quote_requests_email_idx   ON public.quote_requests (lower(email));

COMMENT ON COLUMN public.quote_requests.payment_pref IS
  'How the buyer would like to pay: card | invoice | check | unsure. A preference only. No card, bank or routing numbers are ever collected or stored.';

CREATE OR REPLACE FUNCTION public.quote_requests_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS quote_requests_touch_trg ON public.quote_requests;
CREATE TRIGGER quote_requests_touch_trg BEFORE UPDATE ON public.quote_requests
  FOR EACH ROW EXECUTE FUNCTION public.quote_requests_touch();

-- ── Access ───────────────────────────────────────────────────────────
-- Admin only, and that is the whole policy. The form does not write here: the
-- request-quote edge function does, with the service role, which bypasses RLS.
-- So no anonymous or ordinary signed-in user needs — or gets — any grant at
-- all. This list contains the name, employer, email and phone number of every
-- prospect who has ever asked for a quote, and there is no reason for it to be
-- reachable from a browser session that is not Eric's.
ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_requests_admin ON public.quote_requests;
CREATE POLICY quote_requests_admin ON public.quote_requests FOR ALL
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

REVOKE ALL ON public.quote_requests FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_requests TO authenticated;

COMMIT;
