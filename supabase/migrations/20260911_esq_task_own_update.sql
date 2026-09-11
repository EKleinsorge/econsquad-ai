-- ═══════════════════════════════════════════════════════════════════
-- One mission is one row, so a person has to be able to update their own
-- ═══════════════════════════════════════════════════════════════════
--
-- Saving the same conversation three times created THREE history cards with
-- the same question and three versions of the answer. That is not history,
-- it is a changelog nobody asked for - and every duplicate also counted its
-- own hours_saved, so one piece of work reported three times the saving.
--
-- The fix is for the browser to UPDATE the row it already created rather
-- than insert another. Which needs an UPDATE policy: the existing ones cover
-- reading your own rows and a site admin reading everybody's, and nothing
-- grants a person the right to change their own history.
--
-- ⚠️ WITHOUT THIS, THE BROWSER FIX FAILS SILENTLY. PostgREST treats an
-- UPDATE that matches zero rows as a SUCCESS, so the app would report
-- "Saved!" and change nothing, forever.
--
-- Safe to re-run.

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.task_history') IS NULL THEN
    RAISE EXCEPTION
      'task_history does not exist. This is not the EconSquad database. Nothing has been changed.';
  END IF;
END
$guard$;

-- Own rows only, and the row has to still be yours afterwards - WITH CHECK
-- is what stops somebody handing their mission to another user_id.
DROP POLICY IF EXISTS task_history_own_update ON public.task_history;
CREATE POLICY task_history_own_update ON public.task_history
  FOR UPDATE TO authenticated
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ⚠️ A policy is only half of it: grants are checked BEFORE policies, and a
-- table that never expected updates may never have been granted them. Same
-- trap as the organisations table, where a column grant beat the site-admin
-- policy.
--
-- ⚠️ BUILT FROM THE REAL TABLE, not from a list I typed. A hard-coded column
-- list already broke twice this week against columns that exist in the test
-- fixture and not in production, or the other way round.
--
-- Excluded on purpose:
--   id, user_id, user_email, created_at  identity of the row, not its content
--   esq_org_id                           esq_task_keep_org_trg would refuse
--                                        it; not granting means the attempt
--                                        never starts
DO $grant$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='task_history'
     AND column_name NOT IN ('id','user_id','user_email','created_at','esq_org_id');

  IF cols IS NULL THEN
    RAISE EXCEPTION 'task_history has no updatable columns. Nothing changed.';
  END IF;

  EXECUTE format('GRANT UPDATE (%s) ON public.task_history TO authenticated', cols);
  RAISE NOTICE 'Granted UPDATE on: %', cols;
END
$grant$;

COMMIT;


-- ── The report, as rows ─────────────────────────────────────────────
SELECT 'people can update their own missions'                AS what,
       (SELECT count(*) FROM pg_policies
         WHERE schemaname='public' AND tablename='task_history'
           AND policyname='task_history_own_update')          AS n,
       'wanted: 1. Without it the app would say Saved and change nothing.' AS meaning
UNION ALL
SELECT 'columns they may update',
       (SELECT count(*) FROM information_schema.column_privileges
         WHERE table_schema='public' AND table_name='task_history'
           AND grantee='authenticated' AND privilege_type='UPDATE'),
       'every content column. esq_org_id is NOT among them, on purpose.'
UNION ALL
SELECT '⚠ can they move it to another org',
       (SELECT count(*) FROM information_schema.column_privileges
         WHERE table_schema='public' AND table_name='task_history'
           AND grantee='authenticated' AND privilege_type='UPDATE'
           AND column_name='esq_org_id'),
       'wanted: 0. Work stays with the organisation that paid for it.'
UNION ALL
SELECT 'missions saved so far',
       (SELECT count(*) FROM public.task_history),
       'this should stop climbing every time you re-save one conversation';
