-- ============================================================
-- FIX: "column a.user_id does not exist"
--
-- The first version of admin_delete_user() guarded against deleting another
-- admin with:
--
--     SELECT 1 FROM public.admins a WHERE a.user_id = v_uid
--
-- public.admins is keyed by EMAIL, not by user id — see
-- 20260824_security_and_admin_rls.sql, where is_current_user_admin() matches
-- on lower(a.email) = lower(auth.jwt() ->> 'email'). There is no user_id
-- column on that table, so the function raised before it deleted anything.
--
-- Nothing was deleted by the broken version: the guard runs before any
-- DELETE, and the whole function is one transaction regardless.
--
-- This replaces the function. Everything else about it is unchanged.
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

  -- admins is keyed by email. This was the bug.
  IF EXISTS (SELECT 1 FROM public.admins a WHERE lower(a.email) = lower(v_email)) THEN
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

REVOKE ALL     ON FUNCTION public.admin_delete_user(text, boolean) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.admin_delete_user(text, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- VERIFY — confirm the admins table really is email-keyed
-- ============================================================

SELECT column_name, data_type
FROM   information_schema.columns
WHERE  table_schema = 'public' AND table_name = 'admins'
ORDER  BY ordinal_position;

-- Dry run: what WOULD be cleared for an address. Replace the email.
-- Returns one row per table holding their data. Deletes nothing.
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
