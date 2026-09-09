-- supabase/migrations/20260909_esq_org_profiles.sql
--
-- ═══════════════════════════════════════════════════════════════════════
--  ONE LOGO PER ORGANISATION, NOT ONE PER PERSON
-- ═══════════════════════════════════════════════════════════════════════
--
-- Eric, looking at a team member's own menu: "the person shows they can upload
-- a logo vs. a View my Company".
--
-- He is right, and it is worse than it looks. The logo lives on
-- profiles.logo_url, one per user. Six people at one EDO would each have to
-- upload it, and any one of them could upload a different one with nothing to
-- stop them or even to notice. Nothing about it is shared.
--
-- This is the first field of the shared organisation profile. Deliberately
-- only the logo for now: it is the one people can see, it is what prompted the
-- question, and moving one field proves the shape before the boilerplate,
-- region and target sectors follow it.
--
-- ⚠️ WHO MAY CHANGE IT is not a new rule. It is can_edit_profile - the tick
-- the owner controls - read through esq_org_can(org, 'profile'). Reading is
-- everyone on the team, because the point is that they share it.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.esq_organizations') IS NULL THEN
    RAISE EXCEPTION 'The org tables are not there. Run QUOTE-15 first. Nothing has been changed.';
  END IF;
  IF to_regprocedure('public.esq_org_can(bigint, text)') IS NULL THEN
    RAISE EXCEPTION 'esq_org_can is missing. Run QUOTE-17 first. Nothing has been changed.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.esq_org_profiles (
  org_id     bigint PRIMARY KEY REFERENCES public.esq_organizations(id) ON DELETE CASCADE,

  -- A data: URL, the same way profiles.logo_url already stores it. Capped
  -- because EVERY member downloads this row on every page load - a careless
  -- 40MB PNG here is not one person's problem, it is the whole office's.
  logo_url   text CHECK (logo_url IS NULL OR length(logo_url) <= 3200000),

  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.esq_org_profiles IS
  'The shared organisation profile. Starts with the logo; boilerplate, region and target sectors follow. Editable by anyone the owner has given can_edit_profile.';

-- Stamped in the database rather than trusted from the browser, so "who
-- changed the logo and when" is a fact rather than a claim.
CREATE OR REPLACE FUNCTION public.esq_org_profile_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NOT NULL THEN NEW.updated_by := auth.uid(); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS esq_org_profile_stamp_trg ON public.esq_org_profiles;
CREATE TRIGGER esq_org_profile_stamp_trg
  BEFORE INSERT OR UPDATE ON public.esq_org_profiles
  FOR EACH ROW EXECUTE FUNCTION public.esq_org_profile_stamp();

-- ── Access ───────────────────────────────────────────────────────────
ALTER TABLE public.esq_org_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS esq_org_profiles_site_admin ON public.esq_org_profiles;
CREATE POLICY esq_org_profiles_site_admin ON public.esq_org_profiles FOR ALL
  USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

-- Everyone on the team reads it. That IS the feature.
DROP POLICY IF EXISTS esq_org_profiles_read ON public.esq_org_profiles;
CREATE POLICY esq_org_profiles_read ON public.esq_org_profiles FOR SELECT
  USING (org_id IN (SELECT public.esq_my_org_ids()));

-- Writing is the tick the owner controls, and nothing else.
DROP POLICY IF EXISTS esq_org_profiles_write ON public.esq_org_profiles;
CREATE POLICY esq_org_profiles_write ON public.esq_org_profiles FOR INSERT
  WITH CHECK (public.esq_org_can(org_id, 'profile'));

DROP POLICY IF EXISTS esq_org_profiles_update ON public.esq_org_profiles;
CREATE POLICY esq_org_profiles_update ON public.esq_org_profiles FOR UPDATE
  USING (public.esq_org_can(org_id, 'profile'))
  WITH CHECK (public.esq_org_can(org_id, 'profile'));

REVOKE ALL ON public.esq_org_profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.esq_org_profiles TO authenticated;
-- No DELETE for anybody: clearing the logo is setting it to null, which leaves
-- the row and its history. Removing the organisation takes it, by cascade.

COMMIT;
