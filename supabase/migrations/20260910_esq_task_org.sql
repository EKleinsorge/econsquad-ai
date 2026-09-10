-- ═══════════════════════════════════════════════════════════════════
-- Work done on a seat belongs to the organisation — for real this time
-- ═══════════════════════════════════════════════════════════════════
--
-- task_history.esq_org_id has existed since 20260909 and NOTHING HAS EVER
-- WRITTEN TO IT. The Team card promises the knowledge stays put when people
-- move on; until now that promise was a column and a comment.
--
-- ⚠️ THIS CANNOT BE BACKFILLED FROM NOTHING. Every mission run on a seat
-- before this migration is attributed to a person and to nobody else, and no
-- later query can recover which organisation was paying. There is a narrow,
-- provable backfill at the bottom, and it recovers only what is certain.
--
-- ⚠️ THE VALUE IS STAMPED BY THE DATABASE AND THE CLIENT IS NEVER BELIEVED.
-- task_history is written from the browser (saveTaskToHistory in index.html),
-- so anything the browser says about which organisation it belongs to is a
-- claim by a person who might be wrong or lying. A BEFORE INSERT trigger
-- overwrites it from the caller's own live seat. The client can send whatever
-- it likes; nothing it sends survives.
--
-- Safe to re-run.

BEGIN;

-- ── Refuse to run in somebody else's database ───────────────────────
-- public.organizations belongs to the other business sharing this project.
DO $guard$
BEGIN
  IF to_regclass('public.esq_org_members') IS NULL THEN
    RAISE EXCEPTION
      'esq_org_members does not exist. Run 20260909_esq_organizations.sql first. Nothing has been changed.';
  END IF;
  IF to_regclass('public.task_history') IS NULL THEN
    RAISE EXCEPTION
      'task_history does not exist. This is not the EconSquad database. Nothing has been changed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='task_history'
                    AND column_name='esq_org_id') THEN
    RAISE EXCEPTION
      'task_history.esq_org_id is missing. Run 20260909_esq_organizations.sql first. Nothing has been changed.';
  END IF;
END
$guard$;


-- ── ⚠️ WHICH SEAT, WHEN SOMEBODY HOLDS TWO ──────────────────────────
-- Eric holds two right now (GSLI Test Team and the Whoville team), and a
-- consultant working for two EDCs is a real thing, not just a test artefact.
--
-- The browser already had this problem and answered it BY ACCIDENT: esqTeamLoad
-- ran `.limit(1)` WITH NO ORDER BY. Postgres is entitled to return either row
-- and to return a different one next time, so "Your Team", the shared logo and
-- the profile being edited could all silently switch between organisations
-- between page loads. That is fixed in the same release.
--
-- The rule here is the OLDEST LIVE SEAT, tie-broken by org id so it is total:
-- deterministic, stable as seats come and go, and it matches the intuition
-- that your main team is the one you have been on longest. The browser now
-- uses exactly the same ordering, so the app and the database always agree
-- about which organisation a person is working for.
--
-- ⚠️ It is still a guess in the two-seat case. The honest fix is letting
-- somebody choose which team they are working as, and that is not built.
CREATE OR REPLACE FUNCTION public.esq_my_primary_org()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT org_id
    FROM public.esq_org_members
   WHERE user_id = auth.uid()
     AND revoked_at IS NULL
   ORDER BY granted_at ASC, org_id ASC
   LIMIT 1
$$;

COMMENT ON FUNCTION public.esq_my_primary_org() IS
  'The organisation the calling user is working for: their oldest live seat, tie-broken by org id so the answer is total and stable. index.html orders esqTeamLoad the same way; if you change one, change both.';

REVOKE ALL ON FUNCTION public.esq_my_primary_org() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.esq_my_primary_org() TO authenticated;


-- ── The stamp ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.esq_task_stamp_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- ⚠️ A sessionless caller (service role, the SQL editor, a future edge
  -- function writing history on somebody's behalf) has no auth.uid(), so
  -- esq_my_primary_org() would return NULL and wipe a value that caller
  -- deliberately set. Only a real signed-in session gets overwritten.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Unconditional: not "if NEW.esq_org_id IS NULL". The browser does not get
  -- a vote on which organisation it is charging its work to.
  NEW.esq_org_id := public.esq_my_primary_org();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS esq_task_stamp_org_trg ON public.task_history;
CREATE TRIGGER esq_task_stamp_org_trg
  BEFORE INSERT ON public.task_history
  FOR EACH ROW EXECUTE FUNCTION public.esq_task_stamp_org();


-- ── ⚠️ AND IT MUST SURVIVE THE SEAT BEING REVOKED ───────────────────
-- The whole promise is that the work stays with the organisation after the
-- person leaves. If anything ever nulls this column on update, the promise
-- silently unwinds months later with nobody watching. An UPDATE trigger makes
-- that impossible rather than merely unlikely.
CREATE OR REPLACE FUNCTION public.esq_task_keep_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.esq_org_id IS NOT NULL AND NEW.esq_org_id IS DISTINCT FROM OLD.esq_org_id THEN
    -- A site admin re-assigning deliberately is allowed; everybody else is not.
    IF auth.uid() IS NOT NULL AND NOT public.is_current_user_admin() THEN
      RAISE EXCEPTION
        'Work recorded against an organisation cannot be moved or unlinked. That is what keeps it with the organisation after somebody leaves.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS esq_task_keep_org_trg ON public.task_history;
CREATE TRIGGER esq_task_keep_org_trg
  BEFORE UPDATE OF esq_org_id ON public.task_history
  FOR EACH ROW EXECUTE FUNCTION public.esq_task_keep_org();


-- ── ⚠️ WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────
-- It does not let a team owner READ their colleagues' work.
--
-- That is the obvious next line to write and it is a much larger decision
-- than the one being made here. A prompt can contain anything a person typed
-- in a hurry, and "your director can read every mission you have ever run"
-- is a surprise, not a feature - especially arriving silently in a migration
-- nobody outside this repo will read.
--
-- The promise on the Team card is that the work SURVIVES somebody leaving,
-- not that it is on display while they are here. That promise is kept the
-- moment the stamp exists: the rows are tied to the organisation, and a site
-- admin can already retrieve them on request.
--
-- If Eric wants owners to see team output, it is one policy:
--   CREATE POLICY esq_org_leads_read_team_work ON public.task_history
--     FOR SELECT TO authenticated
--     USING (esq_org_id IS NOT NULL AND public.esq_org_can(esq_org_id,'seats'));
-- It should ship with the members being told, not before.


-- ── The narrow, provable backfill ───────────────────────────────────
-- ⚠️ ONLY where the answer is certain: the person has exactly ONE live seat,
-- has never held any other seat at all (revoked ones included), and the row
-- was written at or after that seat was granted. Under those conditions there
-- is no other organisation it could belong to.
--
-- Anything ambiguous is LEFT NULL ON PURPOSE. A wrong attribution is worse
-- than a missing one: missing is visibly missing, wrong looks like data.
DO $backfill$
DECLARE n bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='task_history'
                    AND column_name='created_at') THEN
    RAISE NOTICE 'task_history has no created_at, so nothing can be proven. Backfill skipped.';
    RETURN;
  END IF;

  WITH sole AS (
    SELECT m.user_id, min(m.org_id) AS org_id, min(m.granted_at) AS granted_at
      FROM public.esq_org_members m
     GROUP BY m.user_id
    HAVING count(*) = 1                                  -- never held another
       AND count(*) FILTER (WHERE m.revoked_at IS NULL) = 1   -- and still holds it
  )
  UPDATE public.task_history t
     SET esq_org_id = s.org_id
    FROM sole s
   WHERE t.user_id = s.user_id
     AND t.esq_org_id IS NULL
     AND t.created_at >= s.granted_at;

  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Backfilled % task_history row(s) where the organisation was provable.', n;
  RAISE NOTICE 'Anything before this migration with an ambiguous owner stays NULL. It is not recoverable.';
END
$backfill$;

COMMENT ON COLUMN public.task_history.esq_org_id IS
  'The EconSquad organisation whose seat this work was done on. Stamped by esq_task_stamp_org_trg from the caller''s own oldest live seat - never from anything the client sends - and refused on update, because keeping it after the seat is revoked is the whole point.';

COMMIT;


-- ── ⚠️ THE REPORT, AS ROWS ──────────────────────────────────────────
-- The backfill above also says what it did through RAISE NOTICE, and the
-- Supabase SQL editor has NO MESSAGES PANE to put that in - it just prints
-- "Success. No rows returned", which reads the same whether it stamped four
-- hundred rows or zero. So the migration ends by SELECTING its own result.
--
-- Read this table. It is the only honest account of what just happened.
SELECT 'now tied to an organisation'                  AS what,
       count(*) FILTER (WHERE esq_org_id IS NOT NULL) AS rows,
       'work the organisation keeps if the person leaves' AS meaning
  FROM public.task_history
UNION ALL
SELECT 'still unattributed',
       count(*) FILTER (WHERE esq_org_id IS NULL),
       'individuals, plus seat work done before today - not recoverable'
  FROM public.task_history
UNION ALL
SELECT 'people holding more than one seat',
       (SELECT count(*) FROM (SELECT user_id FROM public.esq_org_members
          WHERE revoked_at IS NULL GROUP BY user_id HAVING count(*) > 1) x),
       'for these the oldest seat is used, and that is a guess'
UNION ALL
SELECT 'the stamp is installed',
       (SELECT count(*) FROM pg_trigger
         WHERE tgrelid = 'public.task_history'::regclass
           AND tgname IN ('esq_task_stamp_org_trg','esq_task_keep_org_trg')
           AND NOT tgisinternal),
       'wanted: 2. Anything less and this migration did not take.';
