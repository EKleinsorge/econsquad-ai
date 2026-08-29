-- ============================================================
-- google_credentials — store the Google refresh token
--
-- WHY THIS EXISTS
--
-- `provider_refresh_token` appears zero times in the entire repo. Google
-- issues a refresh token exactly once, at the consent screen, and both
-- OAuth calls in index.html already ask for one:
--
--     queryParams: { access_type: 'offline', prompt: 'consent' }
--
-- So Google has been handing one over on every Gmail connection since
-- launch, and the app has thrown it away every single time.
--
-- Supabase puts provider_token and provider_refresh_token on the session
-- at the moment of sign-in and does nothing further with them — it does
-- not persist them and does not refresh the Google token. Their own docs:
-- "On initial login, you can extract the provider_token from the session
-- and store it in a secure storage medium."
--
-- Consequences, both reported:
--   1. The digital office drops out roughly an hour after connecting.
--      The Google access token expires and there is nothing to renew it.
--   2. It is never connected after a password sign-in, because no OAuth
--      round-trip happened, so session.provider_token is null.
--
-- Gmail + Calendar is the headline reason to buy Pro.
--
-- WHAT THIS DOES AND DOES NOT DO
--
-- This is the capture half only. index.html now writes the refresh token
-- here on sign-in. NOTHING READS IT YET — the server-side exchange
-- (refresh_token -> access token, in the gmail-calendar edge function)
-- is a post-launch change.
--
-- Capture has to land first regardless. A refresh token is issued once
-- per consent, so every user who connects Gmail while we are still
-- discarding it will have to sit through the Google consent screen again
-- when the exchange ships. Capturing now makes that upgrade invisible.
--
-- SECURITY
--
-- These tokens carry gmail.readonly — the ability to read every message in
-- the user's mailbox — plus gmail.send. This table is deliberately write-only from the client:
-- a user can insert, update and delete their own row and CANNOT read any
-- row back, not even their own. SELECT is revoked from anon and
-- authenticated outright, on top of RLS having no SELECT policy at all.
-- Only the service role (edge functions) can read.
--
-- Run in the Supabase SQL Editor.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.google_credentials (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token text        NOT NULL,
  scopes        text,
  granted_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.google_credentials IS
  'Google OAuth refresh tokens. Write-only from the client: SELECT is revoked and no SELECT policy exists, so only the service role can read a token. Grants gmail.readonly over the user''s entire mailbox — treat as a credential store, never expose through PostgREST.';
COMMENT ON COLUMN public.google_credentials.refresh_token IS
  'Long-lived Google refresh token. Exchanged server-side for an access token. Revoked by Google if unused for 6 months, if the user revokes access, or after a password change on the Google account — the exchange must handle invalid_grant by clearing the row and prompting a reconnect.';
COMMENT ON COLUMN public.google_credentials.scopes IS
  'The scope string in force when this token was granted. If the app ever asks for more scopes, an existing refresh token will NOT carry them — compare against GOOGLE_SCOPES and force a re-consent when they differ.';

-- ── RLS: write-only from the client ─────────────────────────
ALTER TABLE public.google_credentials ENABLE ROW LEVEL SECURITY;

-- Deliberately NO select policy. Do not add one.
DROP POLICY IF EXISTS "own row insert" ON public.google_credentials;
CREATE POLICY "own row insert" ON public.google_credentials
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own row update" ON public.google_credentials;
CREATE POLICY "own row update" ON public.google_credentials
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Disconnecting Gmail should be able to drop the token.
DROP POLICY IF EXISTS "own row delete" ON public.google_credentials;
CREATE POLICY "own row delete" ON public.google_credentials
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Belt and braces: revoke the privilege as well as omitting the policy,
-- so a future "enable read access for users" click cannot quietly expose
-- every stored mail credential.
REVOKE ALL     ON public.google_credentials FROM anon;
REVOKE SELECT  ON public.google_credentials FROM authenticated;
GRANT  INSERT, UPDATE, DELETE ON public.google_credentials TO authenticated;

COMMIT;

-- ============================================================
-- VERIFY
-- ============================================================

-- 1. Table exists with the four columns.
SELECT column_name, data_type, is_nullable
FROM   information_schema.columns
WHERE  table_schema = 'public' AND table_name = 'google_credentials'
ORDER  BY ordinal_position;

-- 2. RLS on, and exactly three policies — insert, update, delete.
--    If a SELECT policy ever appears here, someone has exposed the tokens.
SELECT c.relrowsecurity AS rls_enabled,
       p.polname,
       CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                     WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
                     ELSE p.polcmd::text END AS command
FROM   pg_class c
LEFT   JOIN pg_policy p ON p.polrelid = c.oid
WHERE  c.oid = 'public.google_credentials'::regclass;

-- 3. authenticated must NOT hold SELECT.
SELECT grantee, privilege_type
FROM   information_schema.role_table_grants
WHERE  table_schema = 'public' AND table_name = 'google_credentials'
ORDER  BY grantee, privilege_type;

-- 4. After redeploying index.html: sign out, sign in with Google, and
--    reconnect Gmail. One row should appear. You cannot SELECT it from
--    the browser — that is the point — but the SQL Editor runs as
--    postgres and bypasses RLS, so this works here:
SELECT user_id, left(refresh_token, 8) || '…' AS token_prefix,
       length(refresh_token) AS len, granted_at, updated_at
FROM   public.google_credentials;
