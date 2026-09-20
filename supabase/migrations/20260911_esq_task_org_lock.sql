-- ═══════════════════════════════════════════════════════════════════
-- Close the one hole the last migration's own report found
-- ═══════════════════════════════════════════════════════════════════
--
-- 20260911_esq_task_own_update.sql reported:
--
--   ⚠ can they move it to another org | 1 | wanted: 0
--
-- It excluded esq_org_id from the grant it issued, and that changed nothing,
-- because `authenticated` already holds a TABLE-LEVEL UPDATE on task_history
-- from the original setup. A table-level grant covers every column, present
-- and future, and a narrower column grant alongside it does not take
-- anything away.
--
-- ⚠️ WHY IT MATTERS, AND WHY IT IS NOT URGENT TODAY.
-- esq_task_keep_org_trg refuses to CHANGE an organisation once set - that is
-- the promise that work stays put, and it holds. But it permits NULL to a
-- value, because that is exactly what the stamping trigger does on insert.
-- So an ordinary customer with no seat could set esq_org_id on their own row
-- to any organisation's id. Nobody can read another organisation's work yet,
-- so today the effect is a wrong row in a table only admins read. The day a
-- team library ships it becomes a way to put a document into somebody else's
-- organisation.
--
-- Two fixes, because either alone can be undone by a future migration:
--   1. take the blanket grant away and re-grant by column
--   2. teach the trigger to refuse NULL -> value from a signed-in session
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


-- ── 1. blanket grant out, column grant in ───────────────────────────
-- ⚠️ The revoke has to come FIRST. Granting a narrower set while the broad
-- one stands is what made the last attempt a no-op.
--
-- Conservative on purpose: only id, user_id and esq_org_id are withheld.
-- user_email and created_at stay updatable even though nothing should touch
-- them, because this table is written from several places and quietly
-- removing a privilege something depends on is a worse outcome than a
-- column nobody updates being updatable.
DO $grant$
DECLARE cols text;
BEGIN
  REVOKE UPDATE ON public.task_history FROM authenticated;

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='task_history'
     AND column_name NOT IN ('id','user_id','esq_org_id');

  IF cols IS NULL THEN
    RAISE EXCEPTION 'task_history has no updatable columns. Nothing changed.';
  END IF;

  EXECUTE format('GRANT UPDATE (%s) ON public.task_history TO authenticated', cols);
  RAISE NOTICE 'UPDATE now limited to: %', cols;
END
$grant$;


-- ── 2. and the trigger stops trusting the direction of travel ───────
CREATE OR REPLACE FUNCTION public.esq_task_keep_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.esq_org_id IS DISTINCT FROM OLD.esq_org_id THEN
    -- A site admin re-assigning deliberately is allowed. The service role
    -- (auth.uid() IS NULL) is how provisioning and back-end jobs work.
    IF auth.uid() IS NOT NULL AND NOT public.is_current_user_admin() THEN
      IF OLD.esq_org_id IS NULL THEN
        -- ⚠️ NEW. Previously allowed, because the insert trigger does exactly
        -- this and the check only looked at changes away from a set value.
        -- Attaching finished work to an organisation after the fact is how
        -- somebody would put a document into a team they do not belong to.
        RAISE EXCEPTION
          'Work cannot be attached to an organisation after it was recorded. It is stamped from your own seat when it is saved.'
          USING ERRCODE = 'insufficient_privilege';
      ELSE
        RAISE EXCEPTION
          'Work recorded against an organisation cannot be moved or unlinked. That is what keeps it with the organisation after somebody leaves.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- ⚠️ The trigger was BEFORE UPDATE **OF esq_org_id**, which only fires when
-- that column appears in the SET list. That is fine, but re-create it so the
-- definition and the function are known to match.
DROP TRIGGER IF EXISTS esq_task_keep_org_trg ON public.task_history;
CREATE TRIGGER esq_task_keep_org_trg
  BEFORE UPDATE OF esq_org_id ON public.task_history
  FOR EACH ROW EXECUTE FUNCTION public.esq_task_keep_org();

COMMIT;


-- ── The report, as rows ─────────────────────────────────────────────
SELECT '⚠ can they move it to another org'                    AS what,
       (SELECT count(*) FROM information_schema.column_privileges
         WHERE table_schema='public' AND table_name='task_history'
           AND grantee='authenticated' AND privilege_type='UPDATE'
           AND column_name='esq_org_id')                       AS n,
       'MUST NOW BE 0. It was 1 before this ran.'              AS meaning
UNION ALL
SELECT 'can they change whose row it is',
       (SELECT count(*) FROM information_schema.column_privileges
         WHERE table_schema='public' AND table_name='task_history'
           AND grantee='authenticated' AND privilege_type='UPDATE'
           AND column_name='user_id'),
       'wanted: 0'
UNION ALL
SELECT 'columns they may still update',
       (SELECT count(*) FROM information_schema.column_privileges
         WHERE table_schema='public' AND table_name='task_history'
           AND grantee='authenticated' AND privilege_type='UPDATE'),
       'everything else - saving a refined mission must still work'
UNION ALL
SELECT 'the keep-it-put trigger',
       (SELECT count(*) FROM pg_trigger
         WHERE tgrelid='public.task_history'::regclass
           AND tgname='esq_task_keep_org_trg' AND NOT tgisinternal),
       'wanted: 1. Now refuses attaching work to an org after the fact.';
