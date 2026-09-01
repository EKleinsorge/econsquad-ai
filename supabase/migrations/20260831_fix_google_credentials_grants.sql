-- ============================================================
-- FIX: "permission denied for table google_credentials"
--
-- Symptom (browser console, econsquad.ai):
--     POST .../rest/v1/google_credentials  403 (Forbidden)
--     [esq] google refresh token not stored: permission denied
--           for table google_credentials
--
-- Diagnosis: "permission denied for TABLE" is a GRANT error, not an RLS
-- error. An RLS refusal reads "new row violates row-level security
-- policy". So the row-level policies are not the problem — the
-- `authenticated` role simply does not hold INSERT/UPDATE on the table.
-- The table itself exists (the google-token edge function reads it fine
-- with the service role and returns no_refresh_token rather than an
-- error), so only the privilege half of the original migration is
-- missing.
--
-- Consequence: every Gmail connection since 2026-08-28 has silently
-- failed to store its refresh token. That is why the office still goes
-- quiet after an hour.
--
-- This script is idempotent and safe to re-run. It does NOT add a SELECT
-- policy or a SELECT grant — the table stays write-only from the browser,
-- which is the whole security design. A user can write their own token
-- and can never read any token back, not even their own.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- ============================================================

BEGIN;

-- Belt: RLS on, with the three write policies. CREATE POLICY is not
-- IF NOT EXISTS in older Postgres, so drop first.
ALTER TABLE public.google_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own row insert" ON public.google_credentials;
CREATE POLICY "own row insert" ON public.google_credentials
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own row update" ON public.google_credentials;
CREATE POLICY "own row update" ON public.google_credentials
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own row delete" ON public.google_credentials;
CREATE POLICY "own row delete" ON public.google_credentials
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Braces: the privileges. THIS is the part that was missing.
-- The client does an upsert -> INSERT ... ON CONFLICT DO UPDATE,
-- so it needs both INSERT and UPDATE. DELETE is for Disconnect Gmail.
GRANT INSERT, UPDATE, DELETE ON public.google_credentials TO authenticated;

-- Deliberately still no SELECT for anyone but the service role.
REVOKE ALL    ON public.google_credentials FROM anon;
REVOKE SELECT ON public.google_credentials FROM authenticated;

COMMIT;

-- PostgREST caches the schema and its privileges. Nudge it so the fix
-- takes effect immediately instead of on the next natural reload.
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- VERIFY  (run these after the block above)
-- ============================================================

-- 1. authenticated must now hold INSERT, UPDATE, DELETE — and NOT SELECT.
--    Expect exactly three rows for authenticated, none of them SELECT.
SELECT grantee, privilege_type
FROM   information_schema.role_table_grants
WHERE  table_schema = 'public'
  AND  table_name   = 'google_credentials'
ORDER  BY grantee, privilege_type;

-- 2. RLS on, exactly three policies: INSERT, UPDATE, DELETE.
--    If a SELECT policy ever appears here, someone has exposed the tokens.
SELECT c.relrowsecurity AS rls_enabled,
       p.polname,
       CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                     WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
                     ELSE p.polcmd::text END AS command
FROM   pg_class c
LEFT   JOIN pg_policy p ON p.polrelid = c.oid
WHERE  c.oid = 'public.google_credentials'::regclass;

-- 3. After reconnecting Gmail in the browser, a row should appear here.
--    The SQL Editor runs as postgres and bypasses RLS, so this works even
--    though the browser can never read it. Empty = capture still failing.
SELECT user_id,
       left(refresh_token, 8) || '…' AS token_prefix,
       length(refresh_token)         AS len,
       granted_at,
       updated_at
FROM   public.google_credentials;
