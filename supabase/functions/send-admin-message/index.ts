// ============================================================
// Supabase Edge Function: send-admin-message
//
// Emails one user a message written by an admin in the admin panel.
//
// WHY THIS EXISTS
//
// The "Msg" button in admin.html inserted a row into admin_messages and
// showed a toast reading "Message sent to <email>". Nothing was sent. That
// row is the in-app banner checkAdminMessages() renders the NEXT TIME the
// person signs in — so a message to someone who never comes back is a
// message to nobody, and the admin has no way to tell.
//
// This is the actual email half. The in-app banner still gets written, so
// the message is waiting for them in the product too.
//
// SECURITY
//
// verify_jwt stays TRUE (the default). The caller must present a valid
// Supabase JWT, and this function then confirms — server side, with the
// service role — that the caller is an admin. A signed-in ordinary user
// cannot use this to mail other users.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY    = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY       = Deno.env.get('SUPABASE_ANON_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;

const SITE_URL   = 'https://econsquad.ai';
const FROM_EMAIL = 'EconSquad AI <eric@econsquad.ai>';

const MAX_RECIPIENTS = 300;   // hard cap; protects send reputation and quota
const SEND_DELAY_MS  = 60;    // Resend rate limit, same as send-reengagement

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: CORS });

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Preserve the admin's line breaks without letting them inject markup.
function paragraphs(text: string): string {
  return esc(text)
    .split(/\n{2,}/)
    .map(p => `<p style="font-size:15px;line-height:1.7;color:#2d3748;margin:0 0 16px;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST')    return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
    if (!RESEND_API_KEY) return json({ ok: false, error: 'RESEND_API_KEY not configured' }, 500);

    // Who is asking? Derive from the JWT, never the body.
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return json({ ok: false, error: 'no_auth' }, 401);

    const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await asCaller.auth.getUser();
    const caller = userRes?.user;
    if (!caller?.email) return json({ ok: false, error: 'no_user' }, 401);

    // Confirm they are an admin. public.admins is keyed by EMAIL.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: adminRow } = await admin
      .from('admins').select('email').ilike('email', caller.email).maybeSingle();
    if (!adminRow) {
      console.warn(`send-admin-message: ${caller.email} is not an admin`);
      return json({ ok: false, error: 'not_admin' }, 403);
    }

    const payload = await req.json();
    const { to, recipients, title, body, respectOptOut } = payload;

    // Accept one address or a list. The admin panel sends `to` for a single
    // reply and `recipients` for a segment.
    let list: string[] = Array.isArray(recipients) ? recipients : (to ? [to] : []);
    list = [...new Set(
      list.map((e: unknown) => String(e || '').trim().toLowerCase()).filter(Boolean),
    )];

    if (!list.length || !title || !body) {
      return json({ ok: false, error: 'Missing recipients, title or body' }, 400);
    }
    // A cap, not a limit to design around. Anything larger than this is a
    // real campaign and belongs in a proper mail tool, not an admin panel.
    if (list.length > MAX_RECIPIENTS) {
      return json({ ok: false, error: `Too many recipients (${list.length}). Max ${MAX_RECIPIENTS}.` }, 400);
    }

    // Honour the opt-out for anything that is not a one-to-one reply.
    // send-reengagement treats monday_drop_subscribers.unsubscribed_at as the
    // single opt-out for the whole product; a bulk admin message is exactly
    // the sort of thing someone unsubscribing meant to stop.
    let skipped: string[] = [];
    if (respectOptOut && list.length) {
      const { data: outs } = await admin
        .from('monday_drop_subscribers')
        .select('email')
        .not('unsubscribed_at', 'is', null);
      const optedOut = new Set((outs || []).map((r: any) => String(r.email || '').toLowerCase()));
      skipped = list.filter(e => optedOut.has(e));
      list    = list.filter(e => !optedOut.has(e));
    }

    if (!list.length) {
      return json({ ok: true, sent: 0, failed: [], skipped, note: 'Everyone in this segment has unsubscribed.' });
    }

    // Names, so each email can open with the right first name.
    const { data: profs } = await admin
      .from('profiles').select('email, full_name').in('email', list);
    const nameFor: Record<string, string> = {};
    (profs || []).forEach((p: any) => {
      const e = String(p.email || '').toLowerCase();
      const f = String(p.full_name || '').trim().split(/\s+/)[0] || '';
      if (e) nameFor[e] = f;
    });

    const sent: { email: string; id: string | null }[] = [];
    const failed: { email: string; error: string }[] = [];

    for (const addr of list) {
      const r = await sendOne(addr, nameFor[addr] || '', String(title), String(body));
      if (r.ok) sent.push({ email: addr, id: r.id ?? null });
      else failed.push({ email: addr, error: r.error ?? 'unknown' });
      // Stay inside Resend's rate limit, same as send-reengagement.
      if (list.length > 1) await new Promise(r => setTimeout(r, SEND_DELAY_MS));
    }

    // Log the Resend id per recipient. "Did it arrive?" is otherwise a hunt
    // through the Resend dashboard by address and guessed timestamp; with the
    // id it is one lookup. Costs nothing to carry.
    sent.forEach(x => console.log(`send-admin-message: ${x.email} -> resend ${x.id ?? 'no-id'}`));
    console.log(`send-admin-message: ${sent.length} sent, ${failed.length} failed, ${skipped.length} skipped, by ${caller.email}`);

    return json({
      ok: failed.length === 0,
      sent: sent.length,
      ids: sent,            // [{email, id}] — paste an id into Resend to see its status
      failed,
      skipped,
    });

  } catch (e) {
    console.error('send-admin-message threw:', e instanceof Error ? e.message : String(e));
    return json({ ok: false, error: 'unhandled' }, 500);
  }
});

type SendResult = { ok: boolean; id?: string | null; error?: string };

/** Build and send one email. Returns Resend's message id on success. */
async function sendOne(to: string, first: string, title: string, body: string): Promise<SendResult> {
  try {
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">

  <div style="margin-bottom:16px;">
    <span style="font-size:14px;font-weight:900;color:#1a202c;letter-spacing:.02em;">ECONSQUAD AI</span>
  </div>

  <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:26px 28px;margin-bottom:14px;">
    <h1 style="font-size:19px;font-weight:700;color:#1a202c;margin:0 0 18px;line-height:1.35;">${esc(title)}</h1>
    ${first ? `<p style="font-size:15px;line-height:1.7;color:#2d3748;margin:0 0 16px;">Hi ${esc(first)},</p>` : ''}
    ${paragraphs(String(body))}
    <div style="margin-top:24px;">
      <a href="${SITE_URL}" style="display:inline-block;background:#aaff3e;color:#0a1a00;font-size:14px;font-weight:700;padding:11px 26px;border-radius:7px;text-decoration:none;">Open EconSquad AI &rarr;</a>
    </div>
  </div>

  <p style="font-size:11px;color:#a0aec0;text-align:center;margin:0;">
    You're receiving this because you have an EconSquad AI account.<br>
    <a href="${SITE_URL}" style="color:#a0aec0;">${SITE_URL}</a>
  </p>

</div></body></html>`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject: title, html }),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error(`send-admin-message: Resend ${r.status} for ${to}: ${detail}`);
      return { ok: false, error: `Resend ${r.status}: ${detail.slice(0, 160)}` };
    }
    const out = await r.json().catch(() => ({} as any));
    return { ok: true, id: out?.id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
