/* Tests for the cold-start defect the first dry run exposed.
 *
 * The run reported five emails. Two were to staff addresses. Two more were
 * "you just ran your first mission" to people who had run 20 and 1 - the
 * second of those months earlier. This file is the proof that neither can
 * happen again. */

// Importing the module runs Deno.serve, which would start a real listener and
// hang the test process. Stub it, then import dynamically.
const realServe = (Deno as any).serve;
(Deno as any).serve = () => ({ finished: Promise.resolve(), shutdown() {} });
const M = await import('./index.ts');
(Deno as any).serve = realServe;

const { isInternal, crossedAt, matches, dueFor, supersededMilestones,
        supersededTouchpoints } = M as any;

const NOW = '2026-09-07T14:00:00.000Z';
const daysAgo = (n: number, h = 12) => {
  const d = new Date(Date.UTC(2026, 8, 7 - n, h, 0, 0));
  return d.toISOString();
};

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

function person(o: Record<string, unknown> = {}): any {
  return {
    id: 'u1', email: 'someone@example.com', full_name: 'Sam Reed', organization: 'Example EDC',
    plan: 'trial', subscription_status: null, is_beta_tester: false, lifecycle_opt_out: false,
    created_at: daysAgo(6), trial_end: null, greetings_token: 'tok',
    canceled_at: null, audience: 'trial', daysSinceCancel: null,
    missions: 0, hours: 0, topSpecialist: null, missionDates: [],
    stripe_customer_id: null, hasCard: false,
    daysSinceSignup: 6, daysToTrialEnd: 8,
    ...o,
  };
}

function tp(o: Record<string, unknown> = {}): any {
  return {
    key: 'first_win', label: 'First win', audience: 'trial', sender: 'aria',
    when_kind: 'missions_reached', when_value: 1, min_missions: null, max_missions: null,
    subject: 's', body: 'b', is_enabled: true, sort_order: 20,
    ...o,
  };
}

const FIRST_WIN = tp({ key: 'first_win', when_value: 1, sort_order: 20 });
const MOMENTUM  = tp({ key: 'momentum', when_value: 5, sort_order: 25, sender: 'eric' });
const STALLED   = tp({ key: 'stalled_day7', when_kind: 'days_after_signup', when_value: 7,
                       max_missions: 0, sort_order: 45, sender: 'eric' });
const ROSTER = [FIRST_WIN, MOMENTUM, STALLED];
const NONE = new Set<string>();

console.log('\nSTAFF ARE NOT PROSPECTS');
ok('eric@gslisolutions.com is internal',        isInternal('eric@gslisolutions.com') === true);
ok('cindy@gslisolutions.com is internal',       isInternal('cindy@gslisolutions.com') === true);
ok('case and whitespace do not evade it',       isInternal('  Eric@GSLISolutions.COM ') === true);
ok('a subdomain is internal too',               isInternal('a@mail.gslisolutions.com') === true);
ok('a real member is not internal',             isInternal('isaac@steubenedc.com') === false);
ok('econsquad.ai is NOT internal',              isInternal('someone@econsquad.ai') === false);
ok('a lookalike domain is not internal',        isInternal('a@notgslisolutions.com') === false);
ok('rubbish input does not throw',              isInternal('') === false && isInternal('no-at-sign') === false);

console.log('\nWHEN DID THEY CROSS IT');
const five = person({ missions: 5, missionDates: [daysAgo(5), daysAgo(4), daysAgo(3), daysAgo(2), daysAgo(1)] });
ok('first mission is the 1st timestamp',        crossedAt(five, 1) === daysAgo(5));
ok('fifth mission is the 5th timestamp',        crossedAt(five, 5) === daysAgo(1));
ok('a milestone never reached is null',         crossedAt(five, 9) === null);
ok('no timestamps at all is null, not now',     crossedAt(person({ missions: 3 }), 1) === null);

console.log('\nTHE COLD START — the founder must not be congratulated on his first mission');
const founder = person({ email: 'eric@gslisolutions.com', missions: 20, daysSinceSignup: 134,
                         missionDates: Array.from({ length: 20 }, (_, i) => daysAgo(120 - i)) });
ok('20 missions, last one months ago: no first_win', matches(FIRST_WIN, founder, NOW) === false);
ok('...and no momentum either',                      matches(MOMENTUM, founder, NOW) === false);
ok('...so nothing at all is due for him',            dueFor(ROSTER, founder, NONE, NOW).length === 0);

const dormant = person({ email: 'cindy@example.com', missions: 1, daysSinceSignup: 61,
                         missionDates: [daysAgo(55)] });
ok('one mission 55 days ago is not a first win',     matches(FIRST_WIN, dormant, NOW) === false);
ok('...and nothing is sent to her today',            dueFor(ROSTER, dormant, NONE, NOW).length === 0);

console.log('\nBUT A REAL FIRST WIN STILL FIRES');
const isaac = person({ email: 'isaac@steubenedc.com', missions: 1, missionDates: [daysAgo(1)] });
ok('one mission yesterday IS a first win',           matches(FIRST_WIN, isaac, NOW) === true);
ok('it is what gets sent',                           dueFor(ROSTER, isaac, NONE, NOW)[0].key === 'first_win');
ok('crossed today counts',                           matches(FIRST_WIN, person({ missions: 1, missionDates: [daysAgo(0)] }), NOW) === true);
ok('crossed 4 days ago still counts (Fri to Mon)',   matches(FIRST_WIN, person({ missions: 1, missionDates: [daysAgo(4)] }), NOW) === true);
ok('crossed 5 days ago does not',                    matches(FIRST_WIN, person({ missions: 1, missionDates: [daysAgo(5)] }), NOW) === false);
ok('a future timestamp is not treated as recent',    matches(FIRST_WIN, person({ missions: 1, missionDates: [daysAgo(-3)] }), NOW) === false);

console.log('\nTWO MILESTONES AT ONCE — send the highest, close off the rest');
const fast = person({ email: 'meridianedc@outlook.com', missions: 5,
                      missionDates: [daysAgo(3), daysAgo(3), daysAgo(2), daysAgo(1), daysAgo(1)] });
const dueFast = dueFor(ROSTER, fast, NONE, NOW);
ok('both milestones genuinely qualify',              matches(FIRST_WIN, fast, NOW) && matches(MOMENTUM, fast, NOW));
ok('only one is planned',                            dueFast.length === 1);
ok('and it is the FIFTH, not the first',             dueFast[0].key === 'momentum');
ok('first_win is recorded as superseded',            supersededMilestones(ROSTER, fast, NONE, NOW).join() === 'first_win');
ok('so it cannot arrive tomorrow',                   dueFor(ROSTER, fast, new Set(['momentum', 'first_win']), NOW).length === 0);

console.log('\nNOTHING ELSE MOVED');
const stalledPerson = person({ missions: 0, daysSinceSignup: 7, missionDates: [] });
ok('day-7 stalled still fires on day 7',             matches(STALLED, stalledPerson, NOW) === true);
ok('...and is the one chosen',                       dueFor(ROSTER, stalledPerson, NONE, NOW)[0].key === 'stalled_day7');
ok('a date touchpoint cannot back-date itself',      matches(STALLED, person({ missions: 0, daysSinceSignup: 30 }), NOW) === false);
ok('one milestone alone is never superseded',        supersededMilestones(ROSTER, isaac, NONE, NOW).length === 0);
ok('a churned person still gets no trial mail',      matches(FIRST_WIN, person({ audience: 'cancelled', missions: 1, missionDates: [daysAgo(1)] }), NOW) === false);
ok('a disabled milestone stays disabled',            dueFor([{ ...FIRST_WIN, is_enabled: false }], isaac, NONE, NOW).length === 0);
ok('an already-sent milestone does not repeat',      dueFor(ROSTER, isaac, new Set(['first_win']), NOW).length === 0);

console.log('\nTWO KINDS OF TRIAL MEMBER — the difference is money');
const { hasCardOnFile, applyConditionals, fillTemplate } = M as any;
const TEMPLATE = 'Hello {{name}},\n\n[[no_card]]Nothing is charged and there is nothing to cancel.[[/no_card]][[card]]Your card is on file, so you will be charged unless you cancel.[[/card]]\n\nEric';
const carded   = person({ hasCard: true,  stripe_customer_id: 'cus_1' });
const uncarded = person({ hasCard: false, stripe_customer_id: null });

ok('a stripe customer has a card',              hasCardOnFile({ stripe_customer_id: 'cus_1' }) === true);
ok('a trialing subscription has a card',        hasCardOnFile({ subscription_status: 'trialing' }) === true);
ok('past_due still means a card is on file',    hasCardOnFile({ subscription_status: 'past_due' }) === true);
ok('no customer and no status means no card',   hasCardOnFile({ stripe_customer_id: null, subscription_status: null }) === false);
ok('canceled alone is not a card',              hasCardOnFile({ subscription_status: 'canceled' }) === false);

const withCard = fillTemplate(TEMPLATE, carded);
const noCard   = fillTemplate(TEMPLATE, uncarded);
ok('a card-holder is never told nothing is charged', withCard.indexOf('nothing to cancel') === -1);
ok('a card-holder is told they will be charged',     withCard.indexOf('you will be charged') !== -1);
ok('someone with no card is not told to cancel',     noCard.indexOf('unless you cancel') === -1);
ok('no marker survives either render',               withCard.indexOf('[[') === -1 && noCard.indexOf('[[') === -1);
ok('the two versions really differ',                 withCard !== noCard);
ok('an unclosed tag never reaches a customer',       applyConditionals('a [[card]] b', carded).indexOf('[[') === -1);
ok('a stray closing tag never reaches one either',   applyConditionals('a [[/no_card]] b', carded).indexOf('[[') === -1);
ok('text with no tags is left alone',                applyConditionals('plain text', carded) === 'plain text');
ok('a dropped branch leaves no blank-line scar',     applyConditionals('one\n\n[[no_card]]two[[/no_card]]\n\nthree', carded) === 'one\n\nthree');

console.log('\nA DRAFT MUST NOT BE ABLE TO SEND ITSELF');
const { isDraft } = M as any;
const NEWS_BODY = 'Hello {{name}},\n\nIt has been a few weeks, so a short note rather than a campaign.\n\n[WRITE THIS BEFORE SWITCHING IT ON. Two or three lines on what has actually changed since they left.]\n\nEric';
const WINBACK_NEWS = tp({ key: 'winback_news', when_kind: 'days_after_cancel', when_value: 45,
                          audience: 'cancelled', body: NEWS_BODY, is_enabled: true, sort_order: 70 });
const churned = person({ audience: 'cancelled', daysSinceCancel: 45, subscription_status: 'canceled',
                         canceled_at: daysAgo(45) });

ok('the real winback_news body is a draft',      isDraft(WINBACK_NEWS) === true);
ok('finished copy is not',                       isDraft(tp({ body: 'Hello there.\n\nGmail now stays connected.\n\nEric' })) === false);
ok('a card tag is syntax, not a placeholder',    isDraft(tp({ body: 'a [[no_card]]nothing is charged and there is nothing at all to cancel[[/no_card]] b' })) === false);
ok('a short bracketed aside is allowed',         isDraft(tp({ body: 'the roster [22 of them] is complete' })) === false);
ok('a placeholder in the subject counts too',    isDraft(tp({ subject: '[SUBJECT STILL TO BE WRITTEN BEFORE THIS GOES OUT]', body: 'ok' })) === true);

ok('SWITCHED ON, it is still not sent',          dueFor([WINBACK_NEWS], churned, NONE, NOW).length === 0);
ok('...and it does not silently vanish either',  isDraft(WINBACK_NEWS) && WINBACK_NEWS.is_enabled);
ok('the same touchpoint finished DOES send',
   dueFor([{ ...WINBACK_NEWS, body: 'Hello,\n\nGmail now stays connected.\n\nEric' }], churned, NONE, NOW).length === 1);
ok('a draft is never recorded as superseded',
   supersededMilestones([{ ...FIRST_WIN, body: NEWS_BODY }, MOMENTUM], fast, NONE, NOW).indexOf('first_win') === -1);

/* ─────────────────────────────────────────────────────────────────────
   THE WEEKEND HOLE
   The job runs weekdays only, and every dated touchpoint used to compare
   for equality, so a message due on a Saturday was never sent at all -
   the once-ever index meant it could not come back. Measured 11 Sep 2026:
   nine trials ending Tue 15 Sep lost their 3-day warning, one ending Mon
   14 Sep lost its last call.

   These tests fix both halves of the repair in place: that a late message
   is still caught, and that catch-up is BOUNDED so it never becomes the
   cold start in a new costume.
   ───────────────────────────────────────────────────────────────────── */
console.log('\nTHE WEEKEND HOLE — a late message is still sent');

const WELCOME  = tp({ key: 'welcome', when_kind: 'days_after_signup', when_value: 1, sort_order: 10 });
const ENDING   = tp({ key: 'trial_ending', when_kind: 'days_before_trial_end', when_value: 3, sort_order: 50, sender: 'eric' });
const LASTCALL = tp({ key: 'last_call',    when_kind: 'days_before_trial_end', when_value: 1, sort_order: 55, sender: 'eric' });
const ENDED    = tp({ key: 'trial_ended',  when_kind: 'days_before_trial_end', when_value: -2, sort_order: 60, sender: 'eric' });
const WB_ASK   = tp({ key: 'winback_ask',  when_kind: 'days_after_cancel', when_value: 1, audience: 'cancelled', sort_order: 70, sender: 'eric' });

const atEnd = (n: number) => person({ daysToTrialEnd: n });

ok('3-day warning on the day it is due',        matches(ENDING, atEnd(3), NOW) === true);
ok('...still sent one day late (Sunday run)',   matches(ENDING, atEnd(2), NOW) === true);
ok('...still sent two days late (Mon after a Sat)', matches(ENDING, atEnd(1), NOW) === true);
ok('...still sent three days late, the limit',  matches(ENDING, atEnd(0), NOW) === true);
ok('...NOT four days late - the window is shut', matches(ENDING, atEnd(-1), NOW) === false);

/* The counters run in opposite directions and getting it backwards would
   send the last call days EARLY, which is worse than sending it late. */
ok('never sent EARLY - one day before it is due', matches(ENDING, atEnd(4), NOW) === false);
ok('never sent early - a week before',            matches(ENDING, atEnd(10), NOW) === false);
ok('last call is not sent three days out',        matches(LASTCALL, atEnd(3), NOW) === false);
ok('last call on the day',                        matches(LASTCALL, atEnd(1), NOW) === true);
ok('last call caught up after the weekend',       matches(LASTCALL, atEnd(-1), NOW) === true);
ok('trial_ended fires 2 days after, as a negative', matches(ENDED, atEnd(-2), NOW) === true);
ok('...and not before the trial has ended',       matches(ENDED, atEnd(0), NOW) === false);
ok('nobody without a trial_end is ever dated',    matches(ENDING, person({ daysToTrialEnd: null }), NOW) === false);

console.log('\nCATCH-UP IS BOUNDED — the back catalogue stays where it is');
ok('welcome on day 1',                          matches(WELCOME, person({ daysSinceSignup: 1 }), NOW) === true);
ok('welcome caught up on day 4',                matches(WELCOME, person({ daysSinceSignup: 4 }), NOW) === true);
ok('NOT on day 5',                              matches(WELCOME, person({ daysSinceSignup: 5 }), NOW) === false);
ok('NOT on day 60 - this is the cold start',    matches(WELCOME, person({ daysSinceSignup: 60 }), NOW) === false);
ok('not on day 0 either',                       matches(WELCOME, person({ daysSinceSignup: 0 }), NOW) === false);
ok('stalled_day7 is caught up at day 10',       matches(STALLED, person({ missions: 0, daysSinceSignup: 10 }), NOW) === true);
ok('...but not at day 11',                      matches(STALLED, person({ missions: 0, daysSinceSignup: 11 }), NOW) === false);

const churned2 = (n: number) => person({ audience: 'cancelled', daysSinceCancel: n,
                                         subscription_status: 'canceled', canceled_at: daysAgo(n) });
ok('win-back ask caught up two days late',      matches(WB_ASK, churned2(3), NOW) === true);
ok('...not five days late',                     matches(WB_ASK, churned2(5), NOW) === false);

console.log('\nWHEN TWO TRIAL-END MESSAGES COLLIDE, THE URGENT ONE WINS');
/* Their 3-day warning was lost to a Saturday. It is Monday, the trial ends
   tomorrow, and both now match. Sending "your trial ends in three days"
   today and the last call tomorrow - the day it ends - is the wrong way
   round, and sort_order alone would do exactly that. */
const monday = atEnd(1);
const ROSTER2 = [ENDING, LASTCALL, ENDED];
ok('both match on their own',
   matches(ENDING, monday, NOW) && matches(LASTCALL, monday, NOW));
ok('only one is planned',                       dueFor(ROSTER2, monday, NONE, NOW).length === 1);
ok('...and it is the last call, not the stale warning',
   (dueFor(ROSTER2, monday, NONE, NOW)[0] ?? {}).key === 'last_call');
ok('the overtaken warning is recorded, so it cannot arrive tomorrow',
   supersededTouchpoints(ROSTER2, monday, NONE, NOW).indexOf('trial_ending') !== -1);
ok('...and the one being sent is NOT recorded as superseded',
   supersededTouchpoints(ROSTER2, monday, NONE, NOW).indexOf('last_call') === -1);

const lapsed = atEnd(-2);
ok('once the trial has ended, trial_ended beats a late last call',
   (dueFor(ROSTER2, lapsed, NONE, NOW)[0] ?? {}).key === 'trial_ended');
ok('...and the late last call is retired, not queued',
   supersededTouchpoints(ROSTER2, lapsed, NONE, NOW).indexOf('last_call') !== -1);

ok('one trial-end message alone is untouched',
   dueFor([ENDING], atEnd(3), NONE, NOW).length === 1 &&
   supersededTouchpoints([ENDING], atEnd(3), NONE, NOW).length === 0);
ok('a milestone is not collapsed by the trial-end rule',
   dueFor([ENDING, FIRST_WIN], person({ daysToTrialEnd: 3, missions: 1, missionDates: [daysAgo(1)] }), NONE, NOW).length === 2);
/* Indexing [0] of an empty array throws, and a test that throws takes the
   whole suite down instead of reporting one red line - which is how the
   reverted-window check first looked like a crash rather than a failure. */
ok('an already-sent trial-end message is never resent',
   (dueFor(ROSTER2, monday, new Set(['last_call']), NOW)[0] ?? {}).key === 'trial_ending');

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
if (fail) Deno.exit(1);
