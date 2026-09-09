-- supabase/migrations/20260909_esq_org_permissions.sql
--
-- ═══════════════════════════════════════════════════════════════════════
--  PER-MEMBER PERMISSIONS: the owner ticks what each person may change
-- ═══════════════════════════════════════════════════════════════════════
--
-- Until now "admin" was all-or-nothing: promoting somebody so they could fix
-- the logo also let them invite people and revoke seats. Those need different
-- amounts of trust. A wrong logo is embarrassing; a revoked seat locks a
-- colleague out mid-week.
--
-- So permission becomes a tick per person, not a rung on a ladder:
--
--     can_edit_profile   the shared organisation profile - logo, boilerplate,
--                        region, target sectors. NOT the personal signature
--                        block, which is never shared.
--     can_manage_seats   invite, resend, revoke.
--
-- The owner always holds both and cannot have them removed.
--
-- ⚠️ THE THING THIS FILE IS REALLY ABOUT
-- RLS gates rows, not columns. The existing policy lets anyone who manages
-- seats UPDATE any member row in their organisation - which, without the guard
-- below, includes their own, setting role = 'owner' or ticking their own boxes.
-- Column GRANTs cannot fix it: Postgres grants to the `authenticated` database
-- role, and every signed-in customer is that same role. So the rule is enforced
-- by a trigger that checks WHO is calling.

BEGIN;

-- Refuse to run if the org tables are not there, rather than half-applying.
DO $$
BEGIN
  IF to_regclass('public.esq_org_members') IS NULL THEN
    RAISE EXCEPTION 'esq_org_members does not exist. Run 20260909_esq_organizations.sql first. Nothing has been changed.';
  END IF;
END $$;

-- ── The ticks ────────────────────────────────────────────────────────
ALTER TABLE public.esq_org_members
  ADD COLUMN IF NOT EXISTS can_edit_profile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_seats boolean NOT NULL DEFAULT false;

-- Carried on the invitation too, so the owner ticks the boxes once when
-- inviting rather than having to remember after the person accepts.
ALTER TABLE public.esq_org_invites
  ADD COLUMN IF NOT EXISTS can_edit_profile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_seats boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.esq_org_members.can_edit_profile IS
  'May change the shared organisation profile. Never the personal signature block.';
COMMENT ON COLUMN public.esq_org_members.can_manage_seats IS
  'May invite, resend and revoke. Never promote, and never change anyone''s ticks - that is the owner alone.';

-- Anyone who already held the old blanket admin role keeps exactly what they
-- had, so nobody loses access the moment this runs.
UPDATE public.esq_org_members
   SET can_edit_profile = true, can_manage_seats = true
 WHERE role IN ('owner','admin') AND revoked_at IS NULL
   AND (can_edit_profile = false OR can_manage_seats = false);

-- ── One live owner per organisation, always ──────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS esq_org_members_one_owner_idx
  ON public.esq_org_members (org_id) WHERE role = 'owner' AND revoked_at IS NULL;

-- ── Asking "may I?" ──────────────────────────────────────────────────
-- SECURITY DEFINER because a policy on esq_org_members that queries
-- esq_org_members recurses forever.
CREATE OR REPLACE FUNCTION public.esq_org_can(p_org bigint, p_what text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.esq_org_members
     WHERE org_id = p_org AND user_id = auth.uid() AND revoked_at IS NULL
       AND ( role = 'owner'
          OR (p_what = 'profile' AND can_edit_profile)
          OR (p_what = 'seats'   AND can_manage_seats) )
  )
$$;

-- Redefined, not replaced. Everything that already gates on this now means
-- "may manage seats", and the backfill above means behaviour is unchanged for
-- everyone who exists today.
CREATE OR REPLACE FUNCTION public.esq_is_org_admin(p_org bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.esq_org_can(p_org, 'seats')
$$;

COMMENT ON FUNCTION public.esq_is_org_admin(bigint) IS
  'Kept for the policies that already reference it. Now means: may manage seats.';

-- ── ⚠️ The guard: only the owner changes what people may do ──────────
CREATE OR REPLACE FUNCTION public.esq_org_guard_privileges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  caller uuid := auth.uid();
  is_owner boolean;
  target_org bigint := coalesce(NEW.org_id, OLD.org_id);
BEGIN
  -- No session at all means the service role or the SQL editor: provisioning,
  -- support, migrations. Those are trusted paths and are not what this guards.
  IF caller IS NULL OR public.is_current_user_admin() THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.esq_org_members
     WHERE org_id = target_org AND user_id = caller
       AND revoked_at IS NULL AND role = 'owner'
  ) INTO is_owner;

  IF TG_OP = 'INSERT' THEN
    IF (NEW.role <> 'member' OR NEW.can_edit_profile OR NEW.can_manage_seats)
       AND NOT is_owner THEN
      RAISE EXCEPTION 'Only the team owner can decide what somebody is allowed to change.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  -- The three privileged columns.
  IF (NEW.role, NEW.can_edit_profile, NEW.can_manage_seats)
     IS DISTINCT FROM (OLD.role, OLD.can_edit_profile, OLD.can_manage_seats)
     AND NOT is_owner THEN
    RAISE EXCEPTION 'Only the team owner can change what somebody is allowed to edit.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The owner's own seat is not revocable, or an organisation ends up with
  -- nobody who can pay for it or hand it on.
  IF TG_TABLE_NAME = 'esq_org_members'
     AND OLD.role = 'owner' AND OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'The team owner cannot be removed. Transfer ownership first.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS esq_org_members_guard_trg ON public.esq_org_members;
CREATE TRIGGER esq_org_members_guard_trg
  BEFORE INSERT OR UPDATE ON public.esq_org_members
  FOR EACH ROW EXECUTE FUNCTION public.esq_org_guard_privileges();

DROP TRIGGER IF EXISTS esq_org_invites_guard_trg ON public.esq_org_invites;
CREATE TRIGGER esq_org_invites_guard_trg
  BEFORE INSERT OR UPDATE ON public.esq_org_invites
  FOR EACH ROW EXECUTE FUNCTION public.esq_org_guard_privileges();

-- ── What the page shows ──────────────────────────────────────────────
-- One row per live seat, already answering "who are they, what may they do,
-- and did they accept yet". security_invoker so RLS still applies.
CREATE OR REPLACE VIEW public.esq_org_roster AS
SELECT m.id,
       m.org_id,
       m.user_id,
       p.email,
       m.role,
       m.can_edit_profile,
       m.can_manage_seats,
       m.granted_at,
       'member'::text AS kind,
       NULL::text     AS first_name,
       NULL::text     AS last_name,
       NULL::timestamptz AS expires_at
  FROM public.esq_org_members m
  LEFT JOIN public.profiles p ON p.id = m.user_id
 WHERE m.revoked_at IS NULL

UNION ALL

SELECT i.id,
       i.org_id,
       NULL::uuid,
       i.email,
       i.role,
       i.can_edit_profile,
       i.can_manage_seats,
       i.created_at,
       'invite'::text,
       i.first_name,
       i.last_name,
       i.expires_at
  FROM public.esq_org_invites i
 WHERE i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now();

ALTER VIEW public.esq_org_roster SET (security_invoker = true);

GRANT SELECT ON public.esq_org_roster TO authenticated;
REVOKE ALL ON public.esq_org_roster FROM anon;

COMMIT;
