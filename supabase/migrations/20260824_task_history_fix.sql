-- ============================================================
-- task_history — schema repair
--
-- Root cause, found 2026-08-24:
--   index.html sends `category` on every insert. The column does
--   not exist, so PostgREST rejected the whole row with
--   PGRST204 / 400. Every mission save has been failing silently
--   for every user — no ROI, no badges, no history.
--
--   `user_email` is separately read by admin.html in five places
--   (including .eq('user_email', ...)) and also does not exist,
--   so the admin per-user task view has been broken too.
--
-- This file also records the table's real definition, which has
-- until now existed only in the Supabase dashboard.
-- Run in the Supabase SQL Editor.
-- ============================================================

-- ── 1. Reference: the table as it exists today ───────────────
-- id              uuid        NOT NULL  default gen_random_uuid()
-- user_id         uuid                  default NULL
-- specialist_id   integer               default NULL
-- specialist_name text                  default NULL
-- specialist_color text                 default NULL
-- prompt          text                  default NULL
-- result          text                  default NULL
-- hours_saved     numeric               default 0
-- created_at      timestamptz           default now()

-- ── 2. Add the two missing columns ───────────────────────────
ALTER TABLE task_history ADD COLUMN IF NOT EXISTS category   text;
ALTER TABLE task_history ADD COLUMN IF NOT EXISTS user_email text;

-- ── 3. Indexes for the queries the app actually runs ─────────
-- loadUserStats / loadHistory filter by user_id and sort by created_at
CREATE INDEX IF NOT EXISTS idx_th_user_id    ON task_history(user_id);
CREATE INDEX IF NOT EXISTS idx_th_created_at ON task_history(created_at DESC);
-- admin.html line 1574: .eq('user_email', email)
CREATE INDEX IF NOT EXISTS idx_th_user_email ON task_history(user_email);

-- ── 4. Backfill user_email on existing rows ──────────────────
UPDATE task_history th
SET    user_email = u.email
FROM   auth.users u
WHERE  u.id = th.user_id
  AND  th.user_email IS NULL;

-- ── 5. Backfill category from the specialist id map ──────────
-- Mirrors the `cat` field on the squad array in index.html (22 specialists).
-- Keep in sync if specialists are added.
UPDATE task_history SET category = CASE
  WHEN specialist_id IN (1,2,3,20)  THEN 'grants'
  WHEN specialist_id IN (4,5,21)    THEN 'site'
  WHEN specialist_id IN (6,7)       THEN 'bre'
  WHEN specialist_id IN (8,9,10,22) THEN 'data'
  WHEN specialist_id IN (11,12)     THEN 'incentives'
  WHEN specialist_id IN (13,14,19)  THEN 'marketing'
  WHEN specialist_id IN (15,16)     THEN 'workforce'
  WHEN specialist_id IN (17,18)     THEN 'reporting'
  ELSE NULL
END
WHERE category IS NULL;

-- ── 6. Verify ────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable, column_default
FROM   information_schema.columns
WHERE  table_name = 'task_history'
ORDER  BY ordinal_position;

-- Row counts, and how much history survived
SELECT count(*)                        AS total_rows,
       count(user_email)               AS with_email,
       count(category)                 AS with_category,
       round(sum(hours_saved), 1)      AS total_hours_saved,
       min(created_at)::date           AS oldest,
       max(created_at)::date           AS newest
FROM   task_history;

-- ── 7. RLS status — read only, changes nothing ───────────────
-- PGRST204 is raised before RLS is evaluated, so a policy problem
-- could be hiding behind the schema error. If inserts still fail
-- after this migration with code 42501, this is why.
SELECT relname, relrowsecurity AS rls_enabled
FROM   pg_class WHERE relname = 'task_history';

SELECT policyname, cmd, roles, qual, with_check
FROM   pg_policies WHERE tablename = 'task_history';
