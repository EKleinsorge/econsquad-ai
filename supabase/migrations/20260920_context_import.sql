-- ===================================================================
--  BRING YOUR ChatGPT SETUP - the record of it happening
-- ===================================================================
--
-- Customers say they have built intel into their own ChatGPT. This is
-- the table behind the import that turns that into the file cabinet
-- every specialist already reads.
--
-- !! IT STORES COUNTS. IT STORES NO IMPORTED CONTENT. NOT ONE CHARACTER.
--
-- The whole argument for EconSquad over consumer ChatGPT is that a
-- prospect's name is not lying about in somebody else's database. An
-- import table holding pasted chat history would make that untrue on
-- the exact feature that makes the argument. What a person imports goes
-- to the model, comes back as a proposal, and is either written into
-- their own profile because they ticked it or dropped on the floor.
-- Nothing lands here but numbers.
--
-- !! AND THE ZIP IS NEVER UPLOADED AT ALL. A ChatGPT export is somebody's
-- entire history with the product - their health, their money, their
-- family. It is opened in their browser by chatgpt-import.js, filtered
-- down to a few thousand characters, and they are shown that digest
-- before anything is sent.
--
-- WHY THE TABLE EXISTS AT ALL. Seven of the nine trials expiring on
-- 15 September had run zero missions. This import is the answer to that,
-- so the question "did it work" has to be answerable: how many people
-- tried it, how many fields came back, how many they kept. Without the
-- counts it is a feature nobody can tell you anything about.
--
-- Safe to re-run.

-- !! THE TABLE IS CREATED OUTSIDE THE TRANSACTION, ON PURPOSE.
-- Everything below it - the constraints, the policies, the grants - is
-- inside BEGIN/COMMIT so a failure leaves no half-configured table. But
-- the report at the bottom has to name public.esq_context_imports, and a
-- static reference to a relation that does not exist is a PARSE error,
-- not a row. So if the whole thing were in one transaction and it rolled
-- back, the report written to say "!! NOT CREATED" would itself fail to
-- run and print nothing at all - a report that cannot report the failure
-- it exists to report. Creating the table first, idempotently, means the
-- report always runs and can tell you what went wrong.

CREATE TABLE IF NOT EXISTS public.esq_context_imports (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source          text NOT NULL DEFAULT 'paste',
  -- how much text left the browser, so "we only send a digest" is a
  -- measurable claim rather than a promise
  chars_sent      integer,
  fields_proposed integer,
  fields_rejected integer,
  -- written by the browser after the person ticks and saves. NULL means
  -- they never got that far, which is a different thing from zero and
  -- has to stay distinguishable.
  fields_accepted integer,
  target          text,
  ok              boolean,
  created_at      timestamptz NOT NULL DEFAULT now()
);

BEGIN;

ALTER TABLE public.esq_context_imports
  DROP CONSTRAINT IF EXISTS esq_context_imports_source_check;
ALTER TABLE public.esq_context_imports
  ADD CONSTRAINT esq_context_imports_source_check
  CHECK (source IN ('paste', 'chatgpt_zip'));

ALTER TABLE public.esq_context_imports
  DROP CONSTRAINT IF EXISTS esq_context_imports_target_check;
ALTER TABLE public.esq_context_imports
  ADD CONSTRAINT esq_context_imports_target_check
  CHECK (target IS NULL OR target IN ('org', 'personal'));

COMMENT ON TABLE public.esq_context_imports IS
  'One row per ChatGPT import. COUNTS ONLY - no imported content is stored here, deliberately. See the header of 20260920_context_import.sql.';
COMMENT ON COLUMN public.esq_context_imports.fields_accepted IS
  'NULL means the person never reached the save step. 0 means they saw proposals and kept none. Those are different answers and the difference is the whole measurement.';

CREATE INDEX IF NOT EXISTS esq_context_imports_user_idx
  ON public.esq_context_imports (user_id, created_at DESC);

ALTER TABLE public.esq_context_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS esq_context_imports_own   ON public.esq_context_imports;
DROP POLICY IF EXISTS esq_context_imports_admin ON public.esq_context_imports;

-- Their own rows. The browser updates fields_accepted after they save,
-- so this is FOR ALL rather than SELECT.
CREATE POLICY esq_context_imports_own ON public.esq_context_imports
  FOR ALL TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY esq_context_imports_admin ON public.esq_context_imports
  FOR ALL
  USING      (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

REVOKE ALL ON public.esq_context_imports FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.esq_context_imports TO authenticated;

COMMIT;

-- ===================================================================
--  The report
-- ===================================================================
-- !! SECTION B IS THE ONE TO READ. The importer writes into columns on
-- two existing tables. If any of them is not there, the save reports
-- success and writes nothing - PostgREST returns errors rather than
-- throwing them, and a zero-row update is a SUCCESS as far as the
-- browser is concerned. So the columns are checked here against the
-- live schema rather than assumed from the migration that created them.

WITH want AS (
  SELECT * FROM (VALUES
    ('esq_org_profiles',   'legal_name'),
    ('esq_org_profiles',   'short_name'),
    ('esq_org_profiles',   'entity_type'),
    ('esq_org_profiles',   'address'),
    ('esq_org_profiles',   'phone'),
    ('esq_org_profiles',   'general_email'),
    ('esq_org_profiles',   'website'),
    ('esq_org_profiles',   'governing_body'),
    ('esq_org_profiles',   'municipalities'),
    ('esq_org_profiles',   'region_label'),
    ('esq_org_profiles',   'access_notes'),
    ('esq_org_profiles',   'top_employers'),
    ('esq_org_profiles',   'incentive_programs'),
    ('esq_org_profiles',   'mission'),
    ('esq_org_profiles',   'tagline'),
    ('esq_org_profiles',   'boilerplate'),
    ('esq_org_profiles',   'self_reference'),
    ('esq_org_profiles',   'style_notes'),
    ('esq_org_profiles',   'footer_notice'),
    ('community_profiles', 'org_name'),
    ('community_profiles', 'org_short_name'),
    ('community_profiles', 'website'),
    ('community_profiles', 'region'),
    ('community_profiles', 'county'),
    ('community_profiles', 'state'),
    ('community_profiles', 'key_industries'),
    ('community_profiles', 'target_sectors'),
    ('community_profiles', 'boilerplate'),
    ('community_profiles', 'contact_name'),
    ('community_profiles', 'contact_title'),
    ('community_profiles', 'contact_phone'),
    ('community_profiles', 'contact_email'),
    ('community_profiles', 'notes')
  ) AS t(tbl, col)
),
got AS (
  SELECT w.tbl, w.col,
         EXISTS (SELECT 1 FROM information_schema.columns c
                  WHERE c.table_schema = 'public'
                    AND c.table_name = w.tbl
                    AND c.column_name = w.col) AS present
    FROM want w
)

SELECT section, item, detail, finding FROM (

  -- == A. THE NEW TABLE ===========================================
  SELECT 'A. THE TABLE'::text, 'esq_context_imports'::text,
         (SELECT count(*)::text FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'esq_context_imports')
         || ' columns'::text,
         CASE WHEN to_regclass('public.esq_context_imports') IS NULL
              THEN '!! NOT CREATED - read the error above'
              ELSE 'created' END::text,
         1 AS ord, 'a'::text AS ord2

  UNION ALL

  SELECT 'A. THE TABLE'::text, 'row level security'::text,
         (SELECT count(*)::text FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'esq_context_imports')
         || ' policies'::text,
         CASE WHEN (SELECT count(*) FROM pg_policies
                     WHERE schemaname = 'public'
                       AND tablename = 'esq_context_imports') >= 2
              THEN 'own + admin, as intended'
              ELSE '!! fewer policies than expected' END::text,
         1, 'b'::text

  UNION ALL

  SELECT 'A. THE TABLE'::text, 'what it stores'::text,
         'counts only - no imported text'::text,
         CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'esq_context_imports'
                              AND data_type IN ('text', 'character varying')
                              AND column_name NOT IN ('source', 'target'))
              THEN '!! A TEXT COLUMN APPEARED THAT IS NOT source OR target - if somebody has added one to hold imported content, that breaks the promise in this file'
              ELSE 'correct - the only text columns are source and target' END::text,
         1, 'c'::text

  UNION ALL

  -- == B. THE COLUMNS THE IMPORTER WRITES INTO ====================
  SELECT 'B. TARGET COLUMNS'::text, (g.tbl || '.' || g.col)::text,
         'MISSING'::text,
         '!! the importer would silently write nothing to this field'::text,
         2, (g.tbl || '.' || g.col)::text
    FROM got g WHERE NOT g.present

  UNION ALL

  SELECT 'B. TARGET COLUMNS'::text, 'all present'::text,
         ((SELECT count(*) FROM got)::text || ' of '
           || (SELECT count(*) FROM want)::text || ' checked')::text,
         'every field the importer proposes has a column to land in'::text,
         2, '0 all'::text
   WHERE NOT EXISTS (SELECT 1 FROM got WHERE NOT present)

  UNION ALL

  -- == C. WHAT IS NOT A DATABASE CHANGE ===========================
  SELECT 'C. STILL TO DEPLOY'::text, 'import-context'::text,
         'the edge function'::text,
         'npx supabase functions deploy import-context'::text,
         3, 'a'::text

  UNION ALL

  SELECT 'C. STILL TO DEPLOY'::text, 'chatgpt-import.js'::text,
         'the browser-side reader'::text,
         'pushed with index.html - it is what keeps the zip off the wire'::text,
         3, 'b'::text

  UNION ALL

  -- == D. TOTALS ==================================================
  SELECT 'D. TOTALS'::text, 'imports recorded so far'::text,
         (SELECT count(*)::text FROM public.esq_context_imports)::text,
         'expect 0 on a first run'::text,
         4, 'a'::text

  UNION ALL

  SELECT 'D. TOTALS'::text, 'target columns missing'::text,
         (SELECT count(*)::text FROM got WHERE NOT present)::text,
         CASE WHEN (SELECT count(*) FROM got WHERE NOT present) = 0
              THEN 'nothing to fix'
              ELSE '!! fix these before anybody imports' END::text,
         4, 'b'::text

) q (section, item, detail, finding, ord, ord2)
 ORDER BY ord, ord2;
