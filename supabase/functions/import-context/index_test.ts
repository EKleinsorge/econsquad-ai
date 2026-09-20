/* ═══════════════════════════════════════════════════════════════════
   THE IMPORT PROPOSES ONLY WHAT THE PERSON ACTUALLY WROTE

   The model is not tested here — it cannot be, deterministically. What
   is tested is the guard that stands between the model and somebody's
   letterhead: requireEvidence(). Every case below is a thing a model
   plausibly does, and the question is whether the field survives.

   ⚠️ THIS IS THE TEST THAT MATTERS. A model asked to fill in twenty
   fields will fill in twenty fields. Without the guard, a confident
   invention becomes a fact in the file cabinet, and from there it goes
   silently into a document sent to a site selector. The prompt asks
   the model not to invent; this proves it cannot.

   Run: deno test --allow-all --import-map=import_map.json index_test.ts
   ═══════════════════════════════════════════════════════════════════ */
import { FIELDS, NEVER_PROPOSE, requireEvidence, parseJsonish, buildPrompt } from './index.ts';

let passed = 0, failed = 0;
function ok(name: string, cond: boolean) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; console.log('  FAIL ' + name); }
}

const SOURCE = [
  '=== CUSTOM INSTRUCTIONS ===',
  'I am the executive director of the Whoville County Industrial Development',
  'Agency, an IDA in New York. Write plainly and never use exclamation marks.',
  '',
  '=== THINGS THEY HAVE WRITTEN ===',
  'We administer a PILOT agreement program and a revolving loan fund.',
  'Our office is at 14 Mount Crumpit Road, Whoville NY 12345.',
  'Our top employers are Grinch Industries and Whoville Foods.',
  'The population of the county is 48,200 and unemployment is 3.9 percent.',
].join('\n');

const good = (value: string, evidence: string, confidence = 'high') =>
  ({ value, evidence, confidence });

/* ── 1. what survives ─────────────────────────────────────────── */
console.log('\nA QUOTE THAT IS REALLY THERE IS KEPT');
let g = requireEvidence({
  legal_name: good('Whoville County Industrial Development Agency',
                   'Whoville County Industrial Development'),
  entity_type: good('IDA', 'an IDA in New York'),
  incentive_programs: good('PILOT agreements and a revolving loan fund',
                           'We administer a PILOT agreement program and a revolving loan fund.'),
  address: good('14 Mount Crumpit Road, Whoville NY 12345',
                'Our office is at 14 Mount Crumpit Road, Whoville NY 12345.'),
}, SOURCE);
ok('all four are kept', g.kept.length === 4);
ok('nothing was rejected', g.rejected.length === 0);
ok('the value is what gets stored, not the quote',
   g.kept.find((k) => k.key === 'entity_type')?.value === 'IDA');
ok('the evidence is carried through for the person to see',
   (g.kept.find((k) => k.key === 'address')?.evidence ?? '').indexOf('Mount Crumpit') !== -1);

console.log('\nA QUOTE REFLOWED ACROSS LINE BREAKS STILL COUNTS');
g = requireEvidence({
  legal_name: good('Whoville County IDA',
    'the executive director of the Whoville County Industrial   Development\n\n Agency'),
}, SOURCE);
ok('whitespace differences are forgiven', g.kept.length === 1);

/* ── 2. what does not ─────────────────────────────────────────── */
console.log('\n!! AN INVENTED FACT IS THROWN AWAY');
g = requireEvidence({
  /* Plausible, well-formed, confident, and nowhere in the source. This
     is precisely the failure mode the guard exists for. */
  founded_year: good('1974', 'The Agency was established in 1974'),
  tagline: good('Where business grows', 'Our tagline is Where business grows'),
  governing_body: good('a nine-member board appointed by the County Legislature',
                       'governed by a nine-member board appointed by the County Legislature'),
}, SOURCE);
ok('!! none of the three invented fields survive', g.kept.length === 0);
ok('all three are reported as rejected', g.rejected.length === 3);
ok('and the reason is named',
   g.rejected.every((r) => r.why === 'evidence not in the source' || r.why === 'not a field'));

console.log('\nEVIDENCE THAT IS TOO SHORT TO MEAN ANYTHING IS REFUSED');
g = requireEvidence({ entity_type: good('IDA', 'IDA') }, SOURCE);
ok('a three-character quote proves nothing', g.kept.length === 0);
ok('...and says so', g.rejected[0]?.why === 'no evidence');

console.log('\nA VALUE WITH NO EVIDENCE AT ALL IS REFUSED');
[
  ['missing', { state: { value: 'New York', confidence: 'high' } }],
  ['empty',   { state: { value: 'New York', evidence: '', confidence: 'high' } }],
  ['null',    { state: { value: 'New York', evidence: null, confidence: 'high' } }],
  ['number',  { state: { value: 'New York', evidence: 12345, confidence: 'high' } }],
].forEach(([label, obj]) => {
  ok(String(label) + ' evidence is refused',
     requireEvidence(obj as any, SOURCE).kept.length === 0);
});

console.log('\nAN EMPTY VALUE IS NOT A PROPOSAL');
ok('empty string', requireEvidence(
  { mission: good('', 'We administer a PILOT agreement program') }, SOURCE).kept.length === 0);
ok('whitespace only', requireEvidence(
  { mission: good('   ', 'We administer a PILOT agreement program') }, SOURCE).kept.length === 0);

/* ── 3. the fields that must never be filled ──────────────────── */
console.log('\n!! VOLATILE FIGURES ARE NEVER PROPOSED, EVEN WHEN STATED');
g = requireEvidence({
  /* Note the evidence IS in the source - they really did write it. The
     refusal is a policy, not an evidence failure, because a number
     typed in once ends up in a grant application two years later. */
  population: good('48,200', 'The population of the county is 48,200'),
  unemployment: good('3.9%', 'unemployment is 3.9 percent'),
}, SOURCE);
ok('!! population is refused despite being quoted exactly', g.kept.length === 0);
ok('and the reason is the policy, not the evidence',
   g.rejected.every((r) => r.why === 'never proposed'));
ok('every volatile key is on the list',
   ['population', 'labor_force', 'unemployment', 'median_wage'].every(
     (k) => NEVER_PROPOSE.includes(k)));
ok('so are the three that turn a profile into a breach',
   ['ein', 'tax_id', 'bank_account'].every((k) => NEVER_PROPOSE.includes(k)));

console.log('\nA KEY NOBODY ASKED FOR IS REFUSED');
g = requireEvidence({
  password: good('hunter2', 'We administer a PILOT agreement program'),
  'profiles.is_admin': good('true', 'We administer a PILOT agreement program'),
}, SOURCE);
ok('unknown keys cannot be written', g.kept.length === 0);
ok('...and are named as not-a-field',
   g.rejected.every((r) => r.why === 'not a field'));

/* ── 4. the signature block ───────────────────────────────────── */
console.log('\n!! THE SIGNATURE BLOCK IS PERSONAL AND NEVER THE ORGANISATION\'S');
const personal = FIELDS.filter((f) => f.scope === 'personal').map((f) => f.key);
ok('contact_name is personal',  personal.includes('contact_name'));
ok('contact_title is personal', personal.includes('contact_title'));
ok('contact_phone is personal', personal.includes('contact_phone'));
ok('contact_email is personal', personal.includes('contact_email'));
ok('!! AND NONE OF THEM IS SCOPED TO THE ORGANISATION — if this ever fails, '
   + 'Clara signs five people\'s letters with the sixth person\'s name',
   FIELDS.filter((f) => f.scope === 'org')
         .every((f) => !['contact_name', 'contact_title', 'contact_phone', 'contact_email']
           .includes(f.key)));
ok('the general office email is NOT the personal one',
   FIELDS.find((f) => f.key === 'general_email')?.scope === 'org'
   && FIELDS.find((f) => f.key === 'contact_email')?.scope === 'personal');
ok('and the prompt tells the model the difference',
   buildPrompt(FIELDS).indexOf('NOT a named person') !== -1);

console.log('\nEVERY FIELD IS ONE THE SCHEMA ACTUALLY HAS');
/* The columns as created in 20260904_specialist_prompts.sql and
   20260910_esq_org_profile_fields.sql. If a field here is not a column
   there, the save silently writes nothing. */
const ORG_COLUMNS = ['legal_name','short_name','entity_type','address','phone',
  'general_email','website','founded_year','governing_body','municipalities',
  'region_label','access_notes','top_employers','incentive_programs','mission',
  'tagline','boilerplate','self_reference','style_notes','footer_notice'];
const PERSONAL_COLUMNS = ['org_name','org_short_name','website','region','county',
  'state','population','key_industries','target_sectors','boilerplate',
  'contact_name','contact_title','contact_phone','contact_email','notes'];
const everywhere = new Set([...ORG_COLUMNS, ...PERSONAL_COLUMNS]);
const orphans = FIELDS.filter((f) => !everywhere.has(f.key)).map((f) => f.key);
ok('no field is invented: ' + (orphans.length ? orphans.join(', ') : 'none'),
   orphans.length === 0);
ok('personal fields exist on community_profiles',
   FIELDS.filter((f) => f.scope === 'personal')
         .every((f) => PERSONAL_COLUMNS.includes(f.key)));

/* ── 5. the model does not always return clean JSON ───────────── */
console.log('\nTHE REPLY IS PARSED EVEN WHEN IT IS NOT PURE JSON');
ok('plain json',    parseJsonish('{"fields":{}}')?.fields !== undefined);
ok('fenced json',   parseJsonish('```json\n{"fields":{"a":1}}\n```')?.fields?.a === 1);
ok('bare fence',    parseJsonish('```\n{"fields":{"a":2}}\n```')?.fields?.a === 2);
ok('prose then json',
   parseJsonish('Here is what I found:\n{"fields":{"a":3}}')?.fields?.a === 3);
ok('json then prose',
   parseJsonish('{"fields":{"a":4}}\nHope that helps.')?.fields?.a === 4);
ok('braces inside a string do not confuse it',
   parseJsonish('{"fields":{"mission":{"value":"grow {the} county"}}}')
     ?.fields?.mission?.value === 'grow {the} county');
ok('an escaped quote does not confuse it',
   parseJsonish('{"fields":{"tagline":{"value":"say \\"yes\\""}}}')
     ?.fields?.tagline?.value === 'say "yes"');
ok('no json at all returns null', parseJsonish('I could not find anything.') === null);
ok('truncated json returns null rather than half an answer',
   parseJsonish('{"fields":{"a":') === null);
ok('empty string', parseJsonish('') === null);

/* ── 6. nothing in, nothing out ───────────────────────────────── */
console.log('\nNOTHING IN, NOTHING OUT');
ok('null',      requireEvidence(null, SOURCE).kept.length === 0);
ok('undefined', requireEvidence(undefined, SOURCE).kept.length === 0);
ok('empty',     requireEvidence({}, SOURCE).kept.length === 0);
ok('an empty source keeps nothing, however good the quote looks',
   requireEvidence({ mission: good('x', 'a quote that cannot be in nothing') }, '')
     .kept.length === 0);

/* ── 7. the guard can fail ────────────────────────────────────── */
console.log('\nTHE GUARD CAN SAY YES — so the noes above mean something');
ok('a real quote from a real source passes',
   requireEvidence({ state: good('New York', 'an IDA in New York') }, SOURCE).kept.length === 1);

console.log('\n' + (passed + failed) + ' checks, ' + passed + ' passed, ' + failed + ' failed');
if (failed) { console.log('FAILED'); Deno.exit(1); }
