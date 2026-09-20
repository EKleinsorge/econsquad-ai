// supabase/functions/fetch-probe/index.ts
//
// ═══════════════════════════════════════════════════════════════════════
//  CAN AN EDGE FUNCTION READ AN EDC'S WEBSITE?
// ═══════════════════════════════════════════════════════════════════════
//
// Everything downstream of this question is guesswork until it is answered:
// Emma's research engine (2,822 websites) and the idea of researching an
// organisation's profile and proposing it for approval both need it, and it
// has never been tested. It could not be tested from the Cowork container,
// whose egress allowlist blocked all fourteen domains sampled.
//
// So: a probe. It fetches a handful of real EDC sites and reports exactly
// what happened to each — status, type, size, how long, and whether the body
// actually looks like a page rather than a consent wall or a bot check.
//
// ⚠️ THIS IS A URL FETCHER, WHICH IS TO SAY IT IS AN OPEN PROXY IF YOU LET
// IT BE. Everything below that looks like paranoia is the reason it is safe
// to leave deployed:
//
//   - ADMIN ONLY. Same check as org-provision: the caller's own JWT is
//     verified and their email looked up in public.admins.
//   - NO PRIVATE ADDRESSES. Loopback, link-local, and the RFC1918 ranges are
//     refused — including 169.254.169.254, the cloud metadata endpoint, which
//     is the single most valuable thing an attacker can reach through a
//     server-side fetcher.
//   - THE HOSTNAME IS RESOLVED AND THE RESOLVED ADDRESSES CHECKED, not just
//     the text of the URL. "internal.example.com" pointing at 10.0.0.5 is the
//     whole trick, and checking the string alone would miss it.
//   - REDIRECTS ARE FOLLOWED BY HAND, three at most, and every hop is checked
//     again. A public URL that 302s to 169.254.169.254 is the same attack
//     wearing a hat.
//   - http:// AND https:// ONLY. No file:, no data:, no gopher:.
//   - A timeout, a byte cap, and only a short extract comes back. It answers
//     "can we read this", not "here is the internet".
//
// ⚠️ IT WRITES NOTHING. No table is touched. Delete the function when the
// question is answered and nothing else breaks.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Content-Type': 'application/json',
};

const MAX_URLS     = 12;
const TIMEOUT_MS   = 12000;
const MAX_BYTES    = 400_000;
const MAX_REDIRECTS = 3;

/* ── Is this address one we must never reach? ──────────────────────── */
export function isPrivateAddress(ip: string): boolean {
  const v = ip.trim().toLowerCase();

  /* IPv6 */
  if (v.includes(':')) {
    if (v === '::' || v === '::1') return true;          // loopback
    if (v.startsWith('fe80')) return true;               // link-local
    if (v.startsWith('fc') || v.startsWith('fd')) return true; // unique local
    /* ::ffff:10.0.0.1 — an IPv4 address in IPv6 clothing */
    const tail = v.split(':').pop() || '';
    if (tail.includes('.')) return isPrivateAddress(tail);
    return false;
  }

  const p = v.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0)   return true;                 // "this network"
  if (a === 127) return true;                 // loopback
  if (a === 10)  return true;                 // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;    // ⚠️ link-local AND cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true;                  // multicast and reserved
  return false;
}

export function hostLooksInternal(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.home.arpa')) return true;
  if (!h.includes('.')) return true;          // a bare name is not the public web
  /* A literal address in the URL skips DNS entirely, so check it directly. */
  if (/^[0-9.]+$/.test(h) || h.includes(':')) return isPrivateAddress(h);
  return false;
}

/* Resolve and check where it actually points. The string test above catches
   the obvious; this catches the deliberate. */
async function resolvesSomewhereSafe(host: string): Promise<{ ok: boolean; why: string }> {
  const dns = (Deno as unknown as {
    resolveDns?: (h: string, t: string) => Promise<string[]>;
  }).resolveDns;
  if (typeof dns !== 'function') {
    /* ⚠️ Fails CLOSED, unlike the DNS check in org-invite which fails open.
       There, a guard that blocks a real invitation is worse than no guard.
       Here, the thing being guarded is "do not fetch an internal address",
       and an unverified fetch is exactly what must not happen. */
    return { ok: false, why: 'dns_unavailable' };
  }
  const addrs: string[] = [];
  for (const type of ['A', 'AAAA']) {
    try { addrs.push(...(await dns(host, type))); } catch { /* nothing of that type */ }
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
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null;   // some other scheme
    u = 'https://' + u;
  }
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch { return null; }
}

/* Does the body look like a page somebody could read, or like a wall? */
export function describeBody(html: string): { looks: string; title: string; textChars: number } {
  const title = (html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)?.[1] ?? '')
    .replace(/\s+/g, ' ').trim().slice(0, 120);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const low = (title + ' ' + text.slice(0, 1500)).toLowerCase();
  let looks = 'readable';
  /* ⚠️ A 404 page is full of navigation and read as "readable" in the first
     run. The verdict was still right, because it counts only ok responses,
     but the per-row label lied. A page that says it is not a page is not a
     source, whatever its status code claims. */
  if (/page not found|404 not found|^404\b|no longer here|never existed/.test(low)) {
    looks = '⚠️ not a page';
  } else if (text.length < 400) {
    looks = 'almost no text — probably rendered by javascript';
  }
  if (/just a moment|checking your browser|cloudflare|enable javascript to continue/.test(low)) {
    looks = '⚠️ bot check';
  } else if (/access denied|forbidden|are you a robot|captcha/.test(low)) {
    looks = '⚠️ blocked';
  }
  return { looks, title, textChars: text.length };
}

/* ── Which of a page's links are worth reading? ───────────────────────
   ⚠️ GUESSING PATHS DOES NOT WORK. Four of six guessed URLs came back 404:
   plantcityedc.com puts "About" in its menu and does not serve /about, and
   bloomingtonedc.com has a "Contact Us!" link that is not /contact-us.

   But every home page in the sample came back as almost pure navigation -
   "About  Leadership  Our Staff  Join  Contact  Community Data" - which was
   the complaint and is now the answer. The menu IS the map. Read the links
   rather than inventing them. */
const WANTED: Array<{ re: RegExp; why: string }> = [
  { re: /\b(about|who we are|our (story|mission|organi[sz]ation))\b/i, why: 'about' },
  { re: /\b(contact|find us|reach us|our office)\b/i,                  why: 'contact' },
  { re: /\b(board|leadership|our (team|staff)|directors|governance)\b/i, why: 'people' },
  { re: /\b(incentive|programs?|financing|tax|pilot|abatement|grants?)\b/i, why: 'incentives' },
  { re: /\b(sites?|buildings?|properties|industrial park|available land)\b/i, why: 'sites' },
  { re: /\b(community|demographics|data|labor|workforce)\b/i,          why: 'community' },
];

export function harvestLinks(html: string, base: string, max = 6):
    Array<{ url: string; text: string; why: string }> {
  let host: string;
  try { host = new URL(base).hostname.replace(/^www\./, ''); } catch { return []; }

  const out: Array<{ url: string; text: string; why: string }> = [];
  const seen = new Set<string>();
  const bestPerReason = new Set<string>();

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
    /* ⚠️ Same site only. Following an outbound link would have us fetching
       whatever a third party put in somebody's footer. */
    if (abs.hostname.replace(/^www\./, '') !== host) continue;
    /* Not a file, and not the page we are already on. */
    if (/\.(pdf|jpe?g|png|gif|svg|zip|docx?|xlsx?|mp4|webp|ico|css|js)$/i.test(abs.pathname)) continue;
    abs.hash = '';
    const key = abs.toString().replace(/\/$/, '');
    if (seen.has(key)) continue;

    /* Match on the LINK TEXT first - it is what a person reads - and fall
       back to the path, since plenty of menus are images or icons. */
    const hay = label + ' ' + decodeURIComponent(abs.pathname).replace(/[-_/]+/g, ' ');
    const hit = WANTED.find((w) => w.re.test(hay));
    if (!hit) continue;
    /* One page per kind of thing. Six "programs" links is not six sources. */
    if (bestPerReason.has(hit.why)) continue;

    seen.add(key); bestPerReason.add(hit.why);
    out.push({ url: abs.toString(), text: label.slice(0, 60), why: hit.why });
    if (out.length >= max) break;
  }
  return out;
}

async function probeOne(rawUrl: string): Promise<Record<string, unknown>> {
  const started = Date.now();
  const out: Record<string, unknown> = { input: rawUrl };

  const url = normalise(rawUrl);
  if (!url) return { ...out, ok: false, refused: 'not_an_http_url' };

  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const host = new URL(current).hostname;

    if (hostLooksInternal(host)) {
      return { ...out, ok: false, refused: 'internal_host', at: current };
    }
    const dnsCheck = await resolvesSomewhereSafe(host);
    if (!dnsCheck.ok) {
      return { ...out, ok: false, refused: dnsCheck.why, at: current };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          /* Honest about who we are. A site that refuses this is telling us
             something we need to know before building on top of it. */
          'User-Agent': 'EconSquadAI-Research/1.0 (+https://econsquad.ai)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
    } catch (e) {
      clearTimeout(timer);
      const msg = String((e as Error)?.message ?? e);
      return { ...out, ok: false,
        error: /abort/i.test(msg) ? 'timeout_after_' + TIMEOUT_MS + 'ms' : msg.slice(0, 160),
        ms: Date.now() - started, at: current };
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return { ...out, ok: false, error: 'redirect_with_no_location', status: res.status };
      /* ⚠️ Resolved against the current URL and re-checked on the next pass.
         A public page that redirects to 169.254.169.254 is the attack. */
      current = new URL(loc, current).toString();
      continue;
    }

    const type = res.headers.get('content-type') ?? '';
    const buf = new Uint8Array(await res.arrayBuffer());
    const body = new TextDecoder('utf-8', { fatal: false })
      .decode(buf.slice(0, MAX_BYTES));
    const shape = describeBody(body);

    return {
      ...out, ok: res.ok, status: res.status, ms: Date.now() - started,
      final: current !== url ? current : undefined,
      bytes: buf.length, truncated: buf.length > MAX_BYTES,
      content_type: type.split(';')[0].trim(),
      title: shape.title, text_chars: shape.textChars, looks: shape.looks,
      __html: body,
      extract: shape.textChars ? body
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) : '',
    };
  }
  return { ...out, ok: false, error: 'too_many_redirects' };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b, null, 2), { status, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
    /* ── Admin only. Same shape as org-provision. ── */
    const authHeader = req.headers.get('Authorization') || '';
    const asCaller = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userRes } = await asCaller.auth.getUser();
    const caller = userRes?.user;
    if (!caller?.email) return json({ ok: false, error: 'not_signed_in' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: adminRow } = await admin
      .from('admins').select('email').ilike('email', caller.email).maybeSingle();
    if (!adminRow) {
      console.warn('fetch-probe: not an admin:', caller.email);
      return json({ ok: false, error: 'not_admin' }, 403);
    }

    const body = await req.json().catch(() => ({}));

    /* Either an explicit list, or a real sample from the outreach table —
       which is the question that actually matters. */
    let urls: string[] = [];
    let source = 'given';
    if (Array.isArray(body.urls) && body.urls.length) {
      urls = body.urls.slice(0, MAX_URLS).map(String);
    } else {
      const n = Math.min(Number(body.sample) || 6, MAX_URLS);
      source = 'outreach_orgs';
      const { data: rows } = await admin
        .from('outreach_orgs').select('website')
        .not('website', 'is', null).limit(n * 4);
      const seen = new Set<string>();
      for (const r of rows ?? []) {
        const w = String((r as { website?: string }).website ?? '').trim();
        if (!w || seen.has(w)) continue;
        seen.add(w); urls.push(w);
        if (urls.length >= n) break;
      }
    }

    if (!urls.length) {
      return json({ ok: false, error: 'no_urls',
        note: 'Nothing in outreach_orgs.website, and none were given.' });
    }

    /* ── follow:true reads the menu and then reads what it points at ── */
    const follow = body.follow === true;
    const perSite = Math.min(Number(body.pages) || 4, 6);

    let results: Array<Record<string, unknown>>;
    if (follow) {
      results = [];
      for (const u of urls) {
        const home = await probeOne(u);
        const html = String(home.__html ?? '');
        delete home.__html;
        const links = html ? harvestLinks(html, String(home.final ?? normalise(u) ?? u), perSite) : [];
        home.links_found = links.map((l) => l.why + ': ' + l.text);

        const pages: Array<Record<string, unknown>> = await Promise.all(
          links.map(async (l): Promise<Record<string, unknown>> => {
            const r = await probeOne(l.url);
            delete r.__html;
            return { ...r, why: l.why, link_text: l.text };
          }));

        /* What actually matters: how much usable prose the whole visit
           yielded, versus the home page alone. */
        const ok = [home, ...pages].filter((r) => r.ok && r.looks === 'readable');
        home.pages = pages;
        home.total_text_chars = ok.reduce((n, r) => n + Number(r.text_chars ?? 0), 0);
        home.home_text_chars = home.ok && home.looks === 'readable'
          ? Number(home.text_chars ?? 0) : 0;
        home.usable_pages = ok.length;
        results.push(home);
      }
    } else {
      results = await Promise.all(urls.map(async (u) => {
        const r = await probeOne(u); delete r.__html; return r;
      }));
    }
    const readable = results.filter((r) => r.ok && r.looks === 'readable').length;
    const blocked  = results.filter((r) => String(r.looks ?? '').startsWith('⚠️')).length;
    const failed   = results.filter((r) => !r.ok).length;

    if (follow) {
      const gained = results.reduce((n, r) => n + Number(r.total_text_chars ?? 0), 0);
      const homeOnly = results.reduce((n, r) => n + Number(r.home_text_chars ?? 0), 0);
      return json({
        ok: true,
        verdict: homeOnly === 0
          ? '⚠️ Nothing readable at all.'
          : 'Following the menu turned ' + homeOnly + ' characters of home-page '
            + 'navigation into ' + gained + ' characters across '
            + results.reduce((n, r) => n + Number(r.usable_pages ?? 0), 0)
            + ' readable pages — ' + (gained / Math.max(homeOnly, 1)).toFixed(1)
            + 'x more to work with.',
        sites: results.length, source, results,
      });
    }

    return json({
      ok: true,
      verdict: readable === 0
        ? '⚠️ NOTHING was readable. Research from an edge function will not work as-is.'
        : readable === results.length
          ? 'Every site came back readable. The research engine is buildable.'
          : readable + ' of ' + results.length + ' readable — workable, with a fallback for the rest.',
      tried: results.length, readable, blocked_or_botwalled: blocked, failed,
      source,
      results,
    });
  } catch (e) {
    console.error('fetch-probe: unhandled', e);
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
