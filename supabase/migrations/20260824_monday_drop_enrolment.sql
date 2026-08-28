-- ============================================================
-- Monday Drop enrolment repair
--
-- Found 2026-08-24: the only trigger on auth.users is
-- `on_auth_user_created` (creates the profile). The enrolment trigger
-- `on_new_user_enroll_drop` from supabase/migrations/20260517_monday_drop.sql
-- was never installed against the database — the file exists in the repo,
-- but only the table creation and the one-off backfill ever ran.
--
-- Result: 18 auth.users, 18 profiles, 7 subscribers, all 7 dated
-- 2026-05-17 (the original backfill). Nobody enrolled since.
--
-- This matters beyond the newsletter: send-reengagement picks its audience
-- from monday_drop_subscribers, so 11 of 18 users would have been silently
-- skipped by the re-engagement send.
-- ============================================================

BEGIN;

-- ── 1. The trigger function ──────────────────────────────────
-- search_path is pinned here; the 2026-05-17 original did not pin it, and
-- an unpinned SECURITY DEFINER function is a hardening gap (same issue we
-- fixed on is_current_user_admin earlier today).
CREATE OR REPLACE FUNCTION public.auto_enroll_monday_drop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.monday_drop_subscribers (user_id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(split_part(NEW.email, '@', 1), NEW.email)
  )
  ON CONFLICT (email) DO UPDATE
    SET user_id = EXCLUDED.user_id
    WHERE monday_drop_subscribers.user_id IS NULL;
  RETURN NEW;
END;
$function$;

-- ── 2. Install it ────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_new_user_enroll_drop ON auth.users;
CREATE TRIGGER on_new_user_enroll_drop
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auto_enroll_monday_drop();

-- ── 3. Backfill the users who were never enrolled ────────────
-- Uses full_name from profiles where available, so the admin subscriber
-- list shows real names rather than email prefixes.
-- Anyone who previously unsubscribed keeps that state — the NOT EXISTS
-- guard means existing rows are never touched.
INSERT INTO public.monday_drop_subscribers (user_id, email, name)
SELECT u.id,
       u.email,
       COALESCE(NULLIF(trim(p.full_name), ''), split_part(u.email, '@', 1))
FROM   auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE  u.email IS NOT NULL
  AND  NOT EXISTS (
         SELECT 1 FROM public.monday_drop_subscribers s
         WHERE lower(s.email) = lower(u.email)
       );

COMMIT;

-- ============================================================
-- VERIFY
-- ============================================================

-- Trigger is installed. tgenabled 'O' = enabled for origin (normal).
SELECT tgname, tgenabled
FROM   pg_trigger
WHERE  tgrelid = 'auth.users'::regclass AND NOT tgisinternal
ORDER  BY tgname;

-- Counts should now line up: 18 / 18 / 18, with 0 unsubscribed.
SELECT (SELECT count(*) FROM auth.users)                  AS auth_users,
       (SELECT count(*) FROM public.profiles)             AS profiles,
       (SELECT count(*) FROM public.monday_drop_subscribers) AS subscribers,
       (SELECT count(*) FROM public.monday_drop_subscribers
        WHERE unsubscribed_at IS NOT NULL)                AS unsubscribed;

-- The newly enrolled rows.
SELECT email, name, subscribed_at::date AS subscribed
FROM   public.monday_drop_subscribers
WHERE  subscribed_at::date > '2026-05-17'
ORDER  BY email;
