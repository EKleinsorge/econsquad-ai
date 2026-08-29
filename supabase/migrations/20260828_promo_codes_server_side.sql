-- ============================================================
-- Promo codes move to the server
--
-- WHY THIS IS URGENT, NOT TIDYING
--
-- index.html contains, in plain text, viewable by anyone:
--
--     var VALID_PROMO_CODES = { 'FOCUSGROUP': { ... } };
--
-- and doSignup() treats a pending promo as a reason to "skip Stripe
-- entirely". So the single working access code is one Ctrl-U away from
-- every visitor, and redeeming it produces a full account with no card
-- and no Stripe customer. At a launch party with 90+ people signing up
-- on their own laptops, that is a revenue hole, not a theoretical one.
--
-- Second problem: the grant itself is a plain client-side UPDATE.
--
--     supa.from('profiles').update({ is_beta_tester: true,
--       beta_expires_at: ..., beta_activated_at: ..., promo_code_used: ... })
--
-- protect_privileged_profile_columns() (installed 2026-08-24, extended
-- 2026-08-28) freezes is_admin, plan, trial_start, trial_end,
-- stripe_customer_id, subscription_status, plan_tier, plan_interval and
-- canceled_at — but NOT the four beta columns. So any signed-in user can
-- paste that statement into the console with beta_expires_at set to 2099
-- and never see the subscribe prompt again. esqAccessLapsed() reads
-- exactly those columns to decide.
--
-- Third problem, quieter but live: FOCUSGROUP's expires_at is
-- 2026-06-30. That is two months in the past. Anyone redeeming it today
-- lands straight in the "beta lapsed" state.
--
-- WHAT CHANGES
--
--   * Codes live in a table, not the bundle. Adding a launch-party code
--     becomes one INSERT instead of a deploy.
--   * Two SECURITY DEFINER functions are the only way in: one to check a
--     code (callable before an account exists), one to redeem it.
--   * The four beta columns join the frozen set. The redeem function
--     lifts the freeze for its own transaction only, via a local GUC the
--     client has no way to set.
--   * FOCUSGROUP is seeded INACTIVE. It is expired and it is public in
--     every cached copy of the old bundle. Issue a fresh string instead.
--
-- Run in the Supabase SQL Editor. Run the index.html deploy alongside it —
-- the new client calls these functions and no longer knows any codes.
-- ============================================================

BEGIN;

-- ── 1. The codes ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.promo_codes (
  code            text PRIMARY KEY,
  label           text NOT NULL,
  expires_at      timestamptz NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  max_redemptions integer,
  redeemed_count  integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.promo_codes IS
  'Access codes. Never exposed through PostgREST — RLS is on with no policies at all, so only the service role and the SECURITY DEFINER functions below can see a row. Codes used to live in index.html in plain text.';
COMMENT ON COLUMN public.promo_codes.expires_at IS
  'When the granted beta access ends, not when the code stops working — that is `active` and `max_redemptions`. Set this in the FUTURE: it is written straight onto profiles.beta_expires_at, and esqAccessLapsed() treats a past value as lapsed access.';
COMMENT ON COLUMN public.promo_codes.max_redemptions IS
  'NULL means unlimited. Set it for anything handed out in a room — a code shared from one laptop to forty is the failure mode.';

-- RLS on, deliberately with NO policies. Nothing reaches this table
-- through the API; the functions below are SECURITY DEFINER.
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.promo_codes FROM anon, authenticated;

-- ── 2. Seed ──────────────────────────────────────────────────
-- Retired: expired 2026-06-30, and it is in plain text in every cached
-- copy of the old index.html. To run a launch-party code, insert a new
-- one with a fresh string and a future expires_at.
INSERT INTO public.promo_codes (code, label, expires_at, active, max_redemptions)
VALUES ('FOCUSGROUP', 'Focus Group Participant', '2026-06-30T23:59:59+00:00', false, NULL)
ON CONFLICT (code) DO NOTHING;

-- ── 3. Check a code (works before an account exists) ─────────
-- Returns only whether it is usable and its label. Never the list, never
-- the expiry, never the counts.
CREATE OR REPLACE FUNCTION public.promo_code_check(p_code text)
RETURNS TABLE (valid boolean, label text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT true, c.label
  FROM   public.promo_codes c
  WHERE  c.code = upper(trim(p_code))
    AND  c.active
    AND  c.expires_at > now()
    AND  (c.max_redemptions IS NULL OR c.redeemed_count < c.max_redemptions)
  UNION ALL
  SELECT false, NULL::text
  WHERE  NOT EXISTS (
    SELECT 1 FROM public.promo_codes c2
    WHERE  c2.code = upper(trim(p_code))
      AND  c2.active
      AND  c2.expires_at > now()
      AND  (c2.max_redemptions IS NULL OR c2.redeemed_count < c2.max_redemptions)
  );
$function$;

GRANT EXECUTE ON FUNCTION public.promo_code_check(text) TO anon, authenticated;

-- ── 4. Redeem it ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.redeem_promo_code(p_code text)
RETURNS TABLE (ok boolean, message text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_code public.promo_codes%ROWTYPE;
  v_already boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 'You need to be signed in to redeem a code.', NULL::timestamptz;
    RETURN;
  END IF;

  -- Lock the row so two people redeeming the last seat cannot both win.
  SELECT * INTO v_code
  FROM   public.promo_codes
  WHERE  code = upper(trim(p_code))
  FOR UPDATE;

  IF NOT FOUND OR NOT v_code.active OR v_code.expires_at <= now() THEN
    RETURN QUERY SELECT false, 'That code is not valid. Check for typos.', NULL::timestamptz;
    RETURN;
  END IF;

  IF v_code.max_redemptions IS NOT NULL
     AND v_code.redeemed_count >= v_code.max_redemptions THEN
    RETURN QUERY SELECT false, 'That code has been fully redeemed.', NULL::timestamptz;
    RETURN;
  END IF;

  SELECT is_beta_tester INTO v_already FROM public.profiles WHERE id = v_uid;
  IF coalesce(v_already, false) THEN
    RETURN QUERY SELECT true, 'Beta access is already active on your account.', NULL::timestamptz;
    RETURN;
  END IF;

  -- Lift the column freeze for this transaction only. set_config's third
  -- argument is is_local: it dies with the transaction, and there is no
  -- way to set it from PostgREST — only from inside a function like this.
  PERFORM set_config('app.promo_redeem', '1', true);

  UPDATE public.profiles
  SET    is_beta_tester    = true,
         beta_expires_at   = v_code.expires_at,
         beta_activated_at = now(),
         promo_code_used   = v_code.code
  WHERE  id = v_uid;

  UPDATE public.promo_codes
  SET    redeemed_count = redeemed_count + 1
  WHERE  code = v_code.code;

  RETURN QUERY SELECT true, 'Beta access activated.', v_code.expires_at;
END
$function$;

GRANT EXECUTE ON FUNCTION public.redeem_promo_code(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_promo_code(text) FROM anon;

-- ── 5. Freeze the beta columns ───────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_privileged_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  in_promo boolean := coalesce(current_setting('app.promo_redeem', true), '') = '1';
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

  -- The four beta columns are frozen too, EXCEPT inside redeem_promo_code().
  IF NOT in_promo THEN
    NEW.is_beta_tester    := OLD.is_beta_tester;
    NEW.beta_expires_at   := OLD.beta_expires_at;
    NEW.beta_activated_at := OLD.beta_activated_at;
    NEW.promo_code_used   := OLD.promo_code_used;
  END IF;

  RETURN NEW;
END
$function$;

COMMIT;

-- ============================================================
-- VERIFY
-- ============================================================

-- 1. The table is unreachable from the API: RLS on, zero policies.
SELECT c.relrowsecurity AS rls_enabled, count(p.polname) AS policy_count
FROM   pg_class c LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE  c.oid = 'public.promo_codes'::regclass
GROUP  BY c.relrowsecurity;

-- 2. Both functions exist and are SECURITY DEFINER.
SELECT proname, prosecdef AS security_definer
FROM   pg_proc
WHERE  proname IN ('promo_code_check','redeem_promo_code','protect_privileged_profile_columns')
ORDER  BY proname;

-- 3. A retired code reads as invalid; a nonsense one does too.
SELECT 'FOCUSGROUP' AS code, * FROM public.promo_code_check('FOCUSGROUP');
SELECT 'NOPE'       AS code, * FROM public.promo_code_check('NOPE');

-- 4. THE ONE THAT MATTERS. In the browser console, signed in as a normal
--    (non-admin) user, run this and then re-read the row:
--
--      await supa.from('profiles').update({ is_beta_tester:true,
--        beta_expires_at:'2099-01-01' }).eq('id', currentUser.id)
--
--    It will report success — PostgREST reports a zero-effect update as
--    success — but the values must be UNCHANGED. That is the trigger
--    doing its job. Before this migration the write stuck.
SELECT id, email, is_beta_tester, beta_expires_at, promo_code_used
FROM   public.profiles
WHERE  is_beta_tester IS TRUE
ORDER  BY beta_activated_at DESC NULLS LAST;

-- ============================================================
-- To run a launch-party code, this is now the whole job:
--
--   INSERT INTO public.promo_codes (code, label, expires_at, max_redemptions)
--   VALUES ('LAUNCH2026', 'Launch Party', '2026-12-31T23:59:59+00:00', 120);
--
-- Pick max_redemptions deliberately. A code read aloud in a room travels
-- further than the room.
-- ============================================================
