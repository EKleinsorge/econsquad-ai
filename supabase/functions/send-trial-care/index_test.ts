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

const { isInternal, crossedAt, matches, dueFor, supersededMilestones } = M as any;

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

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
if (fail) Deno.exit(1);
