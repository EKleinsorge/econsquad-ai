/* ═══════════════════════════════════════════════════════════════════
   import-context — turn what somebody told ChatGPT into a PROPOSAL

   The customer pastes their custom instructions, or the browser hands
   over a filtered digest of their ChatGPT export (chatgpt-import.js
   builds that; the zip itself never leaves their machine). This reads
   it and proposes values for the file-cabinet fields every specialist
   already reads.

   ⚠️ IT PROPOSES. IT NEVER WRITES A PROFILE.
   specialist-context.md set this rule before a line of it existed:
   "Propose, never save. A profile of confidently wrong facts is worse
   than an empty one, because it then flows silently into every
   document." The client saves what the person ticks. This function
   has no write access to either profile table and is not given any.

   ⚠️ AND EVERY PROPOSAL MUST CARRY ITS OWN EVIDENCE.
   A model asked to fill in twenty fields will fill in twenty fields.
   So each one has to come back with a verbatim quote from the input,
   and requireEvidence() below throws the field away if that quote is
   not actually there. That check is what makes "do not invent things"
   an enforced rule rather than a line in a prompt, and it is the
   single most important thing in this file.
   ═══════════════════════════════════════════════════════════════════ */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'claude-sonnet-4-6';
const MAX_INPUT = 120000;

/* ── The fields, and who may own them ───────────────────────────
   Split exactly as the schema is split, and for the reason recorded in
   20260910_esq_org_profile_fields.sql and team-seats.md.

   ⚠️ 'org' FIELDS MAY GO TO EITHER TABLE. 'personal' FIELDS MAY NEVER
   GO TO THE ORGANISATION. Share a signature block and every cover
   letter Clara writes for five people gets signed by the sixth. A test
   fails if anybody ever moves one across. */
type Scope = 'org' | 'personal';
interface FieldDef { key: string; scope: Scope; label: string; ask: string; }

export const FIELDS: FieldDef[] = [
  { key: 'legal_name', scope: 'org', label: 'Legal name',
    ask: 'the full legal name of the organisation, as it appears on documents' },
  { key: 'short_name', scope: 'org', label: 'Short name',
    ask: 'what they call themselves in prose' },
  { key: 'entity_type', scope: 'org', label: 'Type of organisation',
    ask: 'IDA, EDC, LDC, chamber, port authority, city department, regional partnership' },
  { key: 'address', scope: 'org', label: 'Address',
    ask: 'the postal address as it would sit on a letterhead' },
  { key: 'phone', scope: 'org', label: 'Main phone', ask: 'the main office telephone number' },
  { key: 'general_email', scope: 'org', label: 'General email',
    ask: 'a general office email address, NOT a named person' },
  { key: 'website', scope: 'org', label: 'Website', ask: 'the organisation website' },
  { key: 'governing_body', scope: 'org', label: 'Governing body',
    ask: 'how the board or governing body is constituted' },
  { key: 'municipalities', scope: 'org', label: 'Municipalities served',
    ask: 'the towns, villages or cities served' },
  { key: 'region_label', scope: 'org', label: 'Region',
    ask: 'the region or labour shed, named the way they name it' },
  { key: 'access_notes', scope: 'org', label: 'Access and infrastructure',
    ask: 'interstates, airports, rail, port, with drive times if given' },
  { key: 'top_employers', scope: 'org', label: 'Top employers',
    ask: 'the largest employers in the area' },
  { key: 'incentive_programs', scope: 'org', label: 'Incentive programs',
    ask: 'PILOT, abatement, revolving loan, TIF, opportunity zone, foreign trade zone' },
  { key: 'mission', scope: 'org', label: 'Mission', ask: 'the mission statement' },
  { key: 'tagline', scope: 'org', label: 'Tagline', ask: 'a short tagline or strapline' },
  { key: 'boilerplate', scope: 'org', label: 'Boilerplate',
    ask: 'the "about us" paragraph they paste at the end of press releases' },
  { key: 'self_reference', scope: 'org', label: 'Refers to itself as',
    ask: 'how they refer to themselves in the third person, e.g. "the Agency"' },
  { key: 'style_notes', scope: 'org', label: 'House style',
    ask: 'tone, formality, words to avoid, formatting habits they have asked for' },
  { key: 'footer_notice', scope: 'org', label: 'Footer notice',
    ask: 'a standard footer, FOIL notice or equal-opportunity statement' },
  { key: 'county', scope: 'org', label: 'County', ask: 'the county' },
  { key: 'state', scope: 'org', label: 'State', ask: 'the state' },
  { key: 'key_industries', scope: 'org', label: 'Key industries',
    ask: 'the industries already present in the area' },
  { key: 'target_sectors', scope: 'org', label: 'Target sectors',
    ask: 'the sectors they are actively trying to attract' },

  { key: 'contact_name', scope: 'personal', label: 'Your name', ask: 'the person\'s own name' },
  { key: 'contact_title', scope: 'personal', label: 'Your title', ask: 'their job title' },
  { key: 'contact_phone', scope: 'personal', label: 'Your phone', ask: 'their direct phone number' },
  { key: 'contact_email', scope: 'personal', label: 'Your email', ask: 'their own email address' },
];

/* ⚠️ NEVER PROPOSED, AND NOT BY OVERSIGHT.
   Population, labour force, unemployment and median wage go stale in a
   quarter. community-profile-agent.md: fetch them, never store them.
   20260910_esq_org_profile_fields.sql kept them off the org profile for
   the same reason - "a wrong number in a proposal to a site selector is
   worse than no number", and a figure typed in once ends up in a grant
   application two years later still quietly ageing.

   community_profiles DOES have a population column, left from before
   that was understood. The importer still will not fill it. */
export const NEVER_PROPOSE = [
  'population', 'labor_force', 'labour_force', 'unemployment',
  'unemployment_rate', 'median_wage', 'median_income', 'per_capita_income',
  /* and the three that turn a profile table into a breach */
  'ein', 'tax_id', 'bank_account', 'routing_number',
];

export function buildPrompt(fields: FieldDef[]): string {
  return [
    'You are reading things an economic-development professional wrote to',
    'ChatGPT. Your job is to fill in their organisation profile from what',
    'they actually said.',
    '',
    'Return ONLY a JSON object, no prose, of the form:',
    '{"fields":{"<key>":{"value":"...","evidence":"...","confidence":"high|medium|low"}}}',
    '',
    'RULES, IN ORDER OF IMPORTANCE:',
    '1. EVIDENCE MUST BE A VERBATIM QUOTE from the text you were given -',
    '   copied character for character, 10 to 300 characters long. If you',
    '   cannot quote it, you may not propose it. Do not paraphrase the',
    '   evidence. Do not quote your own words.',
    '2. OMIT any field you cannot support. A missing field is correct and',
    '   costs nothing. A wrong one gets copied into a real document sent to',
    '   a site selector. Twenty omissions is a fine answer.',
    '3. Do not infer from general knowledge. If they mention a county you',
    '   happen to know things about, you still only know what they wrote.',
    '4. Never propose population, labour force, unemployment or wage',
    '   figures, even if they are stated. Those go stale and are fetched',
    '   live elsewhere.',
    '5. value is what should be stored: tidy it, keep their wording.',
    '6. confidence: high if they state it plainly, low if you are reading',
    '   between the lines.',
    '',
    'THE FIELDS:',
    ...fields.map((f) => '  ' + f.key + ' — ' + f.ask),
  ].join('\n');
}

/* ── The guard ──────────────────────────────────────────────────
   Whitespace is normalised on both sides before comparing: a model
   reflowing a quote across different line breaks is not an invention,
   and failing it for that would teach us to loosen the check that
   matters. Everything else must genuinely be in the source.

   Returns the kept fields and, separately, WHY each rejection happened -
   the caller reports the count, so a model that starts inventing shows
   up as a number rather than as quietly worse profiles. */
export interface Proposal { key: string; value: string; evidence: string; confidence: string; }
export interface GuardResult {
  kept: Proposal[];
  rejected: { key: string; why: string }[];
}

const flat = (s: string) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

export function requireEvidence(
  raw: Record<string, any> | null | undefined,
  source: string,
  fields: FieldDef[] = FIELDS,
): GuardResult {
  const kept: Proposal[] = [];
  const rejected: { key: string; why: string }[] = [];
  const allowed = new Map(fields.map((f) => [f.key, f]));
  const haystack = flat(source);

  for (const [key, v] of Object.entries(raw ?? {})) {
    if (NEVER_PROPOSE.includes(key)) { rejected.push({ key, why: 'never proposed' }); continue; }
    if (!allowed.has(key))           { rejected.push({ key, why: 'not a field' }); continue; }
    const value = typeof v?.value === 'string' ? v.value.trim() : '';
    const evidence = typeof v?.evidence === 'string' ? v.evidence.trim() : '';
    if (!value)              { rejected.push({ key, why: 'empty value' }); continue; }
    if (evidence.length < 10) { rejected.push({ key, why: 'no evidence' }); continue; }
    if (!haystack.includes(flat(evidence))) {
      rejected.push({ key, why: 'evidence not in the source' });
      continue;
    }
    const conf = ['high', 'medium', 'low'].includes(String(v?.confidence))
      ? String(v.confidence) : 'low';
    kept.push({ key, value: value.slice(0, 6000), evidence: evidence.slice(0, 300), confidence: conf });
  }
  return { kept, rejected };
}

/* A model asked for JSON sometimes wraps it in a fence or a sentence.
   Pull out the first balanced object rather than failing the whole
   import over punctuation. */
export function parseJsonish(text: string): any {
  const t = String(text ?? '').trim();
  try { return JSON.parse(t); } catch (_e) { /* keep going */ }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch (_e) { /* keep going */ } }
  const start = t.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (!depth) {
      try { return JSON.parse(t.slice(start, i + 1)); } catch (_e) { return null; }
    } }
  }
  return null;
}

async function recordUsage(admin: any, row: Record<string, unknown>) {
  try {
    const { data: rate } = await admin.from('model_rates')
      .select('input_per_mtok,output_per_mtok').eq('model', row.model).maybeSingle();
    const cost = rate
      ? (Number(row.input_tokens) / 1e6) * Number(rate.input_per_mtok)
        + (Number(row.output_tokens) / 1e6) * Number(rate.output_per_mtok)
      : 0;
    const { error } = await admin.from('model_usage')
      .insert({ ...row, cost_usd: Number(cost.toFixed(6)) });
    if (error) console.error('model_usage: insert failed', error.message);
  } catch (e) {
    console.error('model_usage: unhandled', e instanceof Error ? e.message : String(e));
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const SUPA_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const KEY      = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
    if (!KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

    /* ⚠️ THE CALLER COMES FROM THE JWT, NEVER FROM THE BODY. The anon key
       is printed in the page source, and the Supabase gateway accepts it
       as a valid JWT - so verify_jwt alone is no protection. This is the
       same hole security-findings.md §6 records in specialist-chat. */
    const authHeader = req.headers.get('Authorization') ?? '';
    const admin = createClient(SUPA_URL, SERVICE);
    const { data: { user } = { user: null } } =
      await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    if (!user) return json({ error: 'Sign in again — your session has expired.' }, 401);

    const body = await req.json();
    const source = String(body.source ?? 'paste');
    const text = String(body.text ?? '');
    if (text.trim().length < 40) {
      return json({ error: 'There is not enough here to read. Paste your custom '
        + 'instructions, or anything you have told ChatGPT about your organisation.' }, 400);
    }
    const input = text.slice(0, MAX_INPUT);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': KEY,
                 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: buildPrompt(FIELDS),
        messages: [{ role: 'user', content: input }],
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error('import-context: provider', res.status, detail.slice(0, 400));
      return json({ error: 'The reader is unavailable right now. Nothing was saved. '
        + 'Try again in a minute.' }, 502);
    }
    const data = await res.json();
    const reply = data?.content?.[0]?.text ?? '';
    const parsed = parseJsonish(reply);

    const guard = requireEvidence(parsed?.fields, input);

    await recordUsage(admin, {
      user_id: user.id, user_email: user.email ?? null,
      feature: 'import-context', specialist_id: null,
      provider: 'anthropic', model: MODEL,
      input_tokens: data?.usage?.input_tokens ?? 0,
      output_tokens: data?.usage?.output_tokens ?? 0,
    });

    /* ⚠️ COUNTS ONLY. Not one character of what they imported is stored
       here. The whole argument for this product over consumer ChatGPT is
       that their material is not lying about in somebody's database, and
       an import table full of pasted chat history would make that untrue
       on the very feature that makes the argument. */
    try {
      const { error } = await admin.from('esq_context_imports').insert({
        user_id: user.id,
        source: source === 'chatgpt_zip' ? 'chatgpt_zip' : 'paste',
        chars_sent: input.length,
        fields_proposed: guard.kept.length,
        fields_rejected: guard.rejected.length,
        ok: guard.kept.length > 0,
      });
      if (error) console.error('esq_context_imports: insert failed', error.message);
    } catch (e) {
      console.error('esq_context_imports: unhandled', e instanceof Error ? e.message : String(e));
    }

    if (!parsed) {
      return json({ fields: [], rejected: 0, note: 'The reader did not return anything '
        + 'usable. Nothing was saved. Try pasting a bit more.' });
    }

    return json({
      fields: guard.kept.map((p) => ({
        ...p,
        scope: FIELDS.find((f) => f.key === p.key)?.scope ?? 'org',
        label: FIELDS.find((f) => f.key === p.key)?.label ?? p.key,
      })),
      rejected: guard.rejected.length,
      /* Said out loud rather than swallowed: if the reader starts making
         things up, this number moves and somebody can see it. */
      rejected_detail: guard.rejected,
    });
  } catch (e) {
    console.error('import-context: unhandled', e instanceof Error ? e.message : String(e));
    return json({ error: 'Something went wrong reading that. Nothing was saved.' }, 500);
  }
});
