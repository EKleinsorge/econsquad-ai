-- supabase/migrations/20260911_trial_sends_body.sql
--
-- KEEP A COPY OF WHAT WAS ACTUALLY SENT.
--
-- trial_sends records that an email went out, to whom, and at what mission
-- count - but not what it said. To answer "what did this person receive?"
-- the only option was to read trial_touchpoints.body, and that is NOT what
-- they got:
--
--   * {{name}}, {{org}}, {{missions}}, {{hours}}, {{days_left}} and
--     {{top_specialist}} all resolve per person at send time
--   * the [[card]] / [[no_card]] branches pick one of two different letters
--     depending on whether they had a card on file THAT DAY
--   * the template is edited afterwards, so today's copy may not be the copy
--     that was sent last week
--
-- So the template gives a plausible answer that can be wrong in exactly the
-- details worth checking - "you have run 5 missions" shown for somebody who
-- had run one. These two columns hold the real thing.
--
-- !! APPLY THIS BEFORE DEPLOYING THE FUNCTION THAT WRITES TO IT. PostgREST
-- rejects an entire row when any key is not a real column, and the write in
-- question is the CLAIM that gates each send - so on an un-migrated database
-- every send would fail. The function guards against that (it retries
-- without the columns and logs loudly), but the guard is a seatbelt, not a
-- reason to skip the migration.
--
-- Safe to re-run. Nothing is backfilled: what was sent before today was not
-- recorded and cannot be reconstructed, and a plausible guess written into a
-- column that claims to be the real text would be worse than a null.

BEGIN;

ALTER TABLE public.trial_sends ADD COLUMN IF NOT EXISTS subject_sent text;
ALTER TABLE public.trial_sends ADD COLUMN IF NOT EXISTS body_sent    text;

COMMENT ON COLUMN public.trial_sends.subject_sent IS
  'The subject line as it was actually sent, after merge fields. NULL for sends made before 2026-09-11, and for superseded rows, which were never rendered.';
COMMENT ON COLUMN public.trial_sends.body_sent IS
  'The plain-text body as it was actually sent, after merge fields and card branching. Not the template - read this, not trial_touchpoints.body.';

COMMIT;

-- ===================================================================
--  The report. The SQL editor shows only the last statement, and it has
--  no messages pane, so a migration that says nothing is a migration you
--  cannot tell apart from one that failed.
-- ===================================================================
SELECT check_name, result, detail FROM (

  SELECT 'subject_sent column'::text AS check_name,
         CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'trial_sends'
              AND column_name = 'subject_sent'
         ) THEN 'OK' ELSE 'MISSING' END::text AS result,
         'added by this migration'::text AS detail,
         1 AS ord

  UNION ALL

  SELECT 'body_sent column'::text,
         CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'trial_sends'
              AND column_name = 'body_sent'
         ) THEN 'OK' ELSE 'MISSING' END::text,
         'added by this migration'::text,
         2

  UNION ALL

  -- Both columns are text and nullable. If either came back NOT NULL the
  -- next insert of a superseded row - which has no body - would fail.
  SELECT 'both are nullable'::text,
         CASE WHEN (
           SELECT count(*) FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'trial_sends'
              AND column_name IN ('subject_sent', 'body_sent')
              AND is_nullable = 'YES'
         ) = 2 THEN 'OK' ELSE 'CHECK THIS' END::text,
         'a superseded row is never rendered and must be allowed to be empty'::text,
         3

  UNION ALL

  SELECT 'existing rows'::text,
         (count(*)::text || ' send(s) already recorded')::text,
         (count(*) FILTER (WHERE body_sent IS NOT NULL)::text
           || ' carry their text - expect 0 until the function is deployed, '
           || 'and expect the older ones to stay empty forever')::text,
         4
    FROM public.trial_sends

) q (check_name, result, detail, ord)
 ORDER BY ord;
