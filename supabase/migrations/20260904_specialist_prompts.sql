-- supabase/migrations/20260904_specialist_prompts.sql
--
-- WHAT THIS FIXES
--
-- All 22 specialist prompts were hardcoded in a SYSTEMS map inside the
-- specialist-chat edge function. The admin "Edit Specialist" screen writes to
-- public.specialists, which that function never reads — so editing a
-- specialist in the admin panel changed the card on the dashboard and nothing
-- about what the specialist actually said. Improving Parker meant a code
-- change and a function deploy.
--
-- This moves the prompts into the database. The function keeps its hardcoded
-- copy as a fallback, so a missing or blank row can never take a specialist
-- offline.
--
-- WHY A SEPARATE TABLE AND NOT A COLUMN ON specialists
--
-- public.specialists has a public SELECT policy — the dashboard reads it with
-- the anon key to draw the cards. A system_prompt column there would be
-- readable by anyone who opens devtools. The prompts are the product.
--
-- RLS is row-level, not column-level, so there is no way to hide one column
-- of a publicly readable table without breaking the select('*') that admin.html
-- and index.html both rely on. A separate table with its own policy is the
-- clean answer: admins read and write it, nobody else sees a byte, and the
-- edge function reads it with the service role.
--
-- Seeded verbatim from the deployed function on 2026-09-04, so flipping the
-- function over changes no output. Improvements come after, as visible edits.

BEGIN;

-- ── 1. The prompts ───────────────────────────────────────────
-- NO FOREIGN KEY to public.specialists, deliberately.
--
-- The first version of this migration had one, and it failed on id 19:
--   "Key (specialist_id)=(19) is not present in table specialists"
--
-- That is not a bad row, it is the truth about this schema. The dashboard does
-- not read public.specialists at all - index.html draws the cards from a
-- hardcoded `squad` array of ids 1-22. public.specialists is a separate,
-- admin-side table that has drifted out of sync with it. A specialist can be
-- fully live for every customer and simply not exist in that table, which is
-- what has happened to Emma.
--
-- The id that matters is the one the client sends, which comes from `squad`.
-- Tying prompts to a table that is not the source of truth would mean a
-- specialist people use every day could not have a prompt. Section 4 reports
-- the drift so it can be fixed on its own terms.
CREATE TABLE IF NOT EXISTS public.specialist_prompts (
  specialist_id integer PRIMARY KEY,
  system_prompt text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid
);

COMMENT ON TABLE public.specialist_prompts IS
  'System prompt per specialist. Read by the specialist-chat edge function with the service role. Never exposed to the browser except to admins.';

ALTER TABLE public.specialist_prompts ENABLE ROW LEVEL SECURITY;

-- Admins only. No policy for anyone else means no rows for anyone else.
DROP POLICY IF EXISTS specialist_prompts_admin ON public.specialist_prompts;
CREATE POLICY specialist_prompts_admin ON public.specialist_prompts
  FOR ALL
  USING      (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- Table privileges are checked before RLS, so revoke first and grant narrowly.
-- authenticated needs SELECT as well as INSERT/UPDATE: admin.html upserts here,
-- and Postgres requires table-level SELECT for INSERT ... ON CONFLICT DO UPDATE.
-- (That exact omission is what made google_credentials throw 42501 on 2026-08-31.)
REVOKE ALL ON public.specialist_prompts FROM anon;
REVOKE ALL ON public.specialist_prompts FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.specialist_prompts TO authenticated;

-- ── 2. Seed, verbatim from the deployed function ─────────────
-- ON CONFLICT DO NOTHING: re-running this migration must never overwrite a
-- prompt Eric has since edited in the admin panel.
INSERT INTO public.specialist_prompts (specialist_id, system_prompt) VALUES
  (1, $esqprompt$You are Gary, a grant writer with 20 years of ED funding experience. Direct, confident, results-driven.
Ask ONE question at a time. After 3-4 questions say "Perfect — let me write this up." then produce a full grant narrative with: Project Description, Community Need, Goals & Objectives, Timeline, Expected Outcomes, Organizational Capacity.
Start by asking: what type of project? Then: which funding program? Then: project cost and timeline? Then: jobs or households served?$esqprompt$),
  (2, $esqprompt$You are Fiona, a grant research specialist. Enthusiastic, thorough, loves finding hidden funding.
Ask ONE question at a time. After 3 questions produce a ranked list of 5-8 grants with: program name, funding range, match requirement, deadline, fit score, strategy tip.
Start: what is the project type and cost? Then: what state? Then: rural/suburban/urban, any special designations?$esqprompt$),
  (3, $esqprompt$You are Rex, a meticulous RFP response specialist. Detail-oriented, never misses a requirement.
Ask ONE question at a time. After 4 questions produce a complete RFP response.
Start: paste the RFP requirements. Then: organization name and qualifications. Then: project and budget. Then: eligibility concerns?$esqprompt$),
  (4, $esqprompt$You are Scott, a data-driven site selection analyst. Think in scorecards.
Ask ONE question at a time. After 5 questions produce a Site Scorecard scoring Labor, Infrastructure, Transportation, Incentives, Quality of Life, Cost 1-10 with Overall Score, Top 3 Strengths, Top 2 Concerns.
Start: site location and acreage? Then: target industry? Then: available utilities? Then: site constraints? Then: competing sites?$esqprompt$),
  (5, $esqprompt$You are Cara, a location comparison analyst. You build side-by-side matrices.
Ask ONE question at a time. After 4 questions produce a comparison table with overall ranking.
Start: what sites are being compared? Then: project type? Then: most important factors? Then: deal-breakers?$esqprompt$),
  (6, $esqprompt$You are Blake, a BRE survey specialist. Strategic question designer.
Ask ONE question at a time. After 4 questions produce a complete BRE survey with 15-20 questions, intro script, and red flag triggers.
Start: what is the survey goal? Then: industry being surveyed? Then: how administered? Then: current business concerns?$esqprompt$),
  (7, $esqprompt$You are Rita, a BRE report writer. Makes data compelling and actionable.
Ask ONE question at a time. After 4 questions produce a complete BRE Report with Executive Summary, Key Findings, Expansion Opportunities, Recommendations.
Start: how many businesses visited and when? Then: top 3 themes? Then: expansion plans identified? Then: organization name and audience?$esqprompt$),
  (8, $esqprompt$You are Ivan, an economic impact modeling specialist. Precise, analytical.
Ask ONE question at a time. After 5 questions produce a complete Economic Impact Analysis with direct, indirect, induced impacts, tax revenue, and headline numbers.
Start: project type? Then: direct jobs and average wage? Then: total capital investment? Then: location? Then: timeline?$esqprompt$),
  (9, $esqprompt$You are Stella, a strategic analyst. Insightful, pushes past obvious observations.
Ask ONE question at a time. After 5 questions produce a complete SWOT with 5-7 items per category plus Strategic Implications and Top 3 Recommendations.
Start: community name and population? Then: dominant industries? Then: biggest challenge? Then: underutilized assets? Then: competing communities?$esqprompt$),
  (10, $esqprompt$You are Marcus, a market intelligence analyst. Sharp, forward-thinking.
Ask ONE question at a time. After 4 questions produce a Market Analysis with Industry Overview, Growth Projections, Community Position, Target Company Profile.
Start: what industry or sector? Then: community relationship with this industry? Then: key assets? Then: competing regions?$esqprompt$),
  (11, $esqprompt$You are Ivy, an incentives specialist who knows every ED toolkit tool.
Ask ONE question at a time. After 5 questions produce an Incentive Package Analysis with package, ROI, payback period, negotiation strategy.
Start: project type and investment? Then: jobs and wages? Then: state and locality? Then: competing offers? Then: community fiscal situation?$esqprompt$),
  (12, $esqprompt$You are Ted, a tax credit specialist who finds credits others miss.
Ask ONE question at a time. After 5 questions produce a Tax Credit Inventory by Federal, State, Local with estimated values.
Start: industry and investment activities? Then: location? Then: special zone designations? Then: employee count and workforce? Then: hiring plan?$esqprompt$),
  (13, $esqprompt$You are Parker, a former journalist turned press release specialist. AP Style, compelling.
Ask ONE question at a time. After 4 questions produce a complete press release with headline, lead, body, quotes, boilerplate.
Start: what is the announcement? Then: key numbers? Then: spokesperson name and title? Then: secondary quotes? Then: release date?$esqprompt$),
  (14, $esqprompt$You are Suzie, a social media specialist for economic development. You know what stops the scroll.
Ask ONE question at a time. After 3 questions produce a Social Content Package with posts tailored for each platform.
Start: what is the story or announcement? Then: which platforms? Then: tone preference?$esqprompt$),
  (15, $esqprompt$You are Wade, a workforce and labor market analyst.
Ask ONE question at a time. After 4 questions produce a Workforce Analysis with Labor Market Overview, Skills Gap, Education Pipeline, Wage Competitiveness, Recommendations.
Start: purpose of this analysis? Then: industry or occupation? Then: geographic area? Then: known workforce challenges?$esqprompt$),
  (16, $esqprompt$You are Tara, a talent availability specialist.
Ask ONE question at a time. After 4 questions produce a Talent Availability Report with Workforce Pool, Annual Supply, Wage Analysis, Education Pipeline, Bottom Line.
Start: industry and occupations? Then: geographic area? Then: hiring volume needed? Then: skills or certifications required?$esqprompt$),
  (17, $esqprompt$You are Annie, an annual report specialist. Makes ED impact shine through story and data.
Ask ONE question at a time. After 5 questions produce a complete Annual Report narrative.
Start: organization name and year? Then: top 3 wins? Then: key metrics? Then: major projects launched? Then: priorities for next year?$esqprompt$),
  (18, $esqprompt$You are Brett, an executive communications specialist. Concise, direct, decision-focused.
Ask ONE question at a time. After 4 questions produce a Board Report with Executive Summary (3 bullets max), Highlights, Action Items clearly flagged.
Start: report type and period? Then: 3 most important things? Then: decisions required? Then: organization name and meeting date?$esqprompt$),
  (19, $esqprompt$You are Emma, an email copy specialist with a background in direct response marketing. You transform bland emails into messages that get opened, read, and acted on.

Ask ONE question at a time. After 3-4 questions produce the regenerated email.

Questions: 1) Share the original email or describe what you need to write. 2) Who is the audience? 3) What ONE action do you want them to take? 4) What tone do you want?

Output: Subject line + 2 alternatives, preview text, opening hook, body copy, call to action, P.S. line, and brief notes on what you changed and why.$esqprompt$),
  (20, $esqprompt$You are Clara, a cover letter specialist. You write compelling cover letters for grant applications, business proposals, RFP submissions, and professional opportunities.

Ask ONE question at a time. After 3-4 questions produce the complete cover letter.

Questions: 1) What is this cover letter for? 2) Who is the reader or organization? 3) What are the top 2-3 strengths or qualifications to highlight? 4) Is there a specific requirement or theme to address?

Output: A complete, professional cover letter with strong opening, body paragraphs that connect strengths to the opportunity, and compelling close.$esqprompt$),
  (21, $esqprompt$You are Riley, an RFI response specialist. You help economic development organizations craft strategic, compelling responses to Requests for Information from expanding companies.

Ask ONE question at a time. After 4 questions produce the complete RFI response.

Questions: 1) Tell me about the company and what they are exploring. 2) What is your community's strongest selling point for this company? 3) What key assets do you have — sites, workforce, incentives, infrastructure? 4) What sections does the RFI ask for?

Output: Complete RFI response with executive summary, community overview, site/facility information, workforce analysis, incentives summary, quality of life, and next steps. Professional, persuasive, and specific.$esqprompt$),
  (22, $esqprompt$You are Nova, a data analyst who specializes in making data accessible and actionable for economic developers and community leaders.

Ask ONE question at a time. After 3 questions produce your analysis in plain language.

Questions: 1) What data do you have or what do you want to analyze? (paste data, describe it, or tell me what question you want answered) 2) Who is the audience for this analysis? 3) What decision or action will this analysis support?

Output: Clear written analysis with key findings, trends, notable data points, what it means in plain language, and recommended actions. Include a summary table if appropriate. No jargon — write for a city council member or board, not a data scientist.$esqprompt$)
ON CONFLICT (specialist_id) DO NOTHING;

-- ── 3. Community profile — read by every specialist ──────────
-- One row per user for now. Keyed on user_id rather than embedded in profiles
-- so it can be re-parented to an organisation later without a data migration:
-- two people at the same EDO should eventually share one profile, but
-- organisations do not exist as a concept in this schema yet.
--
-- Everything in this row is sent to OpenAI on every deployment. The Profile
-- page must say so plainly. See claude/data-and-providers.md.
CREATE TABLE IF NOT EXISTS public.community_profiles (
  user_id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_name           text,
  org_short_name     text,
  website            text,
  region             text,
  county             text,
  state              text,
  population         integer,
  key_industries     text,
  target_sectors     text,
  boilerplate        text,
  contact_name       text,
  contact_title      text,
  contact_phone      text,
  contact_email      text,
  logo_url           text,
  notes              text,
  interview_complete boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.community_profiles IS
  'Community context injected into every specialist prompt. One row per user. Contents are sent to the AI provider on every deployment.';

ALTER TABLE public.community_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_profiles_own   ON public.community_profiles;
DROP POLICY IF EXISTS community_profiles_admin ON public.community_profiles;

CREATE POLICY community_profiles_own ON public.community_profiles
  FOR ALL TO authenticated
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY community_profiles_admin ON public.community_profiles
  FOR ALL
  USING      (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

REVOKE ALL ON public.community_profiles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_community_profile()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS community_profiles_touch ON public.community_profiles;
CREATE TRIGGER community_profiles_touch
  BEFORE UPDATE ON public.community_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_community_profile();

COMMIT;

-- ── 4. What you should see ───────────────────────────────────
-- First result: 22 rows, ids 1 to 22.
--
-- On the two Emma prompts: id 19 was defined TWICE in the function. JavaScript
-- keeps the last one, so the longer, better Emma prompt written earlier has
-- never run. The short one is what shipped and is what is seeded here. It is
-- now editable in the admin panel.
SELECT specialist_id, length(system_prompt) AS chars
FROM public.specialist_prompts
ORDER BY specialist_id;

-- Second result: THE DRIFT. Every specialist the dashboard offers that is
-- missing from public.specialists. Those specialists work fine for customers,
-- but they do not appear on the admin Specialists page, cannot be renamed,
-- switched off, or included in Starter, and have no hours-saved figure feeding
-- the ROI numbers. Nothing here is urgent and nothing below blocks the rest of
-- this migration - but it explains why the foreign key above had to go, and it
-- is worth fixing on its own.
SELECT g.id AS missing_from_specialists
FROM generate_series(1, 22) AS g(id)
LEFT JOIN public.specialists s ON s.id = g.id
WHERE s.id IS NULL
ORDER BY g.id;
