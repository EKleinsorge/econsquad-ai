// supabase/functions/research-org/index.ts
//
// ═══════════════════════════════════════════════════════════════════════
//  READ AN ORGANISATION'S OWN WEBSITE AND PROPOSE ITS PROFILE
// ═══════════════════════════════════════════════════════════════════════
//
// Eric: "Couldn't most of the answers be researched and filled in for the
// client to approve and/or change if needed so they don't have to type all
// of the data?" Most of the twenty shared profile fields are public record
// on the organisation's own site.
//
// ⚠️ IT PROPOSES. IT NEVER SAVES.
// Nothing is written to esq_org_profiles by this function. Every field comes
// back as a suggestion carrying the page it came from, for a person to accept
// or correct. A profile full of confidently wrong facts is worse than an
// empty one, because an empty one gets filled in and a wrong one flows
// silently into every document the organisation produces from then on.
//
// ⚠️ AND IT IS ALLOWED TO COME BACK EMPTY.
// Measured beforehand (see claude/website-research.md): about one site in
// three yields too little — plantcityedc.com links to an /about page it does
// not serve, and the whole site gave 3,226 characters of which most was the
// same navigation three times. For those, the honest answer is "I could not
// learn enough about you" and a form to fill in by hand.
//
// WHAT WAS MEASURED FIRST, so none of this is guesswork:
//   - 11 of 12 real EDC sites are readable from here, no bot walls   (~92%)
//   - guessing /about and /contact 404s four times out of six
//   - reading the home page's LINKS instead finds the real ones
//   - following them yields 3.6x the text of the home page alone
//
// ⚠️ DUPLICATED ON PURPOSE: the SSRF guards below are copied verbatim from
// fetch-probe, where they have 28 tests. They are not imported from _shared
// because a function pasted into the dashboard by hand cannot resolve a
// relative import, and this one must survive being deployed that way.
// If you fix a guard, fix it in both.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';
const OPENAI_KEY   = Deno.env.get('OPENAI_API_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Content-Type': 'application/json',
};

/* !! 12000 WAS TOO TIGHT FOR MUNICIPAL HOSTING. Two of twenty-one
   unreachable domains failed on timeout alone, and slow county and
   small-city sites are exactly the audience here. 25s costs nothing on
   a site that answers quickly - the timer only matters to the ones
   that do not. */
const TIMEOUT_MS    = 25000;
const MAX_BYTES     = 400_000;
const MAX_REDIRECTS = 3;
const MAX_PAGES     = 5;
const MODEL         = 'gpt-4o';
/* Enough for a small site and its five pages, short of a bill nobody meant. */
const MAX_PROSE     = 40_000;

/* ═══ SSRF guards — verbatim from fetch-probe ═══════════════════════ */
export function isPrivateAddress(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (v.includes(':')) {
    if (v === '::' || v === '::1') return true;
    if (v.startsWith('fe80')) return true;
    if (v.startsWith('fc') || v.startsWith('fd')) return true;
    const tail = v.split(':').pop() || '';
    if (tail.includes('.')) return isPrivateAddress(tail);
    return false;
  }
  const p = v.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 127 || a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;   // ⚠️ cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

export function hostLooksInternal(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.home.arpa')) return true;
  if (!h.includes('.')) return true;
  if (/^[0-9.]+$/.test(h) || h.includes(':')) return isPrivateAddress(h);
  return false;
}

async function resolvesSomewhereSafe(host: string): Promise<{ ok: boolean; why: string }> {
  const dns = (Deno as unknown as {
    resolveDns?: (h: string, t: string) => Promise<string[]>;
  }).resolveDns;
  /* Fails CLOSED. An unverified fetch is exactly what must not happen. */
  if (typeof dns !== 'function') return { ok: false, why: 'dns_unavailable' };
  const addrs: string[] = [];
  for (const type of ['A', 'AAAA']) {
    try { addrs.push(...(await dns(host, type))); } catch { /* none of that type */ }
  }
  if (!addrs.length) return { ok: false, why: 'does_not_resolve' };
  const bad = addrs.filter(isPrivateAddress);
  if (bad.length) return { ok: false, why: 'resolves_to_private:' + bad[0] };
  return { ok: true, why: addrs[0] };
}

export function normalise(raw: string): string | null {
  let u = String(raw ?? '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null;
    u = 'https://' + u;
  }
  try {
    const p = new URL(u);
    if (p.protocol !== 'http:' && p.protocol !== 'https:') return null;
    return p.toString();
  } catch { return null; }
}

/* ═══ Fetching ══════════════════════════════════════════════════════ */
export function toText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function isNotAPage(title: string, text: string): boolean {
  const low = (title + ' ' + text.slice(0, 800)).toLowerCase();
  return /page not found|404 not found|^404\b|no longer here|never existed/.test(low);
}

async function getPage(rawUrl: string): Promise<
  { ok: true; url: string; title: string; html: string; text: string } |
  { ok: false; url: string; why: string }> {
  const start = normalise(rawUrl);
  if (!start) return { ok: false, url: rawUrl, why: 'not_an_http_url' };
  let current = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const host = new URL(current).hostname;
    if (hostLooksInternal(host)) return { ok: false, url: current, why: 'internal_host' };
    const dnsOk = await resolvesSomewhereSafe(host);
    if (!dnsOk.ok) return { ok: false, url: current, why: dnsOk.why };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: 'manual', signal: ctrl.signal,
        headers: {
          'User-Agent': 'EconSquadAI-Research/1.0 (+https://econsquad.ai)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
    } catch (e) {
      clearTimeout(timer);
      const m = String((e as Error)?.message ?? e);
      return { ok: false, url: current, why: /abort/i.test(m) ? 'timeout' : m.slice(0, 120) };
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return { ok: false, url: current, why: 'redirect_without_location' };
      current = new URL(loc, current).toString();   // rechecked next pass
      continue;
    }
    if (!res.ok) return { ok: false, url: current, why: 'http_' + res.status };

    const buf = new Uint8Array(await res.arrayBuffer());
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, MAX_BYTES));
    const title = (html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)?.[1] ?? '')
      .replace(/\s+/g, ' ').trim();
    const text = toText(html);
    if (isNotAPage(title, text)) return { ok: false, url: current, why: 'not_a_page' };
    return { ok: true, url: current, title, html, text };
  }
  return { ok: false, url: current, why: 'too_many_redirects' };
}

/* ═══ Which links are worth following ═══════════════════════════════ */
const WANTED: Array<{ re: RegExp; why: string }> = [
  { re: /\b(about|who we are|our (story|mission|organi[sz]ation))\b/i, why: 'about' },
  { re: /\b(contact|find us|reach us|our office)\b/i,                  why: 'contact' },
  { re: /\b(board|leadership|our (team|staff)|directors|governance)\b/i, why: 'people' },
  { re: /\b(incentive|financing|abatement|pilot|grants?|tax)\b/i,      why: 'incentives' },
  { re: /\b(sites?|buildings?|properties|industrial park|available land)\b/i, why: 'sites' },
];

export function harvestLinks(html: string, base: string, max = MAX_PAGES):
    Array<{ url: string; text: string; why: string }> {
  let host: string;
  try { host = new URL(base).hostname.replace(/^www\./, ''); } catch { return []; }
  const out: Array<{ url: string; text: string; why: string }> = [];
  const seen = new Set<string>(); const claimed = new Set<string>();

  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,160}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    const label = m[2].replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ').trim();
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue;
    let abs: URL;
    try { abs = new URL(href, base); } catch { continue; }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue;
    if (abs.hostname.replace(/^www\./, '') !== host) continue;
    if (/\.(pdf|jpe?g|png|gif|svg|zip|docx?|xlsx?|mp4|webp|ico|css|js)$/i.test(abs.pathname)) continue;
    abs.hash = '';
    const key = abs.toString().replace(/\/$/, '');
    if (seen.has(key)) continue;

    /* ⚠️ LINK TEXT FIRST, PATH ONLY AS A FALLBACK.
       Matching both together filed bloomingtonedc.com's "Contact Us!" under
       "about", because its path is /about/contact-us. The extractor would
       then have gone looking for a street address on the wrong page. What a
       person reads is the label; the path is a hint, not the label. */
    let hit = WANTED.find((w) => w.re.test(label));
    if (!hit) {
      const path = decodeURIComponent(abs.pathname).replace(/[-_/]+/g, ' ');
      hit = WANTED.find((w) => w.re.test(path));
    }
    if (!hit || claimed.has(hit.why)) continue;

    seen.add(key); claimed.add(hit.why);
    out.push({ url: abs.toString(), text: label.slice(0, 60), why: hit.why });
    if (out.length >= max) break;
  }
  return out;
}

/* ═══ ⚠️ Two passes, because the furniture IS the contact card ═══════
   First attempt stripped everything repeated across pages, to stop the same
   navigation being counted once per page and making a crawl look four times
   more productive than it was. That part was right.

   ⚠️ BUT IT ALSO DELETED THE PHONE NUMBER. TDC prints
   "Let's Chat - 888.699.6757" in the header of every page, so the stripper
   removed it and the run came back with phone and general_email blank from
   a site that displays both on every single page. Contact details are
   *supposed* to repeat. That is what a header and footer are for.

   So: split rather than strip. Unique text answers the narrative questions;
   the repeated block is read separately for the ones that belong on a
   letterhead. */
export function splitBoilerplate(pages: Array<{ text: string }>):
    { unique: string[]; repeated: string } {
  const counts = new Map<string, number>();
  const linesPer = pages.map((p) =>
    p.text.split('\n').map((l) => l.trim()).filter(Boolean));

  for (const lines of linesPer) {
    for (const l of new Set(lines)) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  const threshold = pages.length >= 2 ? 2 : Infinity;
  const isFurniture = (l: string) => (counts.get(l) ?? 0) >= threshold && l.length <= 200;

  const unique = linesPer.map((lines) => lines.filter((l) => !isFurniture(l)).join('\n'));

  /* Each repeated line once, in the order it first appeared. */
  const seen = new Set<string>();
  const rep: string[] = [];
  for (const lines of linesPer) {
    for (const l of lines) {
      if (isFurniture(l) && !seen.has(l)) { seen.add(l); rep.push(l); }
    }
  }
  return { unique, repeated: rep.join('\n') };
}

/* ═══ ⚠️ Evidence has to SUPPORT the value, not merely exist ═════════
   The first run proposed address "Industrial Blvd, Plattsburgh, NY" from the
   snippet "visit our office on Industrial Blvd. built in 2020" - which is
   not an address and does not contain one. It passed because the gate asked
   "is there a snippet?" rather than "does the snippet say this?". A value
   with a quotation that does not contain it is a guess wearing a citation. */
const NORM = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\s+/g, ' ').trim();

/* ⚠️ SOME FIELDS ARE A CLASSIFICATION, NOT A QUOTATION.
   entity_type "other" was refused because the word "other" is not in the
   quote — and it never will be. The page said "a private, not-for-profit
   corporation", which justifies the class perfectly well. A correct answer
   was lost to a rule that does not fit the field. For these, the evidence
   must contain a word that WARRANTS the class, not the class name. */
const CLASS_WORDS: Record<string, RegExp> = {
  entity_type: /\b(ida|industrial development|edc|economic development corporation|ldc|local development|chamber|port authority|city|county|town|village|department|authority|commission|corporation|non[- ]?profit|not[- ]for[- ]profit|inc\b|llc\b|partnership|alliance|agency|district)\b/i,
  /* ⚠️ self_reference WAS HERE AND IT BROKE A WORKING FIELD.
     I assumed a third-person self-reference is always an article phrase -
     "the Agency", "the Corporation" - and required the quote to contain
     the/we/our. TDC refers to itself as "TDC", the quote was "TDC is
     committed to helping businesses grow", and a field that had been
     correct for two rounds started failing. The ordinary rule already
     handles it: the value appears in the quote verbatim. A special case
     that is wrong is worse than no special case. */
};

export function evidenceSupports(value: string, evidence: string, field?: string): boolean {
  const cls = field ? CLASS_WORDS[field] : undefined;
  if (cls) return cls.test(evidence);
  const v = NORM(value), e = NORM(evidence);
  if (!v || !e) return false;
  if (e.includes(v)) return true;
  const words = v.split(' ').filter((w) => w.length > 3);
  if (!words.length) return e.includes(v);
  const hits = words.filter((w) => e.includes(w)).length;
  return hits / words.length >= 0.6;
}

/* ═══ ⚠️ And some fields have a shape ═══════════════════════════════ */
export function fieldProblem(
  name: string, value: string, others: Record<string, string>,
  repeated = '',
): string | null {
  const v = value.trim();
  switch (name) {
    case 'footer_notice': {
      /* ⚠️ "Conversations are always considered confidential" survived two
         rounds as a footer notice. It is a nice sentence on the contact
         page, and it would then have appeared at the bottom of every
         document the organisation produced.
         A footer is, definitionally, the thing on every page — and we
         already know exactly what that is. Use it. */
      if (!repeated) return 'no repeated header or footer was found to check this against';
      const key = NORM(v).split(' ').filter((w) => w.length > 3).slice(0, 4);
      const rep = NORM(repeated);
      const hits = key.filter((w) => rep.includes(w)).length;
      if (!key.length || hits / key.length < 0.5) {
        return 'not in the footer — it appears on one page, so it is a sentence, not a standing notice';
      }
      return null;
    }
    case 'address':
      /* No street number and no postcode is a place, not an address, and it
         is about to be printed at the top of a letter. */
      if (!/\d/.test(v)) return 'no street number or postcode — that is a place, not an address';
      return null;
    case 'phone':
      if ((v.match(/\d/g) ?? []).length < 7) return 'too few digits to be a phone number';
      return null;
    case 'general_email':
      if (!/^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(v)) return 'not an email address';
      return null;
    case 'website':
      if (!/^https?:\/\//i.test(v)) return 'not a url';
      return null;
    case 'founded_year': {
      const y = Number(v.match(/\b(1[6-9]\d{2}|20\d{2})\b/)?.[1]);
      if (!y || y > new Date().getFullYear()) return 'not a plausible year';
      return null;
    }
    case 'legal_name':
      /* ⚠️ "TDC" came back as BOTH legal_name and short_name. When they
         match, the formal name was not found and the abbreviation was used
         instead — and the formal name is the one that goes on a contract. */
      if (others.short_name && NORM(v) === NORM(others.short_name)) {
        return 'same as the short name — the formal name was not actually found';
      }
      if (!v.includes(' ') && v.length <= 6) return 'looks like an acronym, not a legal name';
      return null;
    default:
      return null;
  }
}

/* ═══ Cost, because an uninstrumented model call is how margins go missing ═ */
async function recordUsage(admin: any, row: Record<string, unknown>) {
  try {
    const { data: rate } = await admin.from('model_rates')
      .select('input_per_mtok,output_per_mtok').eq('model', MODEL).maybeSingle();
    const inTok = Number(row.input_tokens ?? 0), outTok = Number(row.output_tokens ?? 0);
    /* An unknown model records ZERO rather than a guess. A zero in a margin
       report is a question; an invented price is a wrong answer. */
    const cost = rate
      ? (inTok / 1e6) * Number(rate.input_per_mtok ?? 0) +
        (outTok / 1e6) * Number(rate.output_per_mtok ?? 0)
      : 0;
    if (!rate) console.warn('research-org: NO RATE CARD for', MODEL, '- cost recorded as 0');

    /* ⚠️ THIS SAID usage_events, AND THERE IS NO SUCH TABLE.
       The table is model_usage. Every research run was costing real money
       and recording it nowhere - and it was invisible because PostgREST
       RETURNS "relation does not exist" as an error value rather than
       throwing it, so the try/catch below never fired and the console said
       nothing. A swallowed error in the one function whose job is to
       measure what things cost. Hence the explicit check. */
    const { error } = await admin.from('model_usage').insert({ ...row, model: MODEL,
      provider: 'openai', cost_usd: Number(cost.toFixed(6)) });
    if (error) console.error('research-org: model_usage insert failed:', error.message);
  } catch (e) {
    /* Never let bookkeeping stop somebody getting their profile. */
    console.warn('research-org: usage not recorded', e);
  }
}

/* ═══ The fields we are willing to propose ══════════════════════════ */
const FIELDS = [
  'legal_name', 'short_name', 'entity_type', 'address', 'phone', 'general_email',
  'website', 'founded_year', 'governing_body', 'municipalities', 'region_label',
  'access_notes', 'top_employers', 'incentive_programs', 'mission', 'tagline',
  'boilerplate', 'self_reference', 'style_notes', 'footer_notice',
];

const SYSTEM = `You read an economic development organisation's own website and
propose entries for their profile. A person will review every one of them.

RULES, IN ORDER OF IMPORTANCE:

1. ONLY WHAT THE PAGES SAY. Never infer, never complete a pattern, never fill
   a gap with what is usually true of organisations like this. If the text
   does not say it, omit the field entirely. Omitting is free; a wrong value
   ends up on a grant application.

2. QUOTE THE SOURCE. Every field carries source_url (the page it came from)
   and evidence: a short verbatim snippet, under 200 characters, from that
   page containing the fact. If you cannot produce the snippet, you did not
   find the fact — omit the field.

3. NEVER PROPOSE A PERSON'S CONTACT DETAILS. No individual's name, direct
   phone, email or title. general_email and phone are the ORGANISATION's main
   ones only, and only if labelled as such. Personal details belong to the
   person, not the organisation, and a shared one signs everybody's letters
   with one colleague's name.

4. NEVER PROPOSE FIGURES THAT GO STALE: population, labour force,
   unemployment, median wage, job counts, dollar totals of investment. They
   are fetched fresh when needed, and a stale one in a proposal ends up in a
   document two years later.

5. WRITE THEM AS THEY WOULD APPEAR. boilerplate and mission are the
   organisation's own prose, lightly tidied, not your summary of it.
   style_notes is only for something the pages SHOW about house style; if
   you are describing what the organisation cares about, that is not a
   style note - omit it. footer_notice is a legal or standing notice, not a
   sentence you liked on the contact page.

6. THE SECTION HEADED "ON EVERY PAGE" is the site's header and footer. That
   is where a phone number, a general email and a postal address live, and
   it is the FIRST place to look for those three. It is the worst place to
   look for anything narrative.

7. legal_name IS THE FORMAL REGISTERED NAME, and it is not the abbreviation.
   If the pages only ever use an acronym, give short_name and OMIT
   legal_name. Two identical values means you did not find one of them.

FIELDS (omit any you cannot evidence):
- legal_name: full formal name, e.g. "Whoville County Industrial Development Agency"
- short_name: what they call themselves in prose, e.g. "Whoville IDA"
- entity_type: IDA / EDC / LDC / chamber / port authority / city department / other
- address: the office address as it would sit on a letterhead
- phone / general_email / website: the organisation's main ones
- founded_year: a four-digit year only
- governing_body: how they are governed, e.g. "a nine-member board appointed by the County Legislature"
- municipalities: the places they serve
- region_label: the region or labour shed as THEY name it
- access_notes: interstates, airports, rail, port, with drive times if given
- top_employers: named employers only
- incentive_programs: programs they administer, with terms if stated
- mission / tagline / boilerplate: their own words
- self_reference: how they refer to themselves in the third person, e.g. "the Agency"
- style_notes: anything evident about house style
- footer_notice: standard footer, FOIL or equal-opportunity notices

Return ONLY JSON:
{"fields":{"<name>":{"value":"...","source_url":"...","evidence":"..."}},
 "not_found":["..."],
 "note":"one sentence if something important was unreadable, else empty"}`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b, null, 2), { status, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const asCaller = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userRes } = await asCaller.auth.getUser();
    const caller = userRes?.user;
    if (!caller?.id) return json({ ok: false, error: 'not_signed_in' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const orgId = Number(body.org_id);
    if (!Number.isFinite(orgId) || orgId <= 0) {
      return json({ ok: false, error: 'Missing org_id' }, 400);
    }

    /* ⚠️ THIS IS A URL FETCHER AND A MODEL CALL, SO IT IS NOT OPEN TO EVERY
       SIGNED-IN USER. Only somebody the team has trusted with the profile
       may run it, asked as the CALLER so the database decides, not us. */
    const { data: allowed, error: canErr } = await asCaller
      .rpc('esq_org_can', { p_org: orgId, p_what: 'profile' });
    if (canErr || allowed !== true) {
      console.warn('research-org: refused for', caller.id, 'org', orgId, canErr?.message);
      return json({ ok: false, error: 'not_allowed_to_edit_this_profile' }, 403);
    }

    /* The site comes from the profile unless one is supplied. */
    const { data: prof } = await admin.from('esq_org_profiles')
      .select('website').eq('org_id', orgId).maybeSingle();
    const site = normalise(String(body.website ?? prof?.website ?? ''));
    if (!site) {
      return json({ ok: false, error: 'no_website',
        message: 'There is no website on this profile yet. Add one and try again.' });
    }

    /* ── crawl ── */
    const home = await getPage(site);
    if (!home.ok) {
      return json({ ok: true, enough: false, site,
        message: 'That website could not be read (' + home.why + '), so there is '
          + 'nothing to propose. It may have moved, or be down.',
        fields: {}, pages_read: [] });
    }
    const links = harvestLinks(home.html, home.url);
    const fetched = await Promise.all(links.map(async (l) => {
      const p = await getPage(l.url);
      return p.ok ? { ...p, why: l.why, link_text: l.text } : null;
    }));
    const pages = [{ ...home, why: 'home', link_text: 'home' },
                   ...fetched.filter(Boolean) as any[]];

    /* ── ⚠️ split the furniture out, do not discard it ── */
    const { unique: cleaned, repeated } = splitBoilerplate(pages);
    const unique = cleaned.reduce((n, t) => n + t.length, 0);
    const raw = pages.reduce((n, p) => n + p.text.length, 0);

    /* ⚠️ BELOW THIS, THERE IS NOTHING HONEST TO SAY. Measured on real sites:
       a thin one yields about 3,000 characters, most of it furniture. Asking
       a model to produce twenty fields from that is asking it to invent. */
    if (unique < 1200) {
      return json({ ok: true, enough: false, site,
        message: 'I could only find about ' + unique + ' characters of real content '
          + 'on that site — not enough to fill in a profile from without guessing. '
          + 'Worth doing by hand.',
        unique_chars: unique, raw_chars: raw,
        pages_read: pages.map((p) => ({ url: p.url, why: p.why })),
        fields: {} });
    }

    const corpus = (
      (repeated
        ? '### ON EVERY PAGE (the header and footer — look here for phone, '
          + 'email and postal address)\n' + repeated + '\n\n'
        : '') +
      pages.map((p, i) =>
        '### ' + (p.why as string).toUpperCase() + ' — ' + p.url + '\n' + cleaned[i])
        .join('\n\n')
    ).slice(0, MAX_PROSE);

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, temperature: 0, max_tokens: 2500,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: SYSTEM },
                   { role: 'user', content: corpus }],
      }),
    });
    const data = await res.json();
    if (data.error) {
      console.error('research-org: provider', data.error);
      return json({ ok: false, error: 'The research step failed. Nothing was saved.' }, 502);
    }

    await recordUsage(admin, {
      user_id: caller.id, user_email: caller.email ?? null,
      feature: 'research-org',
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
    });

    let parsed: any = {};
    try { parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}'); }
    catch { parsed = {}; }

    /* ⚠️ THE MODEL'S OUTPUT IS A PROPOSAL, NOT A RESULT. Anything without a
       real field name, a value, and a verbatim snippet from a page we
       actually read is dropped — that is the difference between "found on
       your About page" and "sounds plausible". */
    const readUrls = new Set(pages.map((p) => p.url));
    const raws: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.fields ?? {})) {
      raws[k] = String((v as Record<string, unknown>)?.value ?? '').trim();
    }

    const out: Record<string, unknown> = {};
    const rejected: string[] = [];

    /* We fetched it. Asking a model to tell us the address of the page we
       just read is a way to get it wrong. */
    out.website = { value: home.url, source_url: home.url,
                    evidence: 'the page that was read' };
    for (const [k, v] of Object.entries(parsed.fields ?? {})) {
      const f = v as Record<string, unknown>;
      const value = String(f?.value ?? '').trim();
      const src = String(f?.source_url ?? '').trim();
      const ev = String(f?.evidence ?? '').trim();
      if (k === 'website') continue;   /* already taken from the crawl */
      if (!FIELDS.includes(k)) { rejected.push(k + ' — not a profile field'); continue; }
      if (!value)               { rejected.push(k + ' — empty'); continue; }
      if (!ev)                  { rejected.push(k + ' — no evidence quoted'); continue; }
      if (!readUrls.has(src))   { rejected.push(k + ' — cited a page we never read'); continue; }
      if (!evidenceSupports(value, ev, k)) {
        rejected.push(k + ' — the quote does not contain the value: "' +
          value.slice(0, 40) + '" vs "' + ev.slice(0, 60) + '"');
        continue;
      }
      const problem = fieldProblem(k, value, raws, repeated);
      if (problem) { rejected.push(k + ' — ' + problem + ' ("' + value.slice(0, 40) + '")'); continue; }
      out[k] = { value: value.slice(0, 4000), source_url: src, evidence: ev.slice(0, 300) };
    }

    return json({
      ok: true, enough: true, site,
      saved: false,
      message: 'Nothing has been saved. Review each one and keep what is right.',
      proposed: Object.keys(out).length,
      still_blank: FIELDS.filter((f) => !(f in out)),
      rejected,
      unique_chars: unique, raw_chars: raw,
      pages_read: pages.map((p) => ({ url: p.url, why: p.why, chars: p.text.length })),
      fields: out,
      note: String(parsed.note ?? '').slice(0, 300),
    });
  } catch (e) {
    console.error('research-org: unhandled', e);
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
