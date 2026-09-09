-- supabase/migrations/20260910_esq_org_profile_fields.sql
--
-- ═══════════════════════════════════════════════════════════════════════
--  THE SHARED ORGANISATION PROFILE
-- ═══════════════════════════════════════════════════════════════════════
--
-- Eric asked what an organisation needs for producing documents, approved the
-- list, and said "simplicity is key". So: free text almost everywhere, one
-- address block rather than five address fields, and no field that exists only
-- to be tidy.
--
-- ⚠️ THREE LINES THAT ARE NOT NEGOTIABLE, AND WHY.
--
-- 1. THE SIGNATURE BLOCK IS NOT HERE.
--    contact_name, contact_title, contact_phone, contact_email stay on
--    community_profiles, per person. Share them and every cover letter Clara
--    writes for five people gets signed by the sixth.
--
-- 2. LIVE FIGURES ARE NOT HERE.
--    Population, labour force, unemployment, median wage. They go stale in a
--    quarter, and a wrong number in a proposal to a site selector is worse than
--    no number. They belong to the data providers, fetched when needed - not
--    typed in once and quietly ageing.
--
-- 3. EIN, TAX ID AND BANK DETAILS ARE NOT HERE, AND WILL NOT BE.
--    Documents needing them are rare and usually signed offline. They are
--    exactly the fields that turn a profile table into a breach. If a grant
--    application needs one, it gets typed into that application.
--
-- Everything below is org-wide, readable by every member, writable only through
-- can_edit_profile. That is unchanged - this adds columns, not rules.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.esq_org_profiles') IS NULL THEN
    RAISE EXCEPTION 'esq_org_profiles is not there. Run TEAM-23 first. Nothing has been changed.';
  END IF;
END $$;

-- ── 1. On every document ─────────────────────────────────────────────
ALTER TABLE public.esq_org_profiles
  ADD COLUMN IF NOT EXISTS legal_name     text,   -- "Whoville County Industrial Development Agency"
  ADD COLUMN IF NOT EXISTS short_name     text,   -- "Whoville IDA" - what they call themselves in prose
  ADD COLUMN IF NOT EXISTS entity_type    text,   -- IDA / EDC / LDC / chamber / port authority / city dept
  ADD COLUMN IF NOT EXISTS address        text,   -- one block, as it goes on a letterhead
  ADD COLUMN IF NOT EXISTS phone          text,
  ADD COLUMN IF NOT EXISTS general_email  text,
  ADD COLUMN IF NOT EXISTS website        text,
  ADD COLUMN IF NOT EXISTS logo_mono_url  text,   -- black and white, for print and fax-quality RFPs
  ADD COLUMN IF NOT EXISTS founded_year   integer,
  ADD COLUMN IF NOT EXISTS governing_body text;   -- "a nine-member board appointed by the County Legislature"

-- ── 2. What makes a document theirs rather than generic ──────────────
ALTER TABLE public.esq_org_profiles
  ADD COLUMN IF NOT EXISTS municipalities     text,  -- "serving the towns of..."
  ADD COLUMN IF NOT EXISTS region_label       text,  -- MSA or labour shed as they name it
  ADD COLUMN IF NOT EXISTS access_notes       text,  -- interstate, airport, rail, port, with drive times
  ADD COLUMN IF NOT EXISTS top_employers      text,
  ADD COLUMN IF NOT EXISTS incentive_programs text,  -- PILOT, abatement, revolving loan, TIF, OZ, FTZ
  ADD COLUMN IF NOT EXISTS mission            text,
  ADD COLUMN IF NOT EXISTS tagline            text,
  ADD COLUMN IF NOT EXISTS boilerplate        text;  -- the "About us" paragraph they paste everywhere

-- ── 3. Voice and the small print ─────────────────────────────────────
ALTER TABLE public.esq_org_profiles
  ADD COLUMN IF NOT EXISTS self_reference text,  -- how they refer to themselves in the third person
  ADD COLUMN IF NOT EXISTS style_notes    text,  -- formal or plain, terms to avoid
  ADD COLUMN IF NOT EXISTS footer_notice  text;  -- standard footer, FOIL, equal-opportunity

-- ⚠️ The same ceiling as the colour logo, and for the same reason: every member
-- downloads this row on every page load.
ALTER TABLE public.esq_org_profiles DROP CONSTRAINT IF EXISTS esq_org_profiles_mono_len_check;
ALTER TABLE public.esq_org_profiles
  ADD CONSTRAINT esq_org_profiles_mono_len_check
  CHECK (logo_mono_url IS NULL OR length(logo_mono_url) <= 3200000);

-- Free text, but not unbounded. A pasted annual report in "boilerplate" would
-- be downloaded by the whole office on every load.
ALTER TABLE public.esq_org_profiles DROP CONSTRAINT IF EXISTS esq_org_profiles_prose_len_check;
ALTER TABLE public.esq_org_profiles
  ADD CONSTRAINT esq_org_profiles_prose_len_check
  CHECK (
    coalesce(length(boilerplate),0)        <= 4000 AND
    coalesce(length(mission),0)            <= 2000 AND
    coalesce(length(incentive_programs),0) <= 6000 AND
    coalesce(length(top_employers),0)      <= 4000 AND
    coalesce(length(municipalities),0)     <= 4000 AND
    coalesce(length(access_notes),0)       <= 4000 AND
    coalesce(length(style_notes),0)        <= 4000 AND
    coalesce(length(footer_notice),0)      <= 4000 AND
    coalesce(length(governing_body),0)     <= 2000 AND
    coalesce(length(address),0)            <= 1000
  );

COMMENT ON COLUMN public.esq_org_profiles.entity_type IS
  'IDA, EDC, LDC, chamber, port authority, city department, regional partnership. Free text on purpose - it changes what they can legally offer and how a site selector reads them, and an unusual one must not be refused.';
COMMENT ON COLUMN public.esq_org_profiles.logo_mono_url IS
  'Single-colour logo. Half of what an EDO prints is black and white or goes into a fax-quality RFP response.';

-- ── How much of it is filled in ──────────────────────────────────────
-- So the page can say "11 of 20" without every caller counting for itself, and
-- so an agent can ask for what is missing at the moment it needs it rather than
-- demanding a form be completed first.
--
-- ⚠️ The twenty counted here are EXACTLY the twenty the form shows. The logos
-- are deliberately not among them - they have their own row in the menu, and a
-- count that includes something the form cannot change means somebody fills a
-- field in and watches the number stay put.
CREATE OR REPLACE VIEW public.esq_org_profile_status AS
SELECT p.org_id,
       (CASE WHEN nullif(btrim(coalesce(p.legal_name,'')),'')     IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN nullif(btrim(coalesce(p.short_name,'')),'')     IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN nullif(btrim(coalesce(p.entity_type,'')),'')    IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN nullif(btrim(coalesce(p.address,'')),'')        IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN nullif(btrim(coalesce(p.phone,'')),'')          IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN nullif(btrim(coalesce(p.general_email,'')),'')  IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN nullif(btrim(coalesce(p.website,'')),'')        IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN p.founded_year IS NOT NULL                      THEN 1 ELSE 0 END +
        CASE WHEN nullif(btrim(coalesce(p.governing_body,'')),'') IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN nullif(btrim(coalesce(p.municipalities,'')),'') IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN nullif(btrim(coalesce(p.region_label,'')),'')   IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN nullif(btrim(coalesce(p.access_notes,'')),'')   IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN nullif(btrim(coalesce(p.top_employers,'')),'')  IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN nullif(btrim(coalesce(p.incentive_programs,'')),'') IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN nullif(btrim(coalesce(p.mission,'')),'')        IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN nullif(btrim(coalesce(p.tagline,'')),'')        IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN nullif(btrim(coalesce(p.boilerplate,'')),'')    IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN nullif(btrim(coalesce(p.self_reference,'')),'') IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN nullif(btrim(coalesce(p.style_notes,'')),'')    IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN nullif(btrim(coalesce(p.footer_notice,'')),'')  IS NOT NULL THEN 1 ELSE 0 END
       ) AS filled,
       20 AS total,
       -- Enough to put their name on a letter. Everything past this improves
       -- the writing; without it a document cannot be addressed at all.
       (nullif(btrim(coalesce(p.legal_name,'')),'') IS NOT NULL
        AND nullif(btrim(coalesce(p.address,'')),'') IS NOT NULL
        AND p.logo_url IS NOT NULL) AS letterhead_ready
  FROM public.esq_org_profiles p;

ALTER VIEW public.esq_org_profile_status SET (security_invoker = true);
REVOKE ALL ON public.esq_org_profile_status FROM anon;
GRANT SELECT ON public.esq_org_profile_status TO authenticated;

COMMIT;
