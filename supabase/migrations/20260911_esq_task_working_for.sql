-- ═══════════════════════════════════════════════════════════════════
-- A mission can be for somewhere other than your own organisation
-- ═══════════════════════════════════════════════════════════════════
--
-- The community profile assumes one user = one community. True for an IDA
-- director. NOT true for a consultancy: GSLI does site location work for many
-- clients, so "which community" is a property of THE JOB, not the account.
--
-- Rex confirmed "Working on this for Whosville USA" and Eric answered "No,
-- this one is for San Antonio". The correction held for that conversation and
-- then evaporated. This column is where it lives instead.
--
-- ⚠️ A COLUMN GRANT DOES NOT COVER COLUMNS THAT DO NOT EXIST YET.
-- 20260911_esq_task_own_update.sql generated its GRANT UPDATE from
-- information_schema at the moment it ran. Adding a column afterwards leaves
-- it ungrantable, so the browser's update would be refused - or worse, on a
-- table where some other grant applies, silently partial. The grant is
-- re-issued below. Any future migration that adds a column to task_history
-- must do the same.
--
-- Safe to re-run.

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.task_history') IS NULL THEN
    RAISE EXCEPTION 'task_history does not exist. Nothing has been changed.';
  END IF;
END
$guard$;

ALTER TABLE public.task_history
  ADD COLUMN IF NOT EXISTS working_for text;

COMMENT ON COLUMN public.task_history.working_for IS
  'The community or client THIS mission is for, when that is not the user''s own organisation. Free text, set by the person. Never used to look up another organisation''s profile - it only tells the specialist which place the work is about.';

-- Keep it short enough to be a name and not a document.
DO $len$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'task_history_working_for_len') THEN
    ALTER TABLE public.task_history
      ADD CONSTRAINT task_history_working_for_len
      CHECK (working_for IS NULL OR length(working_for) <= 160);
  END IF;
END
$len$;


-- ── Re-issue the grant so the new column is included ────────────────
DO $grant$
DECLARE cols text;
BEGIN
  REVOKE UPDATE ON public.task_history FROM authenticated;

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='task_history'
     AND column_name NOT IN ('id','user_id','esq_org_id');

  EXECUTE format('GRANT UPDATE (%s) ON public.task_history TO authenticated', cols);
  RAISE NOTICE 'UPDATE now covers: %', cols;
END
$grant$;

COMMIT;


-- ── The report, as rows ─────────────────────────────────────────────
SELECT 'the column exists'                                     AS what,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name='task_history'
           AND column_name='working_for')                       AS n,
       'wanted: 1'                                              AS meaning
UNION ALL
SELECT 'and the browser may write it',
       (SELECT count(*) FROM information_schema.column_privileges
         WHERE table_schema='public' AND table_name='task_history'
           AND grantee='authenticated' AND privilege_type='UPDATE'
           AND column_name='working_for'),
       'wanted: 1. A grant made before a column exists does not cover it.'
UNION ALL
SELECT '⚠ can they still move it to another org',
       (SELECT count(*) FROM information_schema.column_privileges
         WHERE table_schema='public' AND table_name='task_history'
           AND grantee='authenticated' AND privilege_type='UPDATE'
           AND column_name='esq_org_id'),
       'wanted: 0. Re-issuing the grant must not have re-opened this.'
UNION ALL
SELECT 'missions already marked for somewhere else',
       (SELECT count(*) FROM public.task_history WHERE working_for IS NOT NULL),
       'starts at 0';
