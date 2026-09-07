// supabase/functions/dispatch-alerts/index.ts
//
// Sends the alerts raised by the database triggers in 20260904_alerts.sql.
//
// HOW IT IS CALLED
//
//   1. By pg_net, the instant a trigger fires. The body carries an event_id,
//      which this function IGNORES for anything other than logging - it drains
//      whatever is pending by asking the database, never by trusting the
//      caller. That is why it is safe for the trigger to authenticate with the
//      anon key: there is nothing a caller can ask this function to do except
//      "check the queue", and an empty queue is a single cheap query.
//
//   2. By admin.html, with { test: true, recipient_id }. That path DOES take
//      instruction from the caller, so it is gated on the caller being a real
//      admin - checked against public.admins by email, the same way
//      send-admin-message does it.
//
// WHY PROBLEM REPORTS ARE DELEGATED
//
// The problem-report email - with the repo map and the Claude fix prompt - is
// long, good, and already lives in notify-problem-report. Copying it here
// would create two versions that drift apart the first time one is edited.
// Instead this function calls that one and passes the recipient list the
// Alerts page decided on. One template, one owner, and the alerts system still
// controls who receives it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY       = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const TWILIO_SID     = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_TOKEN   = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_FROM    = Deno.env.get('TWILIO_FROM_NUMBER') ?? '';

const FROM_EMAIL = 'EconSquad AI <eric@econsquad.ai>';
const SITE_URL   = 'https://econsquad.ai';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

type Recipient = {
  id: string; name: string; email: string | null; phone: string | null;
  is_active: boolean; quiet_start: string | null; quiet_end: string | null;
  timezone: string; sms_daily_cap: number;
};

type AlertEvent = {
  id: number; type_key: string; title: string; body_text: string;
  body_html: string | null; meta: Record<string, unknown>;
};

/* ── Quiet hours ────────────────────────────────────────────────
   Applies to texts only, and never to an urgent type. Wrap-around is the
   normal case, not the exception: 22:00 to 07:00 crosses midnight. Getting
   that backwards would silence exactly the window it is meant to protect. */
export function inQuietHours(r: Recipient, now = new Date()): boolean {
  if (!r.quiet_start || !r.quiet_end) return false;
  let local: string;
  try {
    local = new Intl.DateTimeFormat('en-GB', {
      timeZone: r.timezone || 'America/Chicago',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(now);
  } catch {
    return false;   // a bad timezone must not silence someone permanently
  }
  const mins = (hhmm: string) => {
    const [h, m] = hhmm.split(':');
    return Number(h) * 60 + Number(m);
  };
  const t = mins(local);
  const s = mins(r.quiet_start);
  const e = mins(r.quiet_end);
  return s <= e ? (t >= s && t < e) : (t >= s || t < e);
}

export function toE164(phone: string): string | null {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

/* ── Sending ────────────────────────────────────────────────── */

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) return { ok: false, detail: 'RESEND_API_KEY is not set on this project' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, detail: `Resend ${res.status}: ${data?.message ?? 'unknown error'}` };
    return { ok: true, id: data?.id ?? null };
  } catch (e) {
    return { ok: false, detail: `Resend unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function sendSms(to: string, text: string) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    const missing = [
      !TWILIO_SID && 'TWILIO_ACCOUNT_SID',
      !TWILIO_TOKEN && 'TWILIO_AUTH_TOKEN',
      !TWILIO_FROM && 'TWILIO_FROM_NUMBER',
    ].filter(Boolean).join(', ');
    return { ok: false, detail: `Twilio is not configured - missing ${missing}` };
  }
  const e164 = toE164(to);
  if (!e164) return { ok: false, detail: `"${to}" is not a usable phone number` };
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: e164, From: TWILIO_FROM, Body: text }).toString(),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Twilio's own words. A "21610 unsubscribed recipient" is a completely
      // different problem from "20003 authenticate", and hiding which is which
      // is how a dead toggle stays dead for a month.
      return { ok: false, detail: `Twilio ${data?.code ?? res.status}: ${data?.message ?? 'unknown error'}` };
    }
    return { ok: true, id: data?.sid ?? null };
  } catch (e) {
    return { ok: false, detail: `Twilio unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/* ── The generic email ──────────────────────────────────────── */

const ACCENT: Record<string, string> = {
  growth:  '#16a34a',
  money:   '#2563eb',
  support: '#dc2626',
  ops:     '#64748b',
};

function renderEmail(ev: AlertEvent, category: string, label: string): string {
  const accent = ACCENT[category] ?? ACCENT.ops;
  const rows = Object.entries(ev.meta ?? {})
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([k, v]) => `
      <tr>
        <td style="padding:7px 0;font-size:10px;font-weight:700;color:#718096;letter-spacing:.07em;text-transform:uppercase;white-space:nowrap;vertical-align:top;">${esc(k.replace(/_/g, ' '))}</td>
        <td style="padding:7px 0 7px 16px;font-size:14px;color:#2d3748;word-break:break-word;">${esc(v)}</td>
      </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">
  <div style="margin-bottom:16px;">
    <span style="font-size:14px;font-weight:900;color:#1a202c;letter-spacing:.02em;">ECONSQUAD AI</span>
    <span style="background:${accent}14;border:1px solid ${accent}55;color:${accent};font-size:10px;font-weight:700;padding:2px 9px;border-radius:4px;letter-spacing:.07em;text-transform:uppercase;margin-left:8px;">${esc(label)}</span>
  </div>
  <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:22px 24px;">
    <h2 style="font-size:16px;font-weight:700;color:#1a202c;margin:0 0 8px;line-height:1.35;">${esc(ev.title)}</h2>
    <div style="font-size:14px;color:#4a5568;line-height:1.7;white-space:pre-wrap;margin-bottom:18px;">${esc(ev.body_text)}</div>
    ${rows ? `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-top:1px solid #edf2f7;margin-bottom:18px;">${rows}</table>` : ''}
    <a href="${SITE_URL}/admin.html" style="display:inline-block;background:${accent};color:#ffffff;font-size:12px;font-weight:700;padding:9px 20px;border-radius:6px;text-decoration:none;">Open the admin panel &rarr;</a>
  </div>
  <div style="font-size:11px;color:#a0aec0;margin-top:14px;line-height:1.6;">
    You are receiving this because you are listed under Alerts in the EconSquad AI admin panel.
    Change what you get, or stop these, on that page.
  </div>
</div></body></html>`;
}

/* A text message is GSM-7 encoded at 160 characters per segment - UNLESS it
   contains one character outside that alphabet, at which point the whole
   message becomes UCS-2 and the limit drops to 70. One em dash therefore
   triples the cost of every alert.

   This was not theoretical. The first live test showed "# Segments: 3" for a
   145-character message, because this function joined lines with a real em
   dash. Curly quotes, ellipses and arrows do the same thing, and they arrive
   invisibly through copy-paste - an organisation name pasted out of Word is
   enough. So everything is transliterated to plain ASCII rather than trusted. */
const GSM7_SAFE: Record<string, string> = {
  '—': '-',  '–': '-',  '−': '-',      // em dash, en dash, minus
  '‘': "'",  '’': "'",  '‚': "'",      // curly single quotes
  '“': '"',  '”': '"',  '„': '"',      // curly double quotes
  '…': '...', '•': '*', '·': '.',      // ellipsis, bullets
  '→': '->', '←': '<-', ' ': ' ',      // arrows, non-breaking space
  '™': 'TM', '®': '(R)', '©': '(C)',
};

/* The GSM-7 basic alphabet. Anything outside this and the extension table
   forces UCS-2, so it is replaced rather than sent. */
const GSM7 =
  '@£$¥èéùìòÇ\nØø\rÅå' +
  'Δ_ΦΓΛΩΠΨΣΘΞÆæßÉ' +
  ' !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿' +
  'abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT = '^{}\\[~]|€';

export function toGsm7(input: string): string {
  let out = '';
  for (const ch of String(input ?? '')) {
    const mapped = GSM7_SAFE[ch] ?? ch;
    for (const c of mapped) {
      out += (GSM7.includes(c) || GSM7_EXT.includes(c)) ? c : '?';
    }
  }
  return out;
}

export function renderSms(ev: AlertEvent): string {
  const line = String(ev.body_text ?? '').split('\n').filter(Boolean).join(' - ');
  const text = toGsm7(`EconSquad: ${ev.title}. ${line}`);
  /* 306 = two full GSM-7 segments. Past that a third is being paid for, and an
     alert needing 300 characters is a notification that should have been an
     email. */
  return text.length > 306 ? text.slice(0, 303) + '...' : text;
}

/* ── Problem reports keep their own, better email ───────────── */
async function sendProblemReportEmail(ev: AlertEvent, to: string[]) {
  const m = ev.meta ?? {};
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/notify-problem-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        to,
        problem:   m['problem'],
        user:      m['email'],
        userName:  m['name'],
        version:   m['version'],
        url:       m['page'],
        userAgent: m['user_agent'],
        timestamp: m['timestamp'],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { ok: false, detail: `notify-problem-report ${res.status}: ${data?.error ?? 'unknown'}` };
    }
    return { ok: true, id: null };
  } catch (e) {
    return { ok: false, detail: `notify-problem-report unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/* ── Dispatch one event ─────────────────────────────────────── */

export async function dispatchEvent(admin: any, ev: AlertEvent) {
  const summary = { sent: 0, failed: 0, skipped: 0, detail: [] as unknown[] };

  const { data: type } = await admin
    .from('alert_types').select('label,category,is_urgent,is_enabled')
    .eq('key', ev.type_key).maybeSingle();

  // Switched off between raising and dispatching. Do not send, but do not
  // leave it claimed forever either.
  if (type && type.is_enabled === false) {
    await admin.from('alert_events').update({
      dispatched_at: new Date().toISOString(),
      result: { skipped: 'alert type is switched off' },
    }).eq('id', ev.id);
    return { ...summary, skipped: 1 };
  }

  const label    = type?.label ?? ev.type_key;
  const category = type?.category ?? 'ops';
  const urgent   = type?.is_urgent === true;

  const { data: subs } = await admin
    .from('alert_subscriptions')
    .select('send_email,send_sms,alert_recipients!inner(id,name,email,phone,is_active,quiet_start,quiet_end,timezone,sms_daily_cap)')
    .eq('type_key', ev.type_key);

  const rows = (subs ?? []).filter((s: any) => s.alert_recipients?.is_active);

  const emailTo: string[] = [];
  const emailRecipients: Recipient[] = [];
  const deliveries: any[] = [];

  for (const s of rows) {
    const r: Recipient = s.alert_recipients;

    if (s.send_email) {
      if (r.email && r.email.trim()) { emailTo.push(r.email.trim()); emailRecipients.push(r); }
      else {
        deliveries.push({ event_id: ev.id, recipient_id: r.id, channel: 'email', destination: null,
                          status: 'skipped', detail: 'no email address on file' });
        summary.skipped++;
      }
    }

    if (s.send_sms) {
      if (!r.phone || !r.phone.trim()) {
        deliveries.push({ event_id: ev.id, recipient_id: r.id, channel: 'sms', destination: null,
                          status: 'skipped', detail: 'no phone number on file' });
        summary.skipped++;
      } else if (!urgent && inQuietHours(r)) {
        deliveries.push({ event_id: ev.id, recipient_id: r.id, channel: 'sms', destination: r.phone,
                          status: 'skipped', detail: `quiet hours ${r.quiet_start}-${r.quiet_end} ${r.timezone}` });
        summary.skipped++;
      } else {
        const { data: usedToday } = await admin.rpc('alert_sms_today', { p_recipient: r.id });
        if (typeof usedToday === 'number' && usedToday >= (r.sms_daily_cap ?? 20)) {
          deliveries.push({ event_id: ev.id, recipient_id: r.id, channel: 'sms', destination: r.phone,
                            status: 'skipped', detail: `daily text cap of ${r.sms_daily_cap} already reached` });
          summary.skipped++;
        } else {
          const out = await sendSms(r.phone, renderSms(ev));
          deliveries.push({ event_id: ev.id, recipient_id: r.id, channel: 'sms', destination: r.phone,
                            status: out.ok ? 'sent' : 'failed',
                            provider_id: out.ok ? out.id : null, detail: out.ok ? null : out.detail });
          out.ok ? summary.sent++ : summary.failed++;
        }
      }
    }
  }

  if (emailTo.length) {
    if (ev.type_key === 'problem.reported') {
      // One call, all recipients - that function already loops.
      const out = await sendProblemReportEmail(ev, emailTo);
      for (const r of emailRecipients) {
        deliveries.push({ event_id: ev.id, recipient_id: r.id, channel: 'email', destination: r.email,
                          status: out.ok ? 'sent' : 'failed', provider_id: null,
                          detail: out.ok ? 'via notify-problem-report' : out.detail });
        out.ok ? summary.sent++ : summary.failed++;
      }
    } else {
      const html = renderEmail(ev, category, label);
      for (const r of emailRecipients) {
        const out = await sendEmail(r.email as string, ev.title, html);
        deliveries.push({ event_id: ev.id, recipient_id: r.id, channel: 'email', destination: r.email,
                          status: out.ok ? 'sent' : 'failed',
                          provider_id: out.ok ? out.id : null, detail: out.ok ? null : out.detail });
        out.ok ? summary.sent++ : summary.failed++;
      }
    }
  }

  if (deliveries.length) {
    const { error } = await admin.from('alert_deliveries').insert(deliveries);
    if (error) console.error('dispatch-alerts: delivery log failed', error.message);
  }

  summary.detail = deliveries.map((d) => ({ ch: d.channel, to: d.destination, st: d.status, why: d.detail }));

  // Marked dispatched even when every send failed. Retrying a failed Twilio
  // auth forever would send nothing and cost everything; the failure is on the
  // record, visible on the Alerts page, which is where it can be acted on.
  await admin.from('alert_events').update({
    dispatched_at: new Date().toISOString(),
    result: summary,
  }).eq('id', ev.id);

  if (!rows.length) {
    console.warn(`dispatch-alerts: nobody is subscribed to ${ev.type_key}`);
  }
  return summary;
}

/* ── Entry point ────────────────────────────────────────────── */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.error('dispatch-alerts: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
      return json({ error: 'not_configured' }, 500);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let body: any = {};
    try { body = JSON.parse(await req.text() || '{}'); } catch { body = {}; }

    /* ── Test send. Caller-directed, so caller must be an admin. ── */
    if (body.test === true) {
      const authHeader = req.headers.get('Authorization') || '';
      if (!authHeader.startsWith('Bearer ')) return json({ error: 'Sign in as an admin to send a test.' }, 401);

      const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: userRes } = await asCaller.auth.getUser();
      const email = userRes?.user?.email;
      if (!email) return json({ error: 'Sign in as an admin to send a test.' }, 401);

      const { data: isAdmin } = await admin
        .from('admins').select('email').ilike('email', email).maybeSingle();
      if (!isAdmin) return json({ error: 'Admins only.' }, 403);

      const { data: r } = await admin
        .from('alert_recipients').select('*').eq('id', body.recipient_id).maybeSingle();
      if (!r) return json({ error: 'That recipient no longer exists.' }, 404);

      const fake: AlertEvent = {
        id: 0,
        type_key: 'test',
        title: 'Test alert from EconSquad AI',
        body_text: `This is a test sent by ${email}.\nIf you are reading it, alerts reach you on this channel.`,
        body_html: null,
        meta: { sent_by: email, sent_at: new Date().toISOString() },
      };

      const out: Record<string, unknown> = {};

      if (r.email) {
        const e = await sendEmail(r.email, 'EconSquad AI — test alert', renderEmail(fake, 'ops', 'Test'));
        out.email = e.ok ? { status: 'sent', id: e.id } : { status: 'failed', detail: e.detail };
      } else {
        out.email = { status: 'skipped', detail: 'no email address on file' };
      }

      if (r.phone) {
        const s = await sendSms(r.phone, renderSms(fake));
        out.sms = s.ok ? { status: 'sent', id: s.id } : { status: 'failed', detail: s.detail };
      } else {
        out.sms = { status: 'skipped', detail: 'no phone number on file' };
      }

      // A test bypasses quiet hours and the cap on purpose - you asked for it,
      // now, and a silent test is worse than useless. It is still logged.
      await admin.from('alert_deliveries').insert(
        (['email', 'sms'] as const).map((ch) => {
          const o = out[ch] as any;
          return {
            event_id: null, recipient_id: r.id, channel: ch,
            destination: ch === 'email' ? r.email : r.phone,
            status: o.status, provider_id: o.id ?? null,
            detail: o.detail ?? 'test send',
          };
        }),
      );

      return json({ ok: true, test: true, recipient: r.name, result: out });
    }

    /* ── Normal drain. Nothing here trusts the request body. ──── */
    const { data: events, error: claimErr } = await admin.rpc('claim_alert_events', { p_limit: 20 });
    if (claimErr) {
      console.error('dispatch-alerts: claim failed', claimErr.message);
      return json({ error: 'claim_failed' }, 500);
    }

    const list = (events ?? []) as AlertEvent[];
    if (!list.length) return json({ ok: true, drained: 0 });

    const results = [];
    for (const ev of list) {
      try {
        results.push({ id: ev.id, type: ev.type_key, ...(await dispatchEvent(admin, ev)) });
      } catch (e) {
        // One bad event must not strand the rest of the queue.
        const detail = e instanceof Error ? e.message : String(e);
        console.error(`dispatch-alerts: event ${ev.id} threw`, detail);
        await admin.from('alert_events').update({
          dispatched_at: new Date().toISOString(),
          result: { error: detail },
        }).eq('id', ev.id);
        results.push({ id: ev.id, type: ev.type_key, error: detail });
      }
    }

    return json({ ok: true, drained: list.length, results });

  } catch (e) {
    console.error('dispatch-alerts: unhandled', e instanceof Error ? e.message : String(e));
    return json({ error: 'unhandled' }, 500);
  }
});
