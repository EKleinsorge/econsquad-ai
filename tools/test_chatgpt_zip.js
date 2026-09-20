/* ═══════════════════════════════════════════════════════════════════
   WHAT LEAVES THE BROWSER WHEN SOMEBODY IMPORTS THEIR ChatGPT EXPORT

   The question this asks throughout is not "did the parser run" but
   "what exactly would be sent, and is any of it none of our business".

   ⚠️ THE CENTRAL CASE IS THE ONE THAT MUST NOT APPEAR. The fixture
   contains a real ChatGPT history: some economic-development work, and
   also a conversation about a biopsy result, one about a divorce, and a
   grocery list. If any of those reach the digest, the test fails and
   the feature does not ship. A privacy promise that is not asserted is
   a sentence in a marketing page.

   Run: node test_chatgpt_zip.js
   ═══════════════════════════════════════════════════════════════════ */
const I = require('./chatgpt-import.js');

let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; console.log('  FAIL ' + name); }
}

/* ── fixture builders ─────────────────────────────────────────── */
let t = 1_700_000_000;
function msg(role, text, extra) {
  t += 60;
  return Object.assign({
    id: 'm' + t,
    author: { role: role },
    create_time: t,
    content: { content_type: 'text', parts: [text] },
    metadata: {},
  }, extra || {});
}
function convo(title, messages) {
  const mapping = {};
  messages.forEach((m, i) => { mapping['n' + i + '_' + title] = { id: 'n' + i, message: m }; });
  return { title: title, create_time: t, mapping: mapping };
}

const ED_1 = 'We are the Whoville County Industrial Development Agency, an IDA '
  + 'serving the towns of Whoville, Grinchton and Cindy Lou. Our boilerplate is: '
  + 'The Whoville County IDA has supported capital investment in Whoville County '
  + 'since 1974. We administer a PILOT agreement program and a revolving loan fund.';
const ED_2 = 'Draft an RFI response for a site selector asking about shovel ready '
  + 'acreage near the interstate. Our top employers are Grinch Industries, '
  + 'Whoville Foods and the county hospital. We are 20 minutes from the airport.';
const ED_3 = 'Our mission is to grow sustainable employment across Whoville County. '
  + 'Tagline: Where business grows. Always refer to us as "the Agency" in the third '
  + 'person and avoid exclamation marks.';

const PRIVATE_MEDICAL = 'My biopsy came back and the oncologist wants to talk about '
  + 'treatment options next week. I am frightened and I have not told my wife yet. '
  + 'What questions should I be asking at that appointment?';
const PRIVATE_LEGAL = 'My divorce settlement gives my ex-wife the house. Can she '
  + 'force a sale before the children finish school, and what would that cost me?';
const PRIVATE_LIST = 'milk, eggs, bread, dog food, batteries';

const CUSTOM_NODE = msg('system', '', {
  content: {
    content_type: 'user_editable_context',
    user_profile: 'I am the executive director of the Whoville County IDA in New York.',
    user_instructions: 'Write plainly. No exclamation marks. Sign off as "the Agency".',
  },
  metadata: { is_user_system_message: true },
});

const EXPORT = [
  convo('RFI for site selector', [msg('user', ED_2), msg('assistant', 'Sure, here is a draft...')]),
  convo('About our agency', [CUSTOM_NODE, msg('user', ED_1), msg('assistant', 'Noted.')]),
  convo('Mission and voice', [msg('user', ED_3)]),
  convo('Health', [msg('user', PRIVATE_MEDICAL), msg('assistant', 'I am sorry to hear that...')]),
  convo('Legal question', [msg('user', PRIVATE_LEGAL)]),
  convo('Shopping', [msg('user', PRIVATE_LIST)]),
  convo('Chit chat', [msg('user', 'thanks'), msg('user', 'ok'), msg('user', 'great')]),
];

/* ── 1. the privacy promise ───────────────────────────────────── */
console.log('\nNOTHING PRIVATE REACHES THE DIGEST');
const r = I.fromConversations(EXPORT);
const d = r.digest;

ok('!! the biopsy conversation is NOT in the digest', d.indexOf('biopsy') === -1);
ok('!! the oncologist is not either',                 d.indexOf('oncologist') === -1);
ok('!! the divorce is NOT in the digest',             d.toLowerCase().indexOf('divorce') === -1);
ok('!! the grocery list is NOT in the digest',        d.indexOf('dog food') === -1);
ok('none of the three private chats appear at all',
   ['frightened', 'ex-wife', 'batteries'].every((w) => d.indexOf(w) === -1));

console.log('\nAND THE WORK MATERIAL DOES');
ok('the organisation is there',        d.indexOf('Whoville County Industrial Development Agency') !== -1);
ok('the boilerplate is there',         d.indexOf('supported capital investment') !== -1);
ok('the top employers are there',      d.indexOf('Grinch Industries') !== -1);
ok('the mission is there',             d.indexOf('grow sustainable employment') !== -1);

console.log('\nTHE CUSTOM INSTRUCTIONS ARE FOUND AND LABELLED');
ok('the profile text is there',        d.indexOf('executive director of the Whoville County IDA') !== -1);
ok('the instructions are there',       d.indexOf('No exclamation marks') !== -1);
ok('and it says how it found them',    r.custom.foundVia === 'user_editable_context');
ok('the digest labels that section',   d.indexOf('=== CUSTOM INSTRUCTIONS ===') !== -1);

/* ── 2. the assistant is not a source ─────────────────────────── */
console.log('\nTHE MODEL\'S OWN REPLIES ARE NOT TREATED AS FACTS');
ok('no assistant text in the digest',
   d.indexOf('Sure, here is a draft') === -1 && d.indexOf('I am sorry to hear') === -1);
const onlyAssistant = I.fromConversations([
  convo('one sided', [msg('assistant', 'Your county is famous for its ' + 'incentive programs and PILOT agreements.')]),
]);
ok('an export of nothing but replies yields nothing', onlyAssistant.digest === '');
ok('...and says why',
   onlyAssistant.notes.some((n) => /none of them contain messages you wrote/i.test(n)));

/* ── 3. chatter ───────────────────────────────────────────────── */
console.log('\nCHATTER IS DROPPED');
ok('"thanks" / "ok" / "great" are not messages',
   I._collectUserMessages([convo('c', [msg('user', 'thanks'), msg('user', 'ok')])])
     .messages.length === 0);

/* ── 4. the size cap is the real control ──────────────────────── */
console.log('\nA HUGE EXPORT DOES NOT BECOME A HUGE REQUEST');
const big = [];
for (let i = 0; i < 400; i++) {
  big.push(convo('incentive work ' + i, [msg('user',
    'Our incentive programs include a PILOT agreement and tax abatement. ' + 'x'.repeat(3000))]));
}
const bigR = I.fromConversations(big);
ok('400 long relevant conversations still fit the cap', bigR.stats.chars <= 62000);
ok('the message cap holds too',                        bigR.stats.selected <= 120);
ok('it says what it left out',
   bigR.notes.some((n) => /did not fit in the size limit/.test(n)));
ok('and it counted them honestly',
   bigR.stats.considered > bigR.stats.selected);

console.log('\nONE ENORMOUS MESSAGE DOES NOT BLOCK THE REST');
const blocker = I.fromConversations([
  convo('huge', [msg('user', 'PILOT agreement incentive ' + 'y'.repeat(50000))]),
  convo('small', [msg('user', ED_1)]),
]);
ok('the small one is still selected', blocker.digest.indexOf('Whoville County Industrial') !== -1);
ok('each message is truncated to its own limit',
   blocker.selected.every((c) => c.text.length <= 4010));

/* ── 5. nothing scoring zero is sent, even with room to spare ─── */
console.log('\nSPARE CAPACITY IS NOT FILLED WITH WHATEVER IS LYING AROUND');
const sparse = I.fromConversations([
  convo('a', [msg('user', ED_1)]),
  convo('b', [msg('user', 'Remind me to call my mother on Sunday afternoon please')]),
]);
ok('the irrelevant message is left out despite room',
   sparse.digest.indexOf('call my mother') === -1);
ok('and the relevant one is in',
   sparse.digest.indexOf('Whoville County Industrial') !== -1);

/* ── 6. malformed input says so instead of crashing ───────────── */
console.log('\nA FILE THAT IS NOT AN EXPORT SAYS SO');
[null, undefined, {}, 'not json', 42].forEach((junk) => {
  const j = I.fromConversations(junk);
  ok('handles ' + JSON.stringify(junk) + ' without throwing', j.ok === false && j.digest === '');
});
ok('an empty list says no conversations were found',
   I.fromConversations([]).notes.some((n) => /No conversations/i.test(n)));
ok('a conversation with no mapping is skipped, not fatal',
   I.fromConversations([{ title: 'x' }]).ok === false);

console.log('\nNON-TEXT PARTS DO NOT BECOME "[object Object]"');
const imgMsg = msg('user', '');
imgMsg.content = { content_type: 'multimodal_text',
  parts: [{ asset_pointer: 'file-service://abc' },
          'Our PILOT agreement covers the industrial park off the interstate'] };
const withImage = I.fromConversations([convo('img', [imgMsg])]);
ok('the object part is dropped',      withImage.digest.indexOf('[object Object]') === -1);
ok('the string part survives',        withImage.digest.indexOf('PILOT agreement covers') !== -1);
ok('asset pointers never appear',     withImage.digest.indexOf('file-service') === -1);

/* ── 7. the other custom-instruction shapes ───────────────────── */
console.log('\nCUSTOM INSTRUCTIONS ARE FOUND IN EVERY SHAPE SEEN IN THE WILD');
const viaMeta = I._readCustomInstructions([convo('m', [msg('user', 'hello', {
  metadata: { user_context_message_data: {
    about_user_message: 'Director of the Grinchton EDC',
    about_model_message: 'Be brief',
  } },
})])]);
ok('user_context_message_data', viaMeta.foundVia === 'user_context_message_data'
   && viaMeta.about.indexOf('Grinchton EDC') !== -1);

const viaSystem = I._readCustomInstructions([convo('s', [msg('system',
  'I run a port authority in Louisiana', { metadata: { is_user_system_message: true } })])]);
ok('is_user_system_message', viaSystem.foundVia === 'is_user_system_message'
   && viaSystem.about.indexOf('port authority') !== -1);

const none = I.fromConversations([convo('n', [msg('user', ED_1)])]);
ok('!! AND WHEN THERE ARE NONE IT SAYS SO, rather than looking empty',
   none.custom.foundVia === null
   && none.notes.some((n) => /No custom instructions were found/.test(n)));

/* ── 8. finding the file inside the zip ───────────────────────── */
console.log('\nFINDING conversations.json IN THE ZIP');
ok('at the root',      I.pickConversationsEntry(['chat.html', 'conversations.json']) === 'conversations.json');
ok('in a folder',      I.pickConversationsEntry(['export/conversations.json']) === 'export/conversations.json');
ok('root wins',        I.pickConversationsEntry(['a/conversations.json', 'conversations.json']) === 'conversations.json');
ok('macOS cruft ignored',
   I.pickConversationsEntry(['__MACOSX/._conversations.json']) === null);
ok('shallowest nested wins',
   I.pickConversationsEntry(['a/b/c/conversations.json', 'a/conversations.json']) === 'a/conversations.json');
ok('absent means null', I.pickConversationsEntry(['chat.html', 'user.json']) === null);
ok('a lookalike name is not it',
   I.pickConversationsEntry(['my_conversations.json']) === null);

/* ── 9. the digest is what the person is shown ────────────────── */
console.log('\nTHE NUMBERS SHOWN TO THE PERSON ARE THE REAL ONES');
ok('the character count matches the digest', r.stats.chars === r.digest.length);
ok('the selected count matches the list',    r.stats.selected === r.selected.length);
ok('conversations counted',                  r.stats.conversations === EXPORT.length);
ok('user messages counted below total seen', r.stats.userMessages < r.stats.messagesSeen);
ok('fewer selected than written — the point of the filter',
   r.stats.selected < r.stats.userMessages);

/* ── 10. the test can fail ────────────────────────────────────── */
console.log('\nTHE HARNESS CAN SAY NO');
/* Silently, so a deliberate failure does not print a FAIL line that
   somebody later skim-reads as a real one. */
(function () {
  const before = failed;
  const quiet = console.log; console.log = function () {};
  ok('deliberate', false);
  console.log = quiet;
  const worked = failed === before + 1;
  failed = before; passed -= 0;
  ok('a deliberately wrong assertion does fail', worked);
})();

console.log('\n' + (passed + failed) + ' checks, ' + passed + ' passed, ' + failed + ' failed');
if (failed) { console.log('FAILED'); process.exit(1); }

/* ═══════════════════════════════════════════════════════════════════
   WHERE AN ACCEPTED FIELD ACTUALLY LANDS

   ⚠️ THE CASE THAT NEARLY SHIPPED BROKEN: a solo trial user has no
   organisation, and fourteen of the proposed fields are columns on
   esq_org_profiles only. Written naively they would tick the boxes,
   press Save, and most of it would land nowhere - with no error,
   because an update that names no columns is a successful update of
   no columns.
   ═══════════════════════════════════════════════════════════════════ */
console.log('\nA TEAM MEMBER WHO MAY EDIT THE SHARED PROFILE');
const ACCEPTED = [
  { key: 'legal_name',         scope: 'org',      label: 'Legal name',      value: 'Whoville County IDA' },
  { key: 'entity_type',        scope: 'org',      label: 'Type',            value: 'IDA' },
  { key: 'incentive_programs', scope: 'org',      label: 'Incentive programs', value: 'PILOT, revolving loan' },
  { key: 'mission',            scope: 'org',      label: 'Mission',         value: 'Grow employment' },
  { key: 'county',             scope: 'org',      label: 'County',          value: 'Whoville' },
  { key: 'contact_name',       scope: 'personal', label: 'Your name',       value: 'Eric Kleinsorge' },
  { key: 'contact_email',      scope: 'personal', label: 'Your email',      value: 'eric@example.org' },
];

const team = I.planSave(ACCEPTED, true);
ok('org fields go to the shared profile',  team.org.legal_name === 'Whoville County IDA'
   && team.org.incentive_programs === 'PILOT, revolving loan');
ok('county has no org column, so it goes personal', team.personal.county === 'Whoville');
ok('!! the signature block is NEVER on the org profile',
   !('contact_name' in team.org) && !('contact_email' in team.org));
ok('...it is on the person',  team.personal.contact_name === 'Eric Kleinsorge');
ok('nothing is homeless',     team.homeless.length === 0);

console.log('\nA SOLO USER WITH NO ORGANISATION LOSES NOTHING');
const solo = I.planSave(ACCEPTED, false);
ok('nothing is written to an org profile they do not have',
   Object.keys(solo.org).length === 0);
ok('what maps, maps',        solo.personal.org_name === 'Whoville County IDA'
   && solo.personal.county === 'Whoville');
ok('!! and the homeless org fields reach notes, not the floor',
   solo.personal.notes.indexOf('PILOT, revolving loan') !== -1
   && solo.personal.notes.indexOf('Grow employment') !== -1);
ok('notes are labelled so a specialist can read them',
   solo.personal.notes.indexOf('Incentive programs:') !== -1);
ok('the signature block is still personal',
   solo.personal.contact_name === 'Eric Kleinsorge');
ok('nothing is homeless here either', solo.homeless.length === 0);

console.log('\nEVERY FIELD THE READER CAN PROPOSE HAS SOMEWHERE TO GO');
/* Kept in step with FIELDS in the edge function by hand; if one is added
   there and not here, this list shrinks and the coverage check below
   still passes - so the real guard is that NOTHING is homeless for
   either kind of user, whatever the list contains. */
const EVERY = [
  'legal_name','short_name','entity_type','address','phone','general_email',
  'website','governing_body','municipalities','region_label','access_notes',
  'top_employers','incentive_programs','mission','tagline','boilerplate',
  'self_reference','style_notes','footer_notice','county','state',
  'key_industries','target_sectors',
].map((k) => ({ key: k, scope: 'org', label: k, value: 'v-' + k }))
 .concat(['contact_name','contact_title','contact_phone','contact_email']
   .map((k) => ({ key: k, scope: 'personal', label: k, value: 'v-' + k })));

[true, false].forEach((hasOrg) => {
  const plan = I.planSave(EVERY, hasOrg);
  ok((hasOrg ? 'with' : 'without') + ' an organisation, nothing is homeless',
     plan.homeless.length === 0);
  const landed = Object.keys(plan.org).length + Object.keys(plan.personal).length
    - (plan.personal.notes ? 1 : 0) + plan.notes.length;
  ok((hasOrg ? 'with' : 'without') + ' an organisation, all ' + EVERY.length
     + ' land somewhere (' + landed + ')', landed === EVERY.length);
  ok((hasOrg ? 'with' : 'without') + ' an organisation, no contact field is on the org',
     ['contact_name','contact_title','contact_phone','contact_email']
       .every((k) => !(k in plan.org)));
});

console.log('\nNOTHING ACCEPTED MEANS NOTHING WRITTEN');
const empty = I.planSave([], false);
ok('no org payload',      Object.keys(empty.org).length === 0);
ok('no personal payload', Object.keys(empty.personal).length === 0);
ok('and no empty notes key', !('notes' in empty.personal));

console.log('\n' + (passed + failed) + ' checks total, ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
