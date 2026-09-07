-- supabase/migrations/20260907_trial_care_card_copy.sql
--
-- ═══════════════════════════════════════════════════════════════════════
--  FOUR MESSAGES MADE A PROMISE ABOUT MONEY THAT IS NOT TRUE FOR EVERYONE
-- ═══════════════════════════════════════════════════════════════════════
--
-- doSignup() creates the Supabase account BEFORE redirecting to Stripe. So a
-- trial member is one of two quite different people:
--
--   NO CARD   They closed the tab on the payment page. plan defaults to
--             'trial', trial_end to now()+interval, and the trial lapses.
--             Nothing is charged. There is nothing to cancel.
--
--   CARD      They completed checkout. Stripe customer, 'trialing'
--             subscription, card on file, charged automatically at trial end,
--             and a real subscription to cancel.
--
-- BOTH sit on plan = 'trial'. stripe-webhook keeps a trialing customer there on
-- purpose - "While trialing, the profile stays on 'trial' regardless of which
-- price they picked", because the UI reads plan==='trial' to draw the
-- countdown. So a single body of copy served both, and four of the messages
-- told everyone the no-card story:
--
--   stalled_day7  "the trial closes quietly - no card, no charge, nothing to
--                  cancel"                                  <- 7 days before charging them
--   trial_ending  "Nothing happens automatically when the trial ends - no
--                  card, no charge"                         <- 3 days before charging them
--   last_call     "your plan is under your avatar"          <- implies they must act to continue
--   trial_ended   "Nothing was charged"                     <- may be flatly false
--
-- Telling somebody with a card on file that they will not be charged, days
-- before charging them, is the worst thing this system could do. It is worse
-- than sending nothing.
--
-- The copy now branches. [[card]]...[[/card]] and [[no_card]]...[[/no_card]]
-- are resolved per person by send-trial-care before the merge fields, using
-- stripe_customer_id - the same test index.html uses in esqAccessLapsed - and
-- failing SAFE: an unrecognised state is treated as HAVING a card.
--
-- The main migration seeds with ON CONFLICT DO NOTHING and these rows already
-- exist, so this UPDATEs them. Anything Eric has edited by hand in Admin will
-- be overwritten for these four keys - which is the intent, because what is in
-- there now is wrong.
--
-- Safe to run twice.

BEGIN;

UPDATE public.trial_touchpoints SET body = 'Hello {{name}},

A week in and nothing run, so an honest question rather than another nudge: is this not for you?

[[no_card]]No wrong answer. If it is not, ignore this and the trial closes quietly — no card, no charge, nothing to cancel.[[/no_card]][[card]]No wrong answer — but you did put a card down when you signed up, so this one is worth two minutes rather than none. If you do nothing, the first payment goes through when the trial ends. If this is not for you, cancel under your avatar before then and you will not be charged. I would rather you chose it than drifted into it.[[/card]]

If it is more that the week got away from you, {{org}} has one grant, RFI or release somewhere in it that a specialist could draft in ten minutes. That is all it takes to find out.

And if something specifically put you off, I would rather hear it. Hit reply.

Eric'
WHERE key = 'stalled_day7';

UPDATE public.trial_touchpoints SET body = 'Hello {{name}},

Your trial has {{days_left}} days to run.

Where you have got to: {{missions}} missions, and roughly {{hours}} hours saved on the specialists'' own estimates. {{top_specialist}} has done the most work for you.

[[no_card]]Nothing happens automatically when the trial ends — no card, no charge. If you want to keep going, your plan is under your avatar. If not, no hard feelings and no follow-up.[[/no_card]][[card]]Your card is on file from signup, so the first payment goes through when the trial ends unless you cancel. That is under your avatar and takes one click, and there are no hard feelings if you use it — I would rather you chose this than drifted into it.[[/card]]

Eric'
WHERE key = 'trial_ending';

UPDATE public.trial_touchpoints SET body = 'Hello {{name}},

Your trial ends tomorrow, so this is the last one of these you will get.

You have run {{missions}} missions and saved somewhere around {{hours}} hours by our own reckoning — those numbers come from the specialists'' estimates, so take them as a guide rather than a stopwatch.

[[no_card]]If it has earned a place in your week, your plan is under your avatar at econsquad.ai. If it has not, that is genuinely useful for me to know — hit reply and tell me what was missing. I read every one.[[/no_card]][[card]]If it has earned a place in your week you need do nothing — your card is on file and the subscription simply starts. If it has not, cancel under your avatar before tomorrow and nothing will be charged. Either way, if something was missing I would value hearing it. Hit reply. I read every one.[[/card]]

Eric'
WHERE key = 'last_call';

UPDATE public.trial_touchpoints SET body = 'Hello {{name}},

[[no_card]]Your trial finished a couple of days ago. Nothing was charged and nothing was deleted — the {{missions}} missions you ran are still in your history whenever you come back.[[/no_card]][[card]]Your trial finished a couple of days ago and nothing was deleted — the {{missions}} missions you ran are still in your history whenever you come back. If a payment went through that you did not intend, reply and say so and I will sort it out.[[/card]]

If the timing was wrong rather than the product, the door stays open at econsquad.ai.

And if you got far enough to form an opinion, I would value it. One line by reply is plenty.

Eric'
WHERE key = 'trial_ended';

COMMIT;

-- Should return 4 rows, every one saying t
SELECT key,
       (body LIKE '%[[card]]%')    AS has_card_branch,
       (body LIKE '%[[no_card]]%') AS has_no_card_branch
FROM public.trial_touchpoints
WHERE key IN ('stalled_day7','trial_ending','last_call','trial_ended')
ORDER BY key;
