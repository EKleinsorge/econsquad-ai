-- ============================================================
-- Three small things that have been sitting on the list
--
-- None of these is urgent on its own. All three are one statement,
-- reversible, and touch nothing the launch depends on. Grouped so they
-- stop being three separate reminders.
--
-- Run in the Supabase SQL Editor.
-- ============================================================

BEGIN;

-- ── 1. trial_end still defaults to 7 days ────────────────────
-- Stripe owns the trial window for anyone who completes checkout, so this
-- only affects abandoned checkouts: the account is created by doSignup()
-- BEFORE the redirect to Stripe, so closing the tab on the payment page
-- leaves a working account whose trial the column default set. Twelve
-- users arrived that way between 2026-04-26 and 2026-08-11. They were
-- each given 7 days against a product that advertises 14.
ALTER TABLE public.profiles
  ALTER COLUMN trial_end SET DEFAULT (now() + '14 days'::interval);

COMMENT ON COLUMN public.profiles.trial_end IS
  'Trial expiry. For anyone who completes Stripe checkout this is overwritten by the webhook from the subscription''s trial_end — Stripe owns it. The column default only applies to abandoned checkouts, where the account exists but no card was ever entered. Kept at 14 days to match the payment links.';

-- ── 2. admin_users: RLS off, and nothing reads it ────────────
-- Zero references across index.html, app.js, inbox.js, admin.html and
-- every edge function. Admin checks go through profiles.is_admin and
-- is_current_user_admin(). So this is a table with row-level security
-- switched off, sitting in the public schema, reachable by PostgREST,
-- that no code depends on.
--
-- Not dropping it — a table nobody can explain is not a table to delete
-- at speed. Securing it instead: RLS on with no policies means only the
-- service role can read or write, and the privileges are revoked too.
-- If it turns out to hold something, nothing is lost. Check the SELECT in
-- the verify block below, then drop it after launch if it is empty.
ALTER TABLE IF EXISTS public.admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_users FROM anon, authenticated;

COMMENT ON TABLE public.admin_users IS
  'Unreferenced as of 2026-08-29 — no code path reads or writes it; admin status lives on profiles.is_admin. Locked down rather than dropped. Drop it once you have confirmed it is empty.';

-- ── 3. Unsubscribe the two test accounts ─────────────────────
-- Both are yours. Neither should receive a real send, and both were
-- absent from the last dry run, which is easy to mistake for "handled".
-- Making it explicit so a future send cannot pick them up.
UPDATE public.monday_drop_subscribers
SET    unsubscribed_at = coalesce(unsubscribed_at, now())
WHERE  lower(email) IN ('eric+fg@gslisolutions.com', 'info@gslisolutions.com');

COMMIT;

-- ============================================================
-- VERIFY
-- ============================================================

-- 1. The default is now 14 days.
SELECT column_name, column_default
FROM   information_schema.columns
WHERE  table_schema = 'public' AND table_name = 'profiles'
  AND  column_name IN ('trial_start','trial_end');

-- 2. admin_users — RLS on, no policies, and WHAT IS ACTUALLY IN IT.
--    The SQL Editor runs as postgres and bypasses RLS, so this still reads.
--    If it comes back empty, drop the table after launch:
--        DROP TABLE public.admin_users;
SELECT c.relrowsecurity AS rls_enabled, count(p.polname) AS policies
FROM   pg_class c LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE  c.oid = 'public.admin_users'::regclass
GROUP  BY c.relrowsecurity;

SELECT * FROM public.admin_users;

-- 3. Both test accounts are opted out. send-reengagement and
--    send-monday-drop both filter on `unsubscribed_at IS NULL`, so this is
--    the single switch that keeps them out of every send.
SELECT email, unsubscribed_at
FROM   public.monday_drop_subscribers
WHERE  lower(email) LIKE '%gslisolutions.com'
ORDER  BY email;

-- 4. And the list that WOULD receive a send right now, for sanity before
--    you ever fire reengagement.yml with dry_run=false.
SELECT count(*) AS would_receive
FROM   public.monday_drop_subscribers
WHERE  unsubscribed_at IS NULL AND user_id IS NOT NULL;
