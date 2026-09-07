-- supabase/migrations/20260907_specialists_self_service.sql
--
-- MAKE ADDING A SPECIALIST A ONE-SCREEN JOB.
--
-- Until now, adding specialist 23 meant editing index.html in four places:
--
--   var squad=[...]           the card on the dashboard
--   var SPECIALIST_NAMES={}   the persona name, emoji and opening greeting
--   var ORB_ICONS={}          the SVG inside the orb
--   getSpecialistEmoji()      a second, shorter emoji map that stopped at 18
--
-- Miss any one of them and the failure is silent. Miss SPECIALIST_NAMES and
-- openSpecialistChat() returns on its first line, so clicking the specialist
-- does nothing at all - no error, no message. That is how ids 19 to 22 came to
-- exist for customers while being invisible in admin.
--
-- This migration moves the persona into the database, so the admin screen holds
-- everything a specialist needs to exist. After this, adding one is: fill in the
-- form, save. No deploy, no code edit.
--
-- The hardcoded maps stay in index.html as a fallback, exactly like SYSTEMS in
-- specialist-chat. A database that cannot be read means the original 22 still
-- work.

BEGIN;

-- ── 1. The persona ───────────────────────────────────────────
ALTER TABLE public.specialists ADD COLUMN IF NOT EXISTS persona_name text;
ALTER TABLE public.specialists ADD COLUMN IF NOT EXISTS emoji        text;
ALTER TABLE public.specialists ADD COLUMN IF NOT EXISTS greeting     text;

COMMENT ON COLUMN public.specialists.persona_name IS
  'The specialist''s human name - Gary, Fiona, Parker. Shown in the chat header and used by the greeting.';
COMMENT ON COLUMN public.specialists.emoji IS
  'Avatar emoji, shown on the chat bubble and in mission history.';
COMMENT ON COLUMN public.specialists.greeting IS
  'The first thing the specialist says when the chat opens. Without one, the chat opens silent.';

-- ── 2. Seed all 22, verbatim from SPECIALIST_NAMES in index.html ──
-- COALESCE, not overwrite: if a persona has already been edited in admin,
-- re-running this migration must not undo that edit.
WITH seed(id, persona_name, emoji, greeting) AS (VALUES
  (1, $esqp$Gary$esqp$, $esqp$📝$esqp$, $esqp$Hey, I'm Gary — your grant writer. I've helped communities secure millions in federal and state funding. Let's write something that gets funded. What type of project are you working on? (infrastructure, broadband, downtown revitalization, workforce, etc.)$esqp$),
  (2, $esqp$Fiona$esqp$, $esqp$🔍$esqp$, $esqp$Hi! I'm Fiona, your funding discovery specialist. I live and breathe grant databases so you don't have to. Tell me about your community and what you're trying to accomplish — I'll find the best funding matches for you.$esqp$),
  (3, $esqp$Rex$esqp$, $esqp$📋$esqp$, $esqp$Rex here. I read RFPs so carefully that I once caught a buried eligibility requirement that saved a client from a rejected application. Paste the RFP text or key requirements, and tell me about your organization — I'll handle the response.$esqp$),
  (4, $esqp$Scott$esqp$, $esqp$📍$esqp$, $esqp$Scott here — site selection is what I do. Every business attraction project lives or dies on site data quality. Tell me about the site you want evaluated — location, size, and what type of business you're trying to attract.$esqp$),
  (5, $esqp$Cara$esqp$, $esqp$📊$esqp$, $esqp$Hi, I'm Cara! I build the comparison matrices that help businesses make location decisions. What sites or communities are you comparing, and what type of project is this for?$esqp$),
  (6, $esqp$Blake$esqp$, $esqp$🤝$esqp$, $esqp$Blake here — business retention is the foundation of economic development. The right survey questions unlock everything. What is the goal of this BRE survey? (annual check-in, industry-specific, crisis response, expansion identification, etc.)$esqp$),
  (7, $esqp$Rita$esqp$, $esqp$📄$esqp$, $esqp$Hi, I'm Rita! I turn BRE data into reports that actually get read — and acted on. Tell me about your BRE program — how many businesses did you visit, and what were the main themes you heard?$esqp$),
  (8, $esqp$Ivan$esqp$, $esqp$📈$esqp$, $esqp$Ivan here. Economic impact modeling is my art — I turn project announcements into numbers that make headlines and justify incentives. Tell me about the project — what is being built or expanded, and where?$esqp$),
  (9, $esqp$Stella$esqp$, $esqp$⭐$esqp$, $esqp$Stella here. A great SWOT is a strategic mirror that reveals your real position — not just a list of obvious observations. Tell me about your community or organization and I'll build something genuinely useful.$esqp$),
  (10, $esqp$Marcus$esqp$, $esqp$🎯$esqp$, $esqp$Marcus here — market intelligence is how you win business attraction before your competitors know the prospect exists. What industry or sector are you trying to understand or target?$esqp$),
  (11, $esqp$Ivy$esqp$, $esqp$💰$esqp$, $esqp$Ivy here! I architect incentive packages that close deals without leaving money on the table. Tell me about the project — what is coming in, how big, and what are they asking for?$esqp$),
  (12, $esqp$Ted$esqp$, $esqp$💵$esqp$, $esqp$Ted here — I find tax credits that other advisors miss. We're talking real money. Tell me about the business — industry, location, and what they are planning to invest in.$esqp$),
  (13, $esqp$Parker$esqp$, $esqp$📰$esqp$, $esqp$Parker here — former journalist, current press release machine. I know what editors want and what gets picked up. What is the announcement? Give me the basics and I'll make it newsworthy.$esqp$),
  (14, $esqp$Suzie$esqp$, $esqp$📱$esqp$, $esqp$Hey! I'm Suzie — social content is my thing. I know what stops the scroll on LinkedIn and what gets shared on Facebook. What is the news or story you want to share, and which platforms are you posting on?$esqp$),
  (15, $esqp$Wade$esqp$, $esqp$👷$esqp$, $esqp$Wade here. Workforce is the number one factor in business location decisions — and most ED organizations don't have data to tell their story well. What workforce question are you trying to answer? (gap analysis, prospect response, WIOA planning, training needs, etc.)$esqp$),
  (16, $esqp$Tara$esqp$, $esqp$🎓$esqp$, $esqp$Hi, I'm Tara! Talent availability is the question every serious prospect asks, and most communities can't answer it fast enough. What industry or occupation are you building a talent report for?$esqp$),
  (17, $esqp$Annie$esqp$, $esqp$🏆$esqp$, $esqp$Annie here! Annual reports are your biggest storytelling moment of the year — let's make it count. Tell me about your organization and your biggest wins this year. Don't be modest — I'll help you frame everything perfectly.$esqp$),
  (18, $esqp$Brett$esqp$, $esqp$📌$esqp$, $esqp$Brett here. Board members are busy, skeptical, and data-driven. Your report needs to earn their confidence in the first 30 seconds. What do you need to report on?$esqp$),
  (19, $esqp$Emma$esqp$, $esqp$✉️$esqp$, $esqp$Hey! I'm Emma — your email copy specialist. I turn ignored emails into messages that get opened, read, and acted on. Tell me about the email you need — what is it for and who is the audience?$esqp$),
  (20, $esqp$Clara$esqp$, $esqp$📄$esqp$, $esqp$Hi! I'm Clara, your cover letter specialist. A great cover letter opens doors — let me help you write one that stands out. What is this cover letter for? (grant application, business proposal, RFP submission, job application, etc.)$esqp$),
  (21, $esqp$Riley$esqp$, $esqp$🎯$esqp$, $esqp$Riley here — RFI response specialist. When a company sends an RFI your response is your first impression. Let me help you make it count. Tell me about the company and what they are exploring.$esqp$),
  (22, $esqp$Nova$esqp$, $esqp$📊$esqp$, $esqp$Hi! I'm Nova, your data analyst. Give me your data or describe what you have, and I'll help you find the insights, trends, and story that matters. What data are we working with today?$esqp$)
)
UPDATE public.specialists s
   SET persona_name = COALESCE(s.persona_name, seed.persona_name),
       emoji        = COALESCE(s.emoji,        seed.emoji),
       greeting     = COALESCE(s.greeting,     seed.greeting)
  FROM seed
 WHERE s.id = seed.id;

-- ── 3. A specialist with no persona cannot open a chat ───────
-- Not a NOT NULL constraint: that would reject a half-finished row someone is
-- still filling in. A default is kinder and cannot break anything.
ALTER TABLE public.specialists ALTER COLUMN emoji SET DEFAULT '⚡';

COMMIT;

-- ── What you should see ──────────────────────────────────────
-- 22 rows, every one with a persona name, an emoji and a greeting.
-- Anything showing "MISSING" would open a chat that says nothing.
SELECT id, name, persona_name, emoji,
       CASE WHEN COALESCE(greeting,'') = '' THEN '** MISSING **'
            ELSE left(greeting, 44) || '...' END AS greeting
FROM public.specialists
ORDER BY id;
