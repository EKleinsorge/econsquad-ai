-- supabase/migrations/20260907_greetings.sql
--
-- HOLIDAY AND BIRTHDAY GREETINGS, SENT WITHOUT YOU.
--
-- A daily job asks "is anything due today?" and sends it. Nothing to remember,
-- nothing to trigger. You edit the words in admin; the schedule takes care of
-- itself, every year.
--
-- THREE THINGS THIS GETS RIGHT THAT ARE EASY TO GET WRONG
--
-- 1. Floating holidays. Thanksgiving is the fourth Thursday in November, not a
--    date. Memorial Day is the LAST Monday in May. Hardcoding 2026's dates
--    means silence in 2027. Occasions store a rule - fixed day, or nth weekday
--    of a month - and the date is computed each year.
--
-- 2. Sending twice. A cron that runs twice, a retry, a manual trigger - any of
--    them could send the same greeting to the same person again. greeting_sends
--    has a UNIQUE constraint on (user_id, kind, occasion_key, year). The
--    database refuses the second one; no code has to remember.
--
-- 3. Opting out. A greeting is a marketing email whatever its tone. Every
--    member gets their own unsubscribe token, and opting out of greetings does
--    not unsubscribe them from anything transactional.

BEGIN;

-- ── 1. Members: birthday, opt-out, and their own token ───────
-- Month and day, not a date. Nobody wants to disclose their birth year to get
-- a card, and a date column invites a fake year that then shows up somewhere.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_month   smallint;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_day     smallint;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS greetings_opt_out boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS greetings_token uuid;

DO $c$
BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_birth_month_valid
    CHECK (birth_month IS NULL OR (birth_month BETWEEN 1 AND 12));
EXCEPTION WHEN duplicate_object THEN NULL; END $c$;

DO $c$
BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_birth_day_valid
    CHECK (birth_day IS NULL OR (birth_day BETWEEN 1 AND 31));
EXCEPTION WHEN duplicate_object THEN NULL; END $c$;

UPDATE public.profiles SET greetings_token = gen_random_uuid() WHERE greetings_token IS NULL;
ALTER TABLE public.profiles ALTER COLUMN greetings_token SET DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS profiles_greetings_token_idx ON public.profiles (greetings_token);

-- ── 2. The occasions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.greeting_occasions (
  key             text PRIMARY KEY,
  label           text NOT NULL,
  -- Fixed date: month + day, floating_nth NULL.  Christmas = (12, 25, NULL, NULL)
  -- Floating:   month + floating_nth + floating_weekday, day NULL.
  --             Thanksgiving = (11, NULL, 4, 4)  -> 4th Thursday of November
  --             Memorial Day = (5,  NULL, -1, 1) -> LAST Monday of May
  month            smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  day              smallint          CHECK (day IS NULL OR day BETWEEN 1 AND 31),
  floating_nth     smallint          CHECK (floating_nth IS NULL OR floating_nth BETWEEN -1 AND 5),
  floating_weekday smallint          CHECK (floating_weekday IS NULL OR floating_weekday BETWEEN 0 AND 6),
  send_days_before smallint NOT NULL DEFAULT 0,
  subject          text NOT NULL,
  body             text NOT NULL,
  is_enabled       boolean NOT NULL DEFAULT false,
  sort_order       smallint NOT NULL DEFAULT 100,
  CONSTRAINT greeting_occasion_has_a_rule CHECK (
    (day IS NOT NULL AND floating_nth IS NULL AND floating_weekday IS NULL)
    OR
    (day IS NULL AND floating_nth IS NOT NULL AND floating_weekday IS NOT NULL)
  )
);

COMMENT ON CONSTRAINT greeting_occasion_has_a_rule ON public.greeting_occasions IS
  'Either a fixed day of the month, or an nth weekday of the month. A row with both, or neither, is a greeting that never fires - refuse it at the door.';

COMMENT ON COLUMN public.greeting_occasions.floating_weekday IS
  '0 = Sunday through 6 = Saturday, matching JavaScript getDay(). floating_nth of -1 means the last one in the month.';

-- ── 3. What was sent, and the guard against sending twice ────
CREATE TABLE IF NOT EXISTS public.greeting_sends (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('holiday','birthday')),
  occasion_key  text NOT NULL,
  year          smallint NOT NULL,
  status        text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed')),
  detail        text,
  sent_at       timestamptz NOT NULL DEFAULT now()
);

-- The whole idempotency story, in one line.
CREATE UNIQUE INDEX IF NOT EXISTS greeting_sends_once_idx
  ON public.greeting_sends (user_id, kind, occasion_key, year);

CREATE INDEX IF NOT EXISTS greeting_sends_recent_idx ON public.greeting_sends (sent_at DESC);

-- ── 4. Who can see any of this ───────────────────────────────
ALTER TABLE public.greeting_occasions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS greeting_occasions_admin ON public.greeting_occasions;
CREATE POLICY greeting_occasions_admin ON public.greeting_occasions
  FOR ALL USING (public.is_current_user_admin())
         WITH CHECK (public.is_current_user_admin());
REVOKE ALL ON public.greeting_occasions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.greeting_occasions TO authenticated;

ALTER TABLE public.greeting_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS greeting_sends_admin ON public.greeting_sends;
CREATE POLICY greeting_sends_admin ON public.greeting_sends
  FOR ALL USING (public.is_current_user_admin())
         WITH CHECK (public.is_current_user_admin());
REVOKE ALL ON public.greeting_sends FROM anon;
GRANT SELECT ON public.greeting_sends TO authenticated;

-- ── 5. The occasions themselves ──────────────────────────────
--
-- Only four are ON. The rest are seeded, written, and switched off, so turning
-- one on is a click rather than a writing exercise at 11pm the night before.
--
-- December is "Season's Greetings", not "Merry Christmas", and that is
-- deliberate: this list goes to economic development professionals across every
-- background, many forwarding it inside a public agency. A warm note nobody has
-- to be a particular religion to enjoy is the safer and friendlier default.
-- Change it in admin if you would rather be specific.
--
-- {{name}} is replaced with the member's first name, or "there" when we have no
-- name. {{org}} with their organisation, or nothing.

INSERT INTO public.greeting_occasions
  (key, label, month, day, floating_nth, floating_weekday, send_days_before, is_enabled, sort_order, subject, body)
VALUES
  ('new_year', 'New Year''s Day', 1, 1, NULL, NULL, 0, true, 10,
   'Happy New Year from EconSquad AI',
   'Happy New Year, {{name}}.

Whatever last year looked like for {{org}}, a new one is a good excuse to pick the project that has been waiting.

We hope this year brings the wins you have been working toward — the grant that lands, the company that chooses you, the site that finally moves.

Thank you for letting us be a small part of it.

Eric and the EconSquad team'),

  ('mlk_day', 'Martin Luther King Jr. Day', 1, NULL, 3, 1, 0, false, 20,
   'Reflecting today',
   'Hello {{name}},

Today the country marks Martin Luther King Jr. Day.

Economic development, at its best, is about who gets to share in the prosperity a place creates. That is worth a moment of thought today.

Wishing you and {{org}} a meaningful day.

Eric and the EconSquad team'),

  ('memorial_day', 'Memorial Day', 5, NULL, -1, 1, 0, false, 30,
   'Remembering today',
   'Hello {{name}},

Wishing you a peaceful Memorial Day.

We hope you get some genuine time away from the inbox, and a moment to remember those the day is for.

Eric and the EconSquad team'),

  ('independence_day', 'Independence Day', 7, 4, NULL, NULL, 0, true, 40,
   'Happy Fourth of July',
   'Happy Fourth, {{name}}.

We hope you are somewhere good, with people you like, well away from a laptop.

The grant deadline will still be there on Monday. Enjoy the weekend.

Eric and the EconSquad team'),

  ('labor_day', 'Labor Day', 9, NULL, 1, 1, 0, true, 50,
   'Happy Labor Day',
   'Hello {{name}},

Happy Labor Day.

It seems a fitting one to send from us: your work is about jobs, and the people who hold them. We hope you get a proper day off from it.

Eric and the EconSquad team'),

  ('veterans_day', 'Veterans Day', 11, 11, NULL, NULL, 0, false, 60,
   'Thank you today',
   'Hello {{name}},

Today is Veterans Day.

To those of you who served, and to the veterans in the workforce you are building at {{org}} — thank you.

Eric and the EconSquad team'),

  ('thanksgiving', 'Thanksgiving', 11, NULL, 4, 4, 1, true, 70,
   'Thank you, from all of us at EconSquad',
   'Hello {{name}},

Thanksgiving tomorrow, so this is the honest version: thank you.

You chose to try something new in a field where that is not always easy, and you gave us your feedback, your bug reports and your patience while we got it right. {{org}} is better at what it does than the software is, and we know it.

We hope the table is full and the week is quiet.

Eric and the EconSquad team'),

  ('season_greetings', 'Season''s Greetings (December)', 12, 20, NULL, NULL, 0, true, 80,
   'Season''s greetings from EconSquad AI',
   'Hello {{name}},

Season''s greetings from all of us.

Whatever you are marking this month, we hope it comes with a proper break and some time with the people you like most.

Thank you for a good year. We will see you in January, refreshed and ready for whatever {{org}} takes on next.

Eric and the EconSquad team')
ON CONFLICT (key) DO NOTHING;

-- ── 6. Birthdays are an occasion too, so the log can key on it ──
INSERT INTO public.greeting_occasions
  (key, label, month, day, floating_nth, floating_weekday, send_days_before, is_enabled, sort_order, subject, body)
VALUES
  ('birthday', 'Birthdays', 1, 1, NULL, NULL, 0, false, 5,
   'Happy birthday, {{name}}',
   'Happy birthday, {{name}}.

No pitch, no product news — just a note from us to say we hope the day is a good one and that somebody else is handling your inbox.

Enjoy it.

Eric and the EconSquad team')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.greeting_occasions IS
  'The birthday row is a template, not a date - its month and day are ignored. Birthdays fire from profiles.birth_month / birth_day.';

COMMIT;

-- ── What you should see ──────────────────────────────────────
-- Nine occasions. Four holidays on, the rest written and waiting.
-- Birthdays are OFF because nobody has a birthday on file yet - the field has
-- to appear in member settings and be filled in before that can do anything.
SELECT key, label, is_enabled,
       CASE WHEN day IS NOT NULL THEN 'fixed: month ' || month || ' day ' || day
            ELSE 'floating: ' ||
                 CASE floating_nth WHEN -1 THEN 'last' ELSE floating_nth::text END ||
                 ' weekday ' || floating_weekday || ' of month ' || month END AS rule,
       send_days_before AS days_early
FROM public.greeting_occasions
ORDER BY sort_order;

-- How many people could receive one today.
SELECT count(*) FILTER (WHERE COALESCE(NULLIF(TRIM(email),''),'') <> '')        AS reachable_members,
       count(*) FILTER (WHERE greetings_opt_out)                                AS opted_out,
       count(*) FILTER (WHERE birth_month IS NOT NULL AND birth_day IS NOT NULL) AS birthdays_on_file
FROM public.profiles;
