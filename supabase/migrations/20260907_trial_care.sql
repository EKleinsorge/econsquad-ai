-- supabase/migrations/20260907_trial_care.sql
--
-- TRIAL MEMBER CARE
--
-- 78 people came to the launch. 11 subscribed. This works on the other 67.
--
-- It is not a drip sequence. A drip sends day 3 to everybody on day 3, which
-- means congratulating someone on their first draft and, in the same breath,
-- asking why they have not tried it yet. Touchpoints here are gated on what the
-- person has ACTUALLY DONE - the count of missions in task_history - so the
-- person who is using it and the person who never started get different mail,
-- and the person who is using it gets told well done rather than nagged.
--
-- THREE RULES THAT KEEP IT FROM BECOMING SPAM
--
-- 1. ONE EMAIL PER PERSON PER DAY, maximum. Two touchpoints can come due at
--    once - a milestone and a trial-ending warning on the same morning. The job
--    picks the higher priority and leaves the other for tomorrow.
-- 2. EACH TOUCHPOINT ONCE, EVER. trial_sends has a UNIQUE constraint on
--    (user_id, touchpoint_key), and the row is claimed before the send.
-- 3. IT STOPS THE MOMENT THEY SUBSCRIBE. Nothing is more corrosive than being
--    asked to convert two days after paying.
--
-- ON CHURNED CUSTOMERS - AND A TRAP WORTH KNOWING ABOUT
--
-- stripe-webhook sets `plan` back to 'trial' when a subscription is cancelled,
-- keeping subscription_status = 'canceled' and stamping canceled_at. So on a
-- naive `plan = 'trial'` query a churned customer looks exactly like a fresh
-- signup, and would be sent "welcome, here is one thing to try" days after
-- leaving. They are excluded from the trial audience by canceled_at, and get
-- their own win-back touchpoints instead.
--
-- No discount is offered anywhere in the win-back copy, deliberately. A
-- discount on cancellation teaches people that leaving produces a better price,
-- and word travels fast in a professional community this small. The offer is a
-- downgrade to Starter - a smaller customer beats no customer, and it does not
-- devalue the price for everyone who stayed.

BEGIN;

-- Lifecycle mail is its own consent. Somebody who does not want coaching about
-- their trial may still want the Monday Drop and a Christmas card, and must
-- keep receiving receipts and password resets regardless.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS lifecycle_opt_out boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.trial_touchpoints (
  key          text PRIMARY KEY,
  label        text NOT NULL,
  -- days_after_signup    : N days since profiles.created_at
  -- days_before_trial_end: N days until profiles.trial_end. NEGATIVE means
  --                        after it, so -1 is the day after the trial lapsed.
  -- missions_reached     : the moment their task_history count reaches N.
  --                        Not a date at all - it fires whenever they get
  --                        there, PROVIDED they got there in the last few
  --                        days. Without that window, switching this on emails
  --                        everyone who ever crossed the line on the same
  --                        morning: a member who ran one mission in June would
  --                        be congratulated on their first one in September.
  -- days_after_cancel    : N days since profiles.canceled_at. Win-back only.
  -- Who this is for. 'trial' = still deciding. 'cancelled' = they paid, then
  -- left. Keeping them in one table means one engine, one admin screen and one
  -- set of guarantees, but they are never mixed: a churned customer must never
  -- receive "welcome, here is one thing to try".
  audience     text NOT NULL DEFAULT 'trial' CHECK (audience IN ('trial','cancelled')),
  -- Who it comes from. The rule: whoever is named must be who actually reads
  -- the reply. ARIA can coach; ARIA cannot read your inbox. So anything asking
  -- for a reply, or asking for money, comes from Eric. Reply-to is always Eric
  -- regardless, so a reply to an ARIA email still reaches a person.
  sender       text NOT NULL DEFAULT 'eric' CHECK (sender IN ('eric','aria')),
  when_kind    text NOT NULL CHECK (when_kind IN ('days_after_signup','days_before_trial_end','missions_reached','days_after_cancel')),
  when_value   integer NOT NULL,
  -- Gates on real behaviour. min_missions 1 = only people who have used it.
  -- max_missions 0 = only people who never have.
  min_missions integer,
  max_missions integer,
  subject      text NOT NULL,
  body         text NOT NULL,
  is_enabled   boolean NOT NULL DEFAULT true,
  -- Doubles as priority when two come due on the same morning. Lower wins.
  sort_order   integer NOT NULL DEFAULT 100
);

COMMENT ON COLUMN public.trial_touchpoints.sort_order IS
  'Also the priority. When two touchpoints are due for the same person on the same day, the lower sort_order is sent and the other waits.';

CREATE TABLE IF NOT EXISTS public.trial_sends (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email          text NOT NULL,
  touchpoint_key text NOT NULL,
  missions_at_send integer,
  -- 'superseded' = they had already passed this milestone when a later one was
  -- sent, so it was closed off rather than delivered. Recording it is what
  -- stops "nice, your first one" arriving the day after "five missions in".
  status         text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','superseded')),
  detail         text,
  sent_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS trial_sends_once_idx
  ON public.trial_sends (user_id, touchpoint_key);
CREATE INDEX IF NOT EXISTS trial_sends_recent_idx ON public.trial_sends (sent_at DESC);

ALTER TABLE public.trial_touchpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trial_touchpoints_admin ON public.trial_touchpoints;
CREATE POLICY trial_touchpoints_admin ON public.trial_touchpoints
  FOR ALL USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());
REVOKE ALL ON public.trial_touchpoints FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trial_touchpoints TO authenticated;

ALTER TABLE public.trial_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trial_sends_admin ON public.trial_sends;
CREATE POLICY trial_sends_admin ON public.trial_sends
  FOR ALL USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());
REVOKE ALL ON public.trial_sends FROM anon;
GRANT SELECT ON public.trial_sends TO authenticated;

-- ── The touchpoints ──────────────────────────────────────────
--
-- Merge fields available in subject and body:
--   {{name}}            first name, or "there"
--   {{org}}             their organisation; surrounding words tidy away if unknown
--   {{missions}}        how many missions they have run
--   {{hours}}           hours saved, from the specialists' own estimates
--   {{days_left}}       days left in the trial
--   {{top_specialist}}  the specialist they use most, or "your first specialist"
--
-- Conditional blocks, because there are TWO kinds of trial member and the
-- difference is money:
--
--   [[no_card]]...[[/no_card]]   they closed the tab on the Stripe page. No
--                                card, nothing charged, nothing to cancel.
--   [[card]]...[[/card]]         they completed checkout. Card on file, and
--                                they WILL be charged when the trial ends.
--
-- Both sit on plan = 'trial' - stripe-webhook keeps a trialing customer there
-- so the countdown renders - so one body of copy cannot serve both. Telling a
-- card-holder "no card, no charge, nothing to cancel" three days before
-- charging them is the worst thing this system could do, so any paragraph
-- making a claim about money must be written in both halves.
--
-- The copy is written to be from Eric, short, and specific. It is deliberately
-- not marketing-voiced: these people are economic development professionals who
-- get pitched all day. Change any of it in Admin → Trial Care.

INSERT INTO public.trial_touchpoints
  (key, label, audience, sender, when_kind, when_value, min_missions, max_missions, is_enabled, sort_order, subject, body)
VALUES

  ('last_call', 'Trial ends tomorrow', 'trial', 'eric', 'days_before_trial_end', 1, NULL, NULL, true, 5,
   'Your EconSquad trial ends tomorrow',
   'Hello {{name}},

Your trial ends tomorrow, so this is the last one of these you will get.

You have run {{missions}} missions and saved somewhere around {{hours}} hours by our own reckoning — those numbers come from the specialists'' estimates, so take them as a guide rather than a stopwatch.

[[no_card]]If it has earned a place in your week, your plan is under your avatar at econsquad.ai. If it has not, that is genuinely useful for me to know — hit reply and tell me what was missing. I read every one.[[/no_card]][[card]]If it has earned a place in your week you need do nothing — your card is on file and the subscription simply starts. If it has not, cancel under your avatar before tomorrow and nothing will be charged. Either way, if something was missing I would value hearing it. Hit reply. I read every one.[[/card]]

Eric'),

  ('welcome', 'Day 1 — one thing to try', 'trial', 'aria', 'days_after_signup', 1, NULL, NULL, true, 10,
   'One thing worth 10 minutes today',
   'Hi {{name}} — I am ARIA. I look after your squad.

A suggestion for your first ten minutes, because a blank page is the hardest part:

Pick something already on your desk this week — a grant narrative, an RFI, a press release, a BRE survey — and hand it to the specialist for that job. Not a test task. A real one. They will ask you a few questions and give you back a draft you can take into a meeting.

That is the whole thing. Everything else is detail.

I will be here when you open it.

ARIA

P.S. If something does not work, hit reply. That one goes to Eric, who reads them himself.'),

  ('trial_ending', 'Three days left', 'trial', 'eric', 'days_before_trial_end', 3, NULL, NULL, true, 15,
   '{{days_left}} days left on your trial',
   'Hello {{name}},

Your trial has {{days_left}} days to run.

Where you have got to: {{missions}} missions, and roughly {{hours}} hours saved on the specialists'' own estimates. {{top_specialist}} has done the most work for you.

[[no_card]]Nothing happens automatically when the trial ends — no card, no charge. If you want to keep going, your plan is under your avatar. If not, no hard feelings and no follow-up.[[/no_card]][[card]]Your card is on file from signup, so the first payment goes through when the trial ends unless you cancel. That is under your avatar and takes one click, and there are no hard feelings if you use it — I would rather you chose this than drifted into it.[[/card]]

Eric'),

  ('first_win', 'They ran their first mission', 'trial', 'aria', 'missions_reached', 1, NULL, NULL, true, 20,
   'Nice — first one done',
   'Nice work, {{name}}.

You just ran your first mission with {{top_specialist}}. That is the hard part over.

One thing worth knowing now rather than later: we work best when you treat us like a colleague who has just joined. Give us the messy detail — the real numbers, the awkward constraint, the thing the board actually cares about — and the draft comes back usable. Keep it vague and you get something that reads like a brochure.

There are 21 more of us. {{org}} probably has work for a few.

ARIA'),

  ('momentum', 'Five missions in — ask for feedback', 'trial', 'eric', 'missions_reached', 5, NULL, NULL, true, 25,
   'Five missions in — can I ask you something?',
   'Hello {{name}},

Five missions. You are properly using this now, which puts you ahead of most people who sign up, and I wanted to say so.

Which means you are the right person to ask: what is missing?

Not a survey — just hit reply and tell me one thing. The specialist you wish existed, the step that is still clunky, the output that needed too much cleaning up. That is how the roster grows, and it is how {{top_specialist}} got better than it started.

I read every reply myself.

Eric'),

  ('nudge_day3', 'Day 3 — nothing run yet', 'trial', 'aria', 'days_after_signup', 3, NULL, 0, true, 30,
   'Stuck on where to start?',
   'Hi {{name}},

You signed up a few days ago and have not run anything yet. That is usually one of two things, and I can help with both.

If it is not knowing where to begin: open the Grant Writer or the Press Release specialist and paste in something you are already working on. They ask questions rather than expecting a perfect prompt.

If the thing you needed was not there: hit reply and say what it was. That one goes to Eric, and it is more useful to him than any feature request form.

Either way it is about ten minutes to find out whether we are worth your time.

ARIA'),

  ('feedback_day7', 'Day 7 — how is it going?', 'trial', 'eric', 'days_after_signup', 7, 1, NULL, true, 40,
   'A week in — how is it going?',
   'Hello {{name}},

A week in, {{missions}} missions done. Genuine question, and a short one:

What has worked, and what has annoyed you?

Hit reply with a sentence on either. I am still small enough to act on it quickly, and the things people tell me at this stage are what shape the roster.

Eric'),

  ('stalled_day7', 'Day 7 — still nothing run', 'trial', 'eric', 'days_after_signup', 7, NULL, 0, true, 45,
   'Should I close your trial?',
   'Hello {{name}},

A week in and nothing run, so an honest question rather than another nudge: is this not for you?

[[no_card]]No wrong answer. If it is not, ignore this and the trial closes quietly — no card, no charge, nothing to cancel.[[/no_card]][[card]]No wrong answer — but you did put a card down when you signed up, so this one is worth two minutes rather than none. If you do nothing, the first payment goes through when the trial ends. If this is not for you, cancel under your avatar before then and you will not be charged. I would rather you chose it than drifted into it.[[/card]]

If it is more that the week got away from you, {{org}} has one grant, RFI or release somewhere in it that a specialist could draft in ten minutes. That is all it takes to find out.

And if something specifically put you off, I would rather hear it. Hit reply.

Eric'),

  ('trial_ended', 'Two days after the trial ended', 'trial', 'eric', 'days_before_trial_end', -2, NULL, NULL, true, 50,
   'Your work is still there',
   'Hello {{name}},

[[no_card]]Your trial finished a couple of days ago. Nothing was charged and nothing was deleted — the {{missions}} missions you ran are still in your history whenever you come back.[[/no_card]][[card]]Your trial finished a couple of days ago and nothing was deleted — the {{missions}} missions you ran are still in your history whenever you come back. If a payment went through that you did not intend, reply and say so and I will sort it out.[[/card]]

If the timing was wrong rather than the product, the door stays open at econsquad.ai.

And if you got far enough to form an opinion, I would value it. One line by reply is plenty.

Eric'),

  ('winback_ask', 'Cancelled — what went wrong?', 'cancelled', 'eric', 'days_after_cancel', 1, NULL, NULL, true, 60,
   'What did we get wrong?',
   'Hello {{name}},

Your subscription was cancelled, and I would rather ask than guess: what did we get wrong?

One line by reply is plenty. Too expensive, not enough of the right specialists, output that needed too much cleaning up, or simply the wrong time — all of it is useful, and none of it gets you a sales call.

If it was the price specifically, Starter is the lighter plan and keeps the core specialists. You can move to it from your avatar at econsquad.ai rather than leaving altogether. I would rather have you on Starter than not at all.

Either way, thank you for having tried it.

Eric'),

  ('winback_open', 'A week after cancelling', 'cancelled', 'eric', 'days_after_cancel', 7, NULL, NULL, true, 65,
   'Your work is still there',
   'Hello {{name}},

Nothing has been deleted. The {{missions}} missions you ran are still in your history, and they stay there.

No ask in this one — just so you know where things stand.

Eric'),

  ('winback_news', 'Six weeks on — what changed', 'cancelled', 'eric', 'days_after_cancel', 45, NULL, NULL, false, 70,
   'A few things changed since you left',
   'Hello {{name}},

It has been a few weeks, so a short note rather than a campaign.

[WRITE THIS BEFORE SWITCHING IT ON. Two or three lines on what has actually
changed since they left — the specialists added, the thing they complained
about that now works. A list of real improvements is worth reading. "Lots of
exciting updates" is not, and will cost you the little goodwill left.]

If any of that was what was missing, the door is open at econsquad.ai.

Eric')

ON CONFLICT (key) DO NOTHING;

COMMIT;

-- ── What you should see ──────────────────────────────────────
-- Nine touchpoints. The "when" column reads as the rule, not a date.
SELECT sort_order AS priority, key, label, audience, sender, is_enabled,
       CASE when_kind
         WHEN 'days_after_signup'     THEN 'day ' || when_value || ' after signup'
         WHEN 'days_before_trial_end' THEN CASE WHEN when_value >= 0
                                                THEN when_value || ' days before trial ends'
                                                ELSE abs(when_value) || ' days AFTER trial ends' END
         WHEN 'missions_reached'      THEN 'when they reach ' || when_value || ' mission(s)'
         WHEN 'days_after_cancel'     THEN when_value || ' days after they cancelled'
       END AS fires,
       COALESCE('min ' || min_missions, '') || COALESCE(' max ' || max_missions, '') AS gates
FROM public.trial_touchpoints
ORDER BY sort_order;

-- Who is currently in a trial and could receive these.
SELECT count(*) FILTER (WHERE plan = 'trial')                          AS on_trial,
       count(*) FILTER (WHERE plan = 'trial' AND lifecycle_opt_out)    AS opted_out,
       count(*) FILTER (WHERE plan = 'trial' AND COALESCE(is_beta_tester,false)) AS comped_skipped
FROM public.profiles;
