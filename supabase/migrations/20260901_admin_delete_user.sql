-- ============================================================
-- admin_delete_user() — permanently remove an account
--
-- WHY A SQL FUNCTION AND NOT AN EDGE FUNCTION
--
-- Deleting a row from auth.users needs privileges the browser will never
-- have. The usual answer is an edge function holding the service role key.
-- But this project already has public.is_current_user_admin(), so a
-- SECURITY DEFINER function does the same job with no new deployment, no
-- new secret, and no Docker — the browser calls it over RPC and Postgres
-- enforces who is allowed to run it.
--
-- WHY IT DISCOVERS ITS OWN DEPENDENTS
--
-- Only three tables in supabase/migrations declare a foreign key to
-- auth.users; the rest of this schema predates the repo and was built in
-- the dashboard, so there is no reliable list of what cascades and what
-- does not. Rather than guess and have the delete fail halfway on a
-- foreign key, this walks information_schema for every public table with a
-- user_id uuid column, and every one with a user_email column, and clears
-- those first. New tables are picked up automatically.
--
-- SAFETY
--
--   * Refuses unless the caller is an admin.
--   * Refuses to delete you.
--   * Refuses to delete another admin — remove their admin access first.
--   * Refuses to delete anyone with a LIVE Stripe subscription unless you
--     pass p_force. This one matters: deleting the account does not cancel
--     the subscription, so Stripe keeps billing a person who can no longer
--     log in. That is how you get a chargeback. Cancel in Stripe first.
--   * Returns a breakdown of exactly what it removed.
--
-- THIS CANNOT BE UNDONE. There is no soft-delete and no recovery.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_delete_user(
  p_email text,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid     uuid;
  v_email   text;
  v_status  text;
  v_tbl     record;
  v_removed jsonb := '{}'::jsonb;
  v_n       bigint;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Not authorised.';
  END IF;

  SELECT u.id, u.email INTO v_uid, v_email
  FROM auth.users u
  WHERE lower(u.email) = lower(trim(p_email));

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No account with that email.');
  END IF;

  IF v_uid = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account from here.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = v_uid) THEN
    RAISE EXCEPTION 'That account is an admin. Remove admin access first.';
  END IF;

  -- A live subscription outlives the account. Deleting without cancelling
  -- keeps Stripe billing someone who can no longer sign in.
  SELECT p.subscription_status INTO v_status
  FROM public.profiles p WHERE p.id = v_uid;

  IF NOT p_force AND v_status IN ('active','trialing','past_due') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This account has a ' || v_status || ' Stripe subscription. '
            || 'Cancel it in Stripe first, or re-run with force.',
      'needs_force', true,
      'subscription_status', v_status
    );
  END IF;

  -- Everything keyed by user id.
  FOR v_tbl IN
    SELECT c.table_name
    FROM   information_schema.columns c
    JOIN   information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE  c.table_schema = 'public'
      AND  c.column_name  = 'user_id'
      AND  c.data_type    = 'uuid'
      AND  t.table_type   = 'BASE TABLE'
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', v_tbl.table_name) USING v_uid;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN
      v_removed := v_removed || jsonb_build_object(v_tbl.table_name, v_n);
    END IF;
  END LOOP;

  -- And everything keyed by email instead.
  FOR v_tbl IN
    SELECT c.table_name
    FROM   information_schema.columns c
    JOIN   information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE  c.table_schema = 'public'
      AND  c.column_name  = 'user_email'
      AND  t.table_type   = 'BASE TABLE'
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE lower(user_email) = lower($1)', v_tbl.table_name)
      USING v_email;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN
      v_removed := v_removed || jsonb_build_object(v_tbl.table_name || ' (by email)', v_n);
    END IF;
  END LOOP;

  DELETE FROM public.profiles WHERE id = v_uid;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    v_removed := v_removed || jsonb_build_object('profiles', v_n);
  END IF;

  DELETE FROM auth.users WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'email', v_email, 'removed', v_removed);
END;
$$;

-- Only signed-in admins, and the function itself re-checks. anon never.
REVOKE ALL     ON FUNCTION public.admin_delete_user(text, boolean) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.admin_delete_user(text, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- VERIFY
-- ============================================================

-- 1. The function exists and is SECURITY DEFINER.
SELECT p.proname,
       p.prosecdef AS security_definer,
       pg_get_function_identity_arguments(p.oid) AS args
FROM   pg_proc p
JOIN   pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public' AND p.proname = 'admin_delete_user';

-- 2. Who can execute it. Expect authenticated; NOT anon.
SELECT grantee, privilege_type
FROM   information_schema.routine_privileges
WHERE  routine_schema = 'public' AND routine_name = 'admin_delete_user'
ORDER  BY grantee;

-- 3. Dry run — what WOULD be cleared for an address, without deleting.
--    Replace the email. Returns one row per table holding their data.
/*
SELECT c.table_name, c.column_name
FROM   information_schema.columns c
JOIN   information_schema.tables t
       ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE  c.table_schema = 'public'
  AND  t.table_type = 'BASE TABLE'
  AND  (c.column_name = 'user_email'
        OR (c.column_name = 'user_id' AND c.data_type = 'uuid'))
ORDER  BY c.table_name;
*/
