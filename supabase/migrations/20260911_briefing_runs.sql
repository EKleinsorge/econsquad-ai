-- supabase/migrations/20260911_briefing_runs.sql
--
-- A RECORD OF WHAT THE BRIEFING FOUND.
--
-- The Daily Checks tick boxes are not stored, on purpose: a saved row
-- saying "these were ticked at 08:12" gets read months later as evidence
-- the checks were performed, and it cannot know that. It only knows a box
-- was clicked.
--
-- The briefing is different. It reads the real rows and reports what was
-- actually there, so storing its result records something that happened in
-- the data rather than something a person asserted. That is worth keeping:
--
--   * "was anybody flagged for a silent charge last Tuesday?" becomes a
--     question with an answer
--   * a fault that appears and disappears leaves a trail
--   * and the run itself is visible, so an unattended week shows up as a
--     gap rather than as silence
--
-- !! could_not_check IS THE MOST IMPORTANT COLUMN HERE. A briefing where a
-- query failed is not a clean briefing, and a stored row that recorded
-- zeros without recording that it could not see would be worse than no
-- record at all - it would be a clean-looking result for a check that
-- never ran. Every failed read lands in this array.
--
-- Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.briefing_runs (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ran_at          timestamptz NOT NULL DEFAULT now(),
  ran_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ran_by_email    text,

  -- What it found. Null means the read failed - see could_not_check - and
  -- is deliberately different from 0, which means it looked and found none.
  emails_sent     integer,
  emails_failed   integer,
  charge_risk     integer,
  new_signups     integer,
  new_activated   integer,
  open_reports    integer,
  lapsed_trials   integer,

  could_not_check text[] NOT NULL DEFAULT '{}',
  -- The detail behind the counts: which addresses, which reasons.
  findings        jsonb  NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.briefing_runs IS
  'One row per press of "Update today''s briefing" in admin. Records what the data said, not that a person checked anything.';
COMMENT ON COLUMN public.briefing_runs.could_not_check IS
  'Queries that failed during this run. A non-empty array means the counts beside it are incomplete and must not be read as an all-clear.';
COMMENT ON COLUMN public.briefing_runs.charge_risk IS
  'People whose trial ends within 3 days, who have a card on file, and who have run no missions. NULL means the check could not run.';

CREATE INDEX IF NOT EXISTS briefing_runs_recent_idx
  ON public.briefing_runs (ran_at DESC);

ALTER TABLE public.briefing_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS briefing_runs_admin ON public.briefing_runs;
CREATE POLICY briefing_runs_admin ON public.briefing_runs
  FOR ALL USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

REVOKE ALL ON public.briefing_runs FROM anon;
GRANT SELECT, INSERT ON public.briefing_runs TO authenticated;

COMMIT;

-- ===================================================================
--  The report. The SQL editor has no messages pane and shows only the
--  last statement, so a migration that returns nothing cannot be told
--  apart from one that failed.
-- ===================================================================
SELECT check_name, result, detail FROM (

  SELECT 'table exists'::text AS check_name,
         CASE WHEN to_regclass('public.briefing_runs') IS NOT NULL
              THEN 'OK' ELSE 'MISSING' END::text AS result,
         'public.briefing_runs'::text AS detail,
         1 AS ord

  UNION ALL

  SELECT 'row level security'::text,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = 'briefing_runs' AND c.relrowsecurity
         ) THEN 'ON' ELSE 'OFF - CHECK THIS' END::text,
         'without it the anon key could read who is at risk of being charged'::text,
         2

  UNION ALL

  SELECT 'admin policy'::text,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'briefing_runs'
              AND policyname = 'briefing_runs_admin'
         ) THEN 'OK' ELSE 'MISSING' END::text,
         'admins only, via is_current_user_admin()'::text,
         3

  UNION ALL

  -- The counts are nullable on purpose. If any came back NOT NULL, a run
  -- whose query failed could not record that it failed, and would store a
  -- zero instead - which is the exact confusion this table exists to avoid.
  SELECT 'counts are nullable'::text,
         CASE WHEN (
           SELECT count(*) FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'briefing_runs'
              AND column_name IN ('emails_sent','emails_failed','charge_risk',
                                  'new_signups','new_activated','open_reports','lapsed_trials')
              AND is_nullable = 'YES'
         ) = 7 THEN 'OK' ELSE 'CHECK THIS' END::text,
         'null means the check could not run; 0 means it ran and found none'::text,
         4

  UNION ALL

  SELECT 'runs recorded so far'::text,
         (SELECT count(*)::text FROM public.briefing_runs),
         'expect 0 until somebody presses the button in admin'::text,
         5

) q (check_name, result, detail, ord)
 ORDER BY ord;
