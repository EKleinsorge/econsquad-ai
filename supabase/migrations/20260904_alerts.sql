-- supabase/migrations/20260904_alerts.sql
--
-- ALERTS: who gets told what, on which channel, the moment it happens.
--
-- WHAT THIS REPLACES
--
-- One row in app_settings called report_recipients: a comma-separated string of
-- email addresses that only ever fired for problem reports. No per-person
-- control, no SMS, no other events. A new member could sign up and nobody knew
-- until someone opened the admin panel.
--
-- HOW IT WORKS
--
--   something happens  ->  a database trigger writes an alert_events row
--                      ->  pg_net POSTs to the dispatch-alerts edge function
--                      ->  that function looks up who subscribed to that event
--                          type on which channel, and sends
--
-- The trigger fires inside the transaction that caused the event, so nothing is
-- ever missed - not a signup from the website, not one created by hand in the
-- dashboard, not one from a future mobile app. That is the reason this lives in
-- the database and not in index.html.
--
-- SAFETY: AN ALERT MUST NEVER BREAK THE THING IT IS REPORTING
--
-- Every trigger body is wrapped in EXCEPTION WHEN OTHERS THEN RETURN NEW. If
-- the alerts system is broken, misconfigured, or the network is down, a member
-- still signs up and a problem report is still saved. The alert is what fails,
-- silently, and it says so in postgres logs. This is not optional: a signup
-- that rolls back because an SMS could not be sent would be a far worse bug
-- than the one this feature exists to fix.
--
-- ON THE KEY USED BY pg_net
--
-- The trigger calls dispatch-alerts with the ANON key, which is already printed
-- in the page source of econsquad.ai, so nothing secret is stored in the
-- database. That is deliberate. The alternative - putting the service role key
-- in Supabase Vault - means pasting a real secret into the SQL editor, and it
-- buys nothing here, because dispatch-alerts takes no instructions from the
-- caller. It drains a queue it reads itself. Someone who calls it repeatedly
-- causes an empty query and nothing else.

BEGIN;

-- pg_net is what lets a trigger reach the dispatcher. It is available on
-- Supabase and usually already enabled. No WITH SCHEMA clause: some projects
-- have it in `net`, others in `extensions`, and enqueue_alert below resolves
-- whichever is present at runtime rather than guessing here.
DO $ext$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN
  -- Not fatal. Alerts still queue; they just wait for the next nudge.
  RAISE WARNING 'alerts: pg_net could not be enabled (%). Alerts will queue but not send until it is.', SQLERRM;
END;
$ext$;

-- ── 1. Where to reach the dispatcher ─────────────────────────
CREATE TABLE IF NOT EXISTS public.alert_config (
  id              boolean PRIMARY KEY DEFAULT true CHECK (id),
  functions_url   text NOT NULL,
  anon_key        text NOT NULL,
  is_paused       boolean NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.alert_config IS
  'Single row. Where the triggers POST. is_paused stops all sending without deleting any settings - use it while testing.';

INSERT INTO public.alert_config (id, functions_url, anon_key)
VALUES (
  true,
  'https://kbwcsmctwtgrjtjcghkt.supabase.co/functions/v1/dispatch-alerts',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtid2NzbWN0d3Rncmp0amNnaGt0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxOTQzNzIsImV4cCI6MjA5Mjc3MDM3Mn0.tOOFb3qwXuYQGVcyt__lg3WLiFxqGZnOPDZA8Zs-XP4'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.alert_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alert_config_admin ON public.alert_config;
CREATE POLICY alert_config_admin ON public.alert_config
  FOR ALL USING (public.is_current_user_admin())
         WITH CHECK (public.is_current_user_admin());
REVOKE ALL ON public.alert_config FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.alert_config TO authenticated;

-- ── 2. The catalogue of things worth knowing about ───────────
CREATE TABLE IF NOT EXISTS public.alert_types (
  key         text PRIMARY KEY,
  label       text NOT NULL,
  description text,
  category    text NOT NULL DEFAULT 'ops',
  is_enabled  boolean NOT NULL DEFAULT true,
  is_urgent   boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 100
);

COMMENT ON COLUMN public.alert_types.is_urgent IS
  'Urgent alerts ignore a recipient quiet-hours window. Reserve it for things worth waking someone for.';

INSERT INTO public.alert_types (key, label, description, category, is_urgent, sort_order) VALUES
  ('user.signup',            'New member signs up',        'Somebody created an account. The single best signal that marketing is working.',                      'growth',  false, 10),
  ('subscription.started',   'New paid subscription',      'A trial converted, or someone bought outright. Money in.',                                           'money',   false, 20),
  ('subscription.cancelled', 'Subscription cancelled',     'Churn. Worth knowing the same day, while a save is still possible.',                                 'money',   true,  30),
  ('payment.failed',         'Payment failed',             'A card was declined and the account is about to lapse through no decision of theirs.',               'money',   true,  40),
  ('problem.reported',       'Problem reported',           'A user hit something broken and took the trouble to tell you.',                                      'support', true,  50),
  ('specialist.requested',   'Custom specialist request',  'Someone asked for a specialist to be built. $299 each, and it tells you what the roster is missing.', 'growth',  false, 60),
  ('affiliate.applied',      'New affiliate application',  'A partner wants to sell for you and is waiting on approval.',                                        'growth',  false, 70),
  ('affiliate.commission',   'Affiliate commission earned','A partner just made a sale. Someone else is selling your product.',                                  'money',   false, 80)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.alert_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alert_types_admin ON public.alert_types;
CREATE POLICY alert_types_admin ON public.alert_types
  FOR ALL USING (public.is_current_user_admin())
         WITH CHECK (public.is_current_user_admin());
REVOKE ALL ON public.alert_types FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_types TO authenticated;

-- ── 3. Who gets told ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alert_recipients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  email           text,
  phone           text,
  is_active       boolean NOT NULL DEFAULT true,
  -- Quiet hours apply to TEXTS ONLY, and only to non-urgent alerts. Email
  -- always goes. A signup at 3am should not wake anybody; a failed payment
  -- can. Null start/end means no quiet hours.
  quiet_start     time,
  quiet_end       time,
  timezone        text NOT NULL DEFAULT 'America/Chicago',
  -- A hard stop on a Twilio bill. Fifty signups in an hour should not become
  -- fifty texts. Email is unaffected.
  sms_daily_cap   integer NOT NULL DEFAULT 20,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alert_recipients_reachable CHECK (
    COALESCE(NULLIF(TRIM(email), ''), NULLIF(TRIM(phone), '')) IS NOT NULL
  )
);

COMMENT ON CONSTRAINT alert_recipients_reachable ON public.alert_recipients IS
  'A recipient with neither an email nor a phone number is a row that silently does nothing. Refuse it at the door.';

ALTER TABLE public.alert_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alert_recipients_admin ON public.alert_recipients;
CREATE POLICY alert_recipients_admin ON public.alert_recipients
  FOR ALL USING (public.is_current_user_admin())
         WITH CHECK (public.is_current_user_admin());
REVOKE ALL ON public.alert_recipients FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_recipients TO authenticated;

-- ── 4. The grid: person x event x channel ────────────────────
CREATE TABLE IF NOT EXISTS public.alert_subscriptions (
  recipient_id uuid NOT NULL REFERENCES public.alert_recipients(id) ON DELETE CASCADE,
  type_key     text NOT NULL REFERENCES public.alert_types(key)      ON DELETE CASCADE,
  send_email   boolean NOT NULL DEFAULT false,
  send_sms     boolean NOT NULL DEFAULT false,
  PRIMARY KEY (recipient_id, type_key)
);

ALTER TABLE public.alert_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alert_subscriptions_admin ON public.alert_subscriptions;
CREATE POLICY alert_subscriptions_admin ON public.alert_subscriptions
  FOR ALL USING (public.is_current_user_admin())
         WITH CHECK (public.is_current_user_admin());
REVOKE ALL ON public.alert_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_subscriptions TO authenticated;

-- ── 5. The queue, which is also the log ──────────────────────
CREATE TABLE IF NOT EXISTS public.alert_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type_key      text NOT NULL,
  title         text NOT NULL,
  body_text     text NOT NULL,
  body_html     text,
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  claimed_at    timestamptz,
  dispatched_at timestamptz,
  result        jsonb
);

CREATE INDEX IF NOT EXISTS alert_events_pending_idx
  ON public.alert_events (created_at)
  WHERE dispatched_at IS NULL;

CREATE INDEX IF NOT EXISTS alert_events_recent_idx
  ON public.alert_events (created_at DESC);

COMMENT ON TABLE public.alert_events IS
  'Every alert ever raised, dispatched or not. This is the answer to "did that text actually go out?" - result holds what Resend and Twilio said.';

ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alert_events_admin ON public.alert_events;
CREATE POLICY alert_events_admin ON public.alert_events
  FOR ALL USING (public.is_current_user_admin())
         WITH CHECK (public.is_current_user_admin());
REVOKE ALL ON public.alert_events FROM anon;
GRANT SELECT ON public.alert_events TO authenticated;

-- ── 6. Per-delivery record ───────────────────────────────────
-- One row per person per channel per event. This is what answers "Cindy says
-- she never got it" without a hunt through the Resend dashboard, and it is
-- what the daily SMS cap counts.
CREATE TABLE IF NOT EXISTS public.alert_deliveries (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id     bigint REFERENCES public.alert_events(id) ON DELETE CASCADE,
  recipient_id uuid   REFERENCES public.alert_recipients(id) ON DELETE SET NULL,
  channel      text NOT NULL CHECK (channel IN ('email','sms')),
  destination  text,
  status       text NOT NULL CHECK (status IN ('sent','failed','skipped')),
  provider_id  text,
  detail       text,
  sent_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alert_deliveries_cap_idx
  ON public.alert_deliveries (recipient_id, channel, sent_at);

ALTER TABLE public.alert_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alert_deliveries_admin ON public.alert_deliveries;
CREATE POLICY alert_deliveries_admin ON public.alert_deliveries
  FOR ALL USING (public.is_current_user_admin())
         WITH CHECK (public.is_current_user_admin());
REVOKE ALL ON public.alert_deliveries FROM anon;
GRANT SELECT ON public.alert_deliveries TO authenticated;

-- ── 7. Raise an alert ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enqueue_alert(
  p_type  text,
  p_title text,
  p_text  text,
  p_html  text  DEFAULT NULL,
  p_meta  jsonb DEFAULT '{}'::jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_id      bigint;
  v_enabled boolean;
  v_cfg     public.alert_config%ROWTYPE;
  v_headers jsonb;
BEGIN
  -- A type switched off in admin never even reaches the queue.
  SELECT is_enabled INTO v_enabled FROM public.alert_types WHERE key = p_type;
  IF v_enabled IS DISTINCT FROM true THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.alert_events (type_key, title, body_text, body_html, meta)
  VALUES (p_type, p_title, p_text, p_html, COALESCE(p_meta, '{}'::jsonb))
  RETURNING id INTO v_id;

  SELECT * INTO v_cfg FROM public.alert_config WHERE id;
  IF NOT FOUND OR v_cfg.is_paused THEN
    RETURN v_id;   -- queued, deliberately not sent
  END IF;

  -- Nudge the dispatcher. Wrapped because pg_net may be unavailable, the
  -- request may fail, or the extension may not be installed on a restored
  -- copy of this database. The row is already safely in the queue either way.
  BEGIN
    v_headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'apikey',        v_cfg.anon_key,
                   'Authorization', 'Bearer ' || v_cfg.anon_key
                 );

    -- Resolved at runtime, not assumed. Supabase projects differ on whether
    -- pg_net landed in `net` or in `extensions`, and hardcoding the wrong one
    -- is a failure that only shows up as alerts that never arrive.
    IF to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NOT NULL THEN
      EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
        USING v_cfg.functions_url, jsonb_build_object('event_id', v_id), v_headers;
    ELSIF to_regprocedure('extensions.http_post(text,jsonb,jsonb,jsonb,integer)') IS NOT NULL THEN
      EXECUTE 'SELECT extensions.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
        USING v_cfg.functions_url, jsonb_build_object('event_id', v_id), v_headers;
    ELSE
      RAISE WARNING 'enqueue_alert: pg_net not found in net or extensions - event % is queued but not sent', v_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'enqueue_alert: could not reach dispatcher for event % (%)', v_id, SQLERRM;
  END;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.enqueue_alert(text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;

-- ── 8. Claim work, exactly once ──────────────────────────────
-- FOR UPDATE SKIP LOCKED so two dispatchers racing (the trigger fires while a
-- retry is already running) cannot both send the same alert. A claim older
-- than five minutes is treated as abandoned and becomes available again.
CREATE OR REPLACE FUNCTION public.claim_alert_events(p_limit integer DEFAULT 20)
RETURNS SETOF public.alert_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT e.id
    FROM public.alert_events e
    WHERE e.dispatched_at IS NULL
      AND (e.claimed_at IS NULL OR e.claimed_at < now() - interval '5 minutes')
    ORDER BY e.created_at
    LIMIT GREATEST(1, LEAST(p_limit, 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.alert_events e
     SET claimed_at = now()
    FROM picked
   WHERE e.id = picked.id
  RETURNING e.*;
END;
$fn$;

REVOKE ALL ON FUNCTION public.claim_alert_events(integer) FROM PUBLIC, anon, authenticated;

-- ── 9. How many texts has this person had today ──────────────
CREATE OR REPLACE FUNCTION public.alert_sms_today(p_recipient uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COUNT(*)::integer
  FROM public.alert_deliveries
  WHERE recipient_id = p_recipient
    AND channel = 'sms'
    AND status  = 'sent'
    AND sent_at > now() - interval '24 hours'
$fn$;

REVOKE ALL ON FUNCTION public.alert_sms_today(uuid) FROM PUBLIC, anon, authenticated;

-- ── 10. Keep updated_at honest ───────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_alert_recipient()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$fn$;

DROP TRIGGER IF EXISTS alert_recipients_touch ON public.alert_recipients;
CREATE TRIGGER alert_recipients_touch
  BEFORE UPDATE ON public.alert_recipients
  FOR EACH ROW EXECUTE FUNCTION public.touch_alert_recipient();

-- ── 11. The triggers ─────────────────────────────────────────
--
-- Every one of these reads NEW through to_jsonb() and pulls fields with ->>,
-- which returns NULL for a column that does not exist. That is deliberate:
-- these tables were written at different times by different hands, and a
-- trigger that hard-references a column name would throw the day someone
-- renames one. Here a missing column costs you a blank in an email.
--
-- Every one is also wrapped in EXCEPTION WHEN OTHERS THEN RETURN NEW. An alert
-- must never be able to roll back the signup, sale or bug report that caused
-- it.

CREATE OR REPLACE FUNCTION public.alert_on_profile_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v jsonb; v_name text; v_email text; v_org text;
BEGIN
  v       := to_jsonb(NEW);
  v_email := COALESCE(NULLIF(TRIM(v->>'email'), ''), 'no email on the record');
  v_name  := COALESCE(NULLIF(TRIM(v->>'full_name'), ''), split_part(v_email, '@', 1));
  v_org   := NULLIF(TRIM(COALESCE(v->>'organization', '')), '');

  PERFORM public.enqueue_alert(
    'user.signup',
    'New member: ' || v_name,
    v_name || ' signed up' || COALESCE(' (' || v_org || ')', '') || E'\n' || v_email,
    NULL,
    jsonb_build_object('name', v_name, 'email', v_email, 'organization', v_org,
                       'plan', v->>'plan', 'user_id', v->>'id')
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'alert_on_profile_insert failed, signup unaffected: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.alert_on_profile_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  vn jsonb; vo jsonb;
  s_new text; s_old text;
  v_name text; v_email text; v_type text; v_title text; v_line text;
BEGIN
  vn := to_jsonb(NEW); vo := to_jsonb(OLD);
  s_new := lower(COALESCE(vn->>'subscription_status', ''));
  s_old := lower(COALESCE(vo->>'subscription_status', ''));

  IF s_new = s_old THEN RETURN NEW; END IF;

  v_email := COALESCE(NULLIF(TRIM(vn->>'email'), ''), 'unknown');
  v_name  := COALESCE(NULLIF(TRIM(vn->>'full_name'), ''), split_part(v_email, '@', 1));

  IF s_new = 'active' THEN
    v_type  := 'subscription.started';
    v_title := 'Paid subscription: ' || v_name;
    v_line  := v_name || ' is now on ' || COALESCE(vn->>'plan', 'a paid plan') || '.';
  ELSIF s_new IN ('canceled', 'cancelled') THEN
    v_type  := 'subscription.cancelled';
    v_title := 'Cancelled: ' || v_name;
    v_line  := v_name || ' cancelled. Worth a call today rather than next week.';
  ELSIF s_new = 'past_due' THEN
    v_type  := 'payment.failed';
    v_title := 'Payment failed: ' || v_name;
    v_line  := v_name || ' had a card declined. They have not chosen to leave.';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.enqueue_alert(
    v_type, v_title, v_line || E'\n' || v_email, NULL,
    jsonb_build_object('name', v_name, 'email', v_email,
                       'plan', vn->>'plan', 'from', s_old, 'to', s_new,
                       'user_id', vn->>'id',
                       'stripe_customer_id', vn->>'stripe_customer_id')
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'alert_on_profile_update failed, update unaffected: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.alert_on_problem_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v jsonb; v_name text; v_email text; v_problem text;
BEGIN
  v         := to_jsonb(NEW);
  v_email   := COALESCE(NULLIF(TRIM(v->>'user_email'), ''), 'anonymous');
  v_name    := COALESCE(NULLIF(TRIM(v->>'user_name'), ''), split_part(v_email, '@', 1));
  v_problem := COALESCE(v->>'problem', '(no description)');

  PERFORM public.enqueue_alert(
    'problem.reported',
    'Problem reported by ' || v_name,
    v_name || ' reported: ' || left(v_problem, 300),
    NULL,
    -- The dispatcher builds the full email from this, including the fix prompt.
    jsonb_build_object('report_id', v->>'id', 'name', v_name, 'email', v_email,
                       'problem', v_problem, 'page', v->>'page',
                       'version', v->>'version', 'user_agent', v->>'user_agent',
                       'timestamp', COALESCE(v->>'timestamp', now()::text))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'alert_on_problem_report failed, report still saved: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.alert_on_specialist_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v jsonb; v_what text; v_who text;
BEGIN
  v      := to_jsonb(NEW);
  v_what := COALESCE(NULLIF(TRIM(v->>'description'), ''),
                     NULLIF(TRIM(v->>'specialist_name'), ''),
                     NULLIF(TRIM(v->>'request'), ''), '(no detail given)');
  v_who  := COALESCE(NULLIF(TRIM(v->>'user_email'), ''), v->>'user_id', 'unknown');

  PERFORM public.enqueue_alert(
    'specialist.requested',
    'Custom specialist requested',
    v_who || ' asked for: ' || left(v_what, 300),
    NULL,
    jsonb_build_object('who', v_who, 'what', v_what)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'alert_on_specialist_request failed, request still saved: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.alert_on_affiliate_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v jsonb; v_who text;
BEGIN
  v     := to_jsonb(NEW);
  v_who := COALESCE(NULLIF(TRIM(v->>'name'), ''), NULLIF(TRIM(v->>'email'), ''), 'someone');

  PERFORM public.enqueue_alert(
    'affiliate.applied',
    'Affiliate application: ' || v_who,
    v_who || ' applied to the affiliate programme and is waiting on approval.',
    NULL,
    jsonb_build_object('name', v->>'name', 'email', v->>'email', 'code', v->>'code')
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'alert_on_affiliate_insert failed, application still saved: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.alert_on_affiliate_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v jsonb; v_amount text;
BEGIN
  v := to_jsonb(NEW);
  v_amount := COALESCE(v->>'amount', v->>'commission_amount', v->>'amount_cents');

  PERFORM public.enqueue_alert(
    'affiliate.commission',
    'Affiliate commission earned',
    'A partner earned a commission' || COALESCE(' of ' || v_amount, '') || '.',
    NULL,
    jsonb_build_object('affiliate_id', v->>'affiliate_id', 'amount', v_amount,
                       'invoice', v->>'stripe_invoice_id')
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'alert_on_affiliate_commission failed, commission still recorded: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

-- Attach only to tables that exist. This schema has grown unevenly and a
-- missing table should mean one alert type stays quiet, not a failed migration.
DO $attach$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('profiles',              'alert_profiles_insert',    'AFTER INSERT',  'alert_on_profile_insert'),
      ('profiles',              'alert_profiles_update',    'AFTER UPDATE',  'alert_on_profile_update'),
      ('problem_reports',       'alert_problem_reports',    'AFTER INSERT',  'alert_on_problem_report'),
      ('specialist_requests',   'alert_specialist_request', 'AFTER INSERT',  'alert_on_specialist_request'),
      ('affiliates',            'alert_affiliate_applied',  'AFTER INSERT',  'alert_on_affiliate_insert'),
      ('affiliate_commissions', 'alert_affiliate_commission','AFTER INSERT', 'alert_on_affiliate_commission')
    ) AS v(tbl, trg, timing, fn)
  LOOP
    IF to_regclass('public.' || t.tbl) IS NULL THEN
      RAISE NOTICE 'alerts: skipping %, table does not exist', t.tbl;
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t.trg, t.tbl);
    EXECUTE format('CREATE TRIGGER %I %s ON public.%I FOR EACH ROW EXECUTE FUNCTION public.%I()',
                   t.trg, t.timing, t.tbl, t.fn);
    RAISE NOTICE 'alerts: % attached to %', t.trg, t.tbl;
  END LOOP;
END;
$attach$;

COMMIT;

-- ── What you should see ──────────────────────────────────────
-- Eight alert types, and a NOTICE line for every trigger attached. Any table
-- reported as skipped simply has no alert - nothing is broken.
SELECT key, label, category, is_urgent FROM public.alert_types ORDER BY sort_order;

SELECT c.relname AS table_name, t.tgname AS trigger_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE t.tgname LIKE 'alert_%' AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;
