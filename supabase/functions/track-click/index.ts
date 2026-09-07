// supabase/functions/track-click/index.ts
//
// Records that a specific person clicked a link in one of Emma's emails.
//
// verify_jwt MUST BE FALSE for this one. The whole point is that it runs before
// anybody has an account — somebody reading a cold email is not signed in and
// never will be if this fails. That makes it the only deliberately public
// endpoint in the product, so it is written to be dull: it takes a token,
// writes one row to a log, and returns nothing about anybody.
//
// WHAT IT CANNOT DO, BY CONSTRUCTION
//   - It never returns the contact. A valid token in, an empty 204 out. So it
//     cannot be used to check whether an address is on the list.
//   - An unknown token is accepted silently and recorded nowhere. Guessing gets
//     the same response as being right, so the endpoint cannot be used to
//     enumerate tokens (48 random bits, but the principle is what matters).
//   - Repeat clicks inside a minute are ignored, so a reload loop or a retrying
//     scanner cannot fill the table.
//
// ⚠️ A CLICK IS NOT ALWAYS A PERSON. Corporate mail security opens every link
// in a message before it reaches the inbox. Those are recorded with
// human_click = false and never counted as interest.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/* Things that open a link without a human deciding to. Not exhaustive and never
   will be — which is why the send-time window below matters more than the list. */
const SCANNERS = [
  'proofpoint', 'mimecast', 'barracuda', 'symantec', 'forcepoint', 'ironport',
  'microsoft office', 'officescan', 'defender', 'safelinks', 'urldefense',
  'bot', 'crawler', 'spider', 'slurp', 'preview', 'fetcher', 'monitor',
  'headless', 'python-requests', 'curl/', 'wget', 'go-http-client', 'okhttp',
];

export function looksAutomated(ua: string, secondsSinceSend: number | null): boolean {
  const u = (ua || '').toLowerCase();
  if (!u) return true;                                  // no agent at all is not a browser
  if (SCANNERS.some((s) => u.includes(s))) return true;
  // Mail security opens links within seconds of delivery, from a datacentre,
  // long before anybody has read the message. Ninety seconds is generous.
  if (secondsSinceSend !== null && secondsSinceSend < 90) return true;
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  // Always 204. The caller learns nothing either way.
  const done = () => new Response(null, { status: 204, headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.k ?? '').trim().toLowerCase();
    if (!/^[0-9a-f]{8,32}$/.test(token)) return done();

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: contact } = await admin
      .from('outreach_contacts').select('id,last_touch_at').eq('link_token', token).maybeSingle();
    if (!contact) return done();   // unknown token: same response, no record

    // A reload, a back button, or a scanner retrying should not become three
    // clicks. One row a minute is plenty to establish that somebody engaged.
    const { data: recent } = await admin
      .from('outreach_clicks').select('id')
      .eq('contact_id', contact.id)
      .gte('clicked_at', new Date(Date.now() - 60_000).toISOString())
      .limit(1);
    if (recent && recent.length) return done();

    const ua = req.headers.get('user-agent') ?? '';
    const since = contact.last_touch_at
      ? (Date.now() - new Date(contact.last_touch_at).getTime()) / 1000
      : null;

    await admin.from('outreach_clicks').insert({
      contact_id: contact.id,
      token,
      landing:  String(body.landing ?? '').slice(0, 300) || null,
      referrer: String(body.referrer ?? '').slice(0, 300) || null,
      user_agent: ua.slice(0, 300) || null,
      human_click: !looksAutomated(ua, since),
    });

    return done();
  } catch (e) {
    console.error('track-click:', e instanceof Error ? e.message : String(e));
    return done();
  }
});
