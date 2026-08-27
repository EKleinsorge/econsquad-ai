-- ============================================================
-- Security hardening + admin reporting repair
-- Run in the Supabase SQL Editor. Wrapped in a transaction:
-- if any statement fails, nothing is applied.
--
-- Findings this addresses (2026-08-24):
--
--  1. profiles.is_admin is writable by the user it describes.
--     "Users can update own profile" is UPDATE ... USING (auth.uid() = id),
--     and RLS gates rows, not columns. is_current_user_admin() reads exactly
--     that column, so setting it grants "Admins can read all profiles" and
--     "Admins can read all reports".
--  2. admins: policy "Allow all", cmd ALL, role public, qual = true.
--     The anon key ships in admin.html, so the table was world-writable.
--  3. admin_messages: same "Allow all" shape.
--  4. specialists: RLS disabled. Its SELECT policy was inert; writes open.
--  5. specialist_requests: RLS disabled, no policies at all.
--  6. is_current_user_admin() had no SET search_path, unlike the other
--     SECURITY DEFINER functions beside it.
--  7. task_history / user_badges / monday_drop_* have user-scoped policies
--     only, so every cross-user query in admin.html returned just the
--     signed-in admin's own rows — wrong numbers, not missing ones.
--
-- Deliberately NOT changed: is_beta_tester, beta_expires_at,
-- promo_code_used. The promo redemption flow in index.html writes those
-- from the client; freezing them would break beta signups. That flow
-- should move to an edge function — tracked separately.
-- ============================================================

BEGIN;

-- ── 0. Nobody loses access ───────────────────────────────────
-- Anyone currently trusted via profiles.is_admin becomes a real admins row
-- BEFORE that column stops being a trust signal.
INSERT INTO public.admins (email, name, added_by)
SELECT p.email, p.full_name, 'migration-2026-08-24'
FROM   public.profiles p
WHERE  COALESCE(p.is_admin, false) = true
  AND  p.email IS NOT NULL
  AND  NOT EXISTS (
         SELECT 1 FROM public.admins a
         WHERE lower(a.email) = lower(p.email)
       );

-- ── 1. One hardened source of truth ──────────────────────────
-- JWT app_metadata.role is written only by the service role, so a user
-- cannot grant it to themselves. The admins table is the secondary path,
-- and step 3 locks it to admins only.
-- profiles.is_admin is deliberately no longer consulted.
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(public.is_admin_role(), false)
      OR EXISTS (
           SELECT 1 FROM public.admins a
           WHERE lower(a.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
         )
$function$;

-- ── 2. Freeze privileged profile columns ─────────────────────
-- RLS cannot restrict columns, so this is enforced by trigger.
-- Service-role callers (Stripe webhook, edge functions) have a null
-- auth.uid() and pass straight through.
CREATE OR REPLACE FUNCTION public.protect_privileged_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;                      -- service role / server-side
  END IF;
  IF public.is_current_user_admin() THEN
    RETURN NEW;                      -- real admin, e.g. admin.html plan edits
  END IF;

  NEW.is_admin           := OLD.is_admin;
  NEW.plan               := OLD.plan;
  NEW.trial_start        := OLD.trial_start;
  NEW.trial_end          := OLD.trial_end;
  NEW.stripe_customer_id := OLD.stripe_customer_id;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_protect_profile_cols ON public.profiles;
CREATE TRIGGER trg_protect_profile_cols
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_privileged_profile_columns();

-- ── 3. Lock the admins table ─────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON public.admins;
DROP POLICY IF EXISTS admins_admin_read  ON public.admins;
DROP POLICY IF EXISTS admins_admin_write ON public.admins;

CREATE POLICY admins_admin_read ON public.admins
  FOR SELECT USING (public.is_current_user_admin());

CREATE POLICY admins_admin_write ON public.admins
  FOR ALL
  USING      (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- ── 4. Lock admin_messages, but keep the user banner working ─
-- index.html:3340 reads active broadcasts and messages targeted at the
-- signed-in user. That stays; everything else becomes admin-only.
DROP POLICY IF EXISTS "Allow all access to admin_messages" ON public.admin_messages;
DROP POLICY IF EXISTS admin_messages_read_own ON public.admin_messages;
DROP POLICY IF EXISTS admin_messages_admin    ON public.admin_messages;

CREATE POLICY admin_messages_read_own ON public.admin_messages
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (
      type = 'broadcast'
      OR lower(COALESCE(target_email,'')) = lower(COALESCE(auth.jwt() ->> 'email',''))
    )
  );

CREATE POLICY admin_messages_admin ON public.admin_messages
  FOR ALL
  USING      (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- ── 5. specialists: turn RLS on so writes are actually gated ─
-- The existing "Specialists are publicly readable" SELECT policy has been
-- inert this whole time; enabling RLS activates it.
ALTER TABLE public.specialists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS specialists_admin_write ON public.specialists;
CREATE POLICY specialists_admin_write ON public.specialists
  FOR ALL
  USING      (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- ── 6. specialist_requests: RLS was off with no policies ─────
ALTER TABLE public.specialist_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sr_insert_own ON public.specialist_requests;
DROP POLICY IF EXISTS sr_select_own ON public.specialist_requests;
DROP POLICY IF EXISTS sr_admin_all  ON public.specialist_requests;

CREATE POLICY sr_insert_own ON public.specialist_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY sr_select_own ON public.specialist_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY sr_admin_all ON public.specialist_requests
  FOR ALL
  USING      (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- ── 7. Admin reporting: the reason we started ────────────────
-- Every cross-user read in admin.html was silently filtered to the admin's
-- own rows. These add an admin lane without widening user access.
DROP POLICY IF EXISTS task_history_admin_read ON public.task_history;
CREATE POLICY task_history_admin_read ON public.task_history
  FOR SELECT USING (public.is_current_user_admin());

DROP POLICY IF EXISTS user_badges_admin_read ON public.user_badges;
CREATE POLICY user_badges_admin_read ON public.user_badges
  FOR SELECT USING (public.is_current_user_admin());

DROP POLICY IF EXISTS mds_admin_read ON public.monday_drop_subscribers;
CREATE POLICY mds_admin_read ON public.monday_drop_subscribers
  FOR SELECT USING (public.is_current_user_admin());

DROP POLICY IF EXISTS mdsends_admin_read ON public.monday_drop_sends;
CREATE POLICY mdsends_admin_read ON public.monday_drop_sends
  FOR SELECT USING (public.is_current_user_admin());

-- ── 8. Point problem_reports at the same function ────────────
-- It inlined an EXISTS on profiles.is_admin. Same answer, one convention.
DROP POLICY IF EXISTS "Admins can read all reports"  ON public.problem_reports;
DROP POLICY IF EXISTS "Admins can update reports"    ON public.problem_reports;

CREATE POLICY "Admins can read all reports" ON public.problem_reports
  FOR SELECT USING (public.is_current_user_admin());

CREATE POLICY "Admins can update reports" ON public.problem_reports
  FOR UPDATE USING (public.is_current_user_admin());

COMMIT;

-- ============================================================
-- VERIFY — run these after the commit
-- ============================================================

-- 1. You are still an admin. Must return true.
SELECT public.is_current_user_admin() AS still_admin;

-- 2. The admins table reads without recursion. is_current_user_admin() is
--    SECURITY DEFINER and owned by the table owner, so it bypasses RLS
--    inside the policy. If this errors with "infinite recursion detected",
--    stop and tell Claude.
SELECT count(*) AS admin_rows FROM public.admins;

-- 3. Nothing is left wide open.
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_on,
       COALESCE(string_agg(p.policyname || '  [' || p.cmd || ']', '  ·  '
                           ORDER BY p.policyname), '— NO POLICIES —') AS policies
FROM   pg_class c
JOIN   pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = 'public'
WHERE  c.relkind = 'r'
  AND  c.relname IN ('admins','admin_messages','specialists','specialist_requests',
                     'task_history','user_badges','monday_drop_subscribers',
                     'monday_drop_sends','profiles','problem_reports')
GROUP  BY c.relname, c.relrowsecurity
ORDER  BY c.relrowsecurity, c.relname;

-- 4. The column freeze is live.
SELECT tgname, tgenabled
FROM   pg_trigger
WHERE  tgrelid = 'public.profiles'::regclass AND NOT tgisinternal;
