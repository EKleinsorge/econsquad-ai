// supabase/functions/send-greetings/index.ts
//
// Sends holiday and birthday greetings. Runs once a day and asks a single
// question: is anything due today?
//
// Triggered by .github/workflows/greetings.yml, the same pattern as the Monday
// Drop and re-engagement mailers.
//
// WHY THE DATE MATHS IS THE INTERESTING PART
//
// Thanksgiving is the fourth Thursday in November. Memorial Day is the LAST
// Monday in May. Neither is a date, and a hardcoded 2026 calendar sends nothing
// in 2027 - silently, because a mailer that sends zero emails looks exactly like
// a quiet week. Occasions carry a rule and the date is computed every run.
//
// SENDING TWICE
//
// greeting_sends has a UNIQUE index on (user_id, kind, occasion_key, year), and
// the insert happens BEFORE the send. A duplicate is refused by the database,
// which is how a second cron run, a retry or a manual trigger cannot produce a
// second card. No in-memory bookkeeping to get wrong.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';
const ANON_KEY       = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';

const FROM_EMAIL = 'Eric at EconSquad AI <eric@econsquad.ai>';
const SITE_URL   = 'https://econsquad.ai';
const TIMEZONE   = 'America/Chicago';
const SEND_DELAY_MS = 60;   // stay inside Resend's rate window

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── Dates ──────────────────────────────────────────────────── */

export type Occasion = {
  key: string; label: string; month: number; day: number | null;
  floating_nth: number | null; floating_weekday: number | null;
  send_days_before: number; subject: string; body: string; is_enabled: boolean;
};

/** Today in TIMEZONE, as {y, m, d} - not UTC. A greeting timed off UTC arrives
 *  on the wrong day for a US audience for six hours out of every twenty-four. */
export function todayIn(tz: string, now = new Date()): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** The nth given weekday of a month. nth = -1 means the last one.
 *  weekday is 0=Sunday..6=Saturday, matching getDay(). */
export function nthWeekdayOfMonth(year: number, month: number, nth: number, weekday: number): number {
  if (nth === -1) {
    // Walk back from the last day of the month.
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let d = last; d >= 1; d--) {
      if (new Date(Date.UTC(year, month - 1, d)).getUTCDay() === weekday) return d;
    }
    return last;
  }
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const offset = (weekday - firstDow + 7) % 7;
  return 1 + offset + (nth - 1) * 7;
}

/** The date an occasion falls on in a given year, as {m, d}. */
export function occasionDate(o: Occasion, year: number): { m: number; d: number } {
  if (o.day != null) return { m: o.month, d: o.day };
  return { m: o.month, d: nthWeekdayOfMonth(year, o.month, o.floating_nth!, o.floating_weekday!) };
}

/** Should this occasion be sent today, allowing for send_days_before? */
export function isDueToday(o: Occasion, today: { y: number; m: number; d: number }): boolean {
  const on = occasionDate(o, today.y);
  // Subtract the lead time from the occasion, in real calendar days, so
  // "one day before 1 January" lands correctly on 31 December.
  const target = new Date(Date.UTC(today.y, on.m - 1, on.d));
  target.setUTCDate(target.getUTCDate() - (o.send_days_before || 0));
  return target.getUTCMonth() + 1 === today.m && target.getUTCDate() === today.d;
}

/* ── Copy ───────────────────────────────────────────────────── */

export function fillTemplate(text: string, name: string | null, org: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0] || 'there';
  const orgTxt = (org ?? '').trim();
  return String(text ?? '')
    .replace(/\{\{name\}\}/g, first)
    // "for {{org}}" with no organisation on file must not become "for ." -
    // tidy the surrounding words rather than leaving a hole in the sentence.
    .replace(/ (?:for|at|and) \{\{org\}\}/g, orgTxt ? ` $& `.trim().replace('{{org}}', orgTxt) : '')
    .replace(/\{\{org\}\}/g, orgTxt || 'your team');
}

function renderHtml(bodyText: string, unsubUrl: string): string {
  const paras = bodyText.split(/\n\s*\n/).map((p) =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#2d3748;">${esc(p).replace(/\n/g, '<br>')}</p>`
  ).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Georgia,'Times New Roman',serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
  <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px 34px;">
    ${paras}
  </div>
  <div style="text-align:center;margin-top:18px;font-size:11px;color:#a0aec0;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">
    EconSquad AI &middot; <a href="${SITE_URL}" style="color:#a0aec0;">econsquad.ai</a><br>
    This is a seasonal note, not product news.
    <a href="${unsubUrl}" style="color:#a0aec0;">Stop receiving these</a> and nothing else changes.
  </div>
</div></body></html>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) return { ok: false, detail: 'RESEND_API_KEY is not set' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, detail: `Resend ${res.status}: ${data?.message ?? 'unknown'}` };
    return { ok: true, id: data?.id ?? null };
  } catch (e) {
    return { ok: false, detail: `Resend unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/* ── The run ────────────────────────────────────────────────── */

type Member = {
  id: string; email: string | null; full_name: string | null; organization: string | null;
  birth_month: number | null; birth_day: number | null;
  greetings_opt_out: boolean; greetings_token: string | null;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'not_configured' }, 500);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let body: any = {};
    try { body = JSON.parse((await req.text()) || '{}'); } catch { body = {}; }
    const dryRun = body.dry_run === true || body.dry_run === 'true';

    /* ── Test send ────────────────────────────────────────────
       Caller-directed, so the caller must be an admin. Sends ONE real email,
       using the real template, to the admin's own address — the point is to
       see what actually goes out rather than a preview that could differ.
       It is not recorded in greeting_sends, so it cannot use up the real
       once-a-year slot for that person. */
    if (body.test === true) {
      const authHeader = req.headers.get('Authorization') || '';
      if (!authHeader.startsWith('Bearer ')) return json({ error: 'Sign in as an admin.' }, 401);

      const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: userRes } = await asCaller.auth.getUser();
      const email = userRes?.user?.email;
      if (!email) return json({ error: 'Sign in as an admin.' }, 401);

      const { data: isAdmin } = await admin
        .from('admins').select('email').ilike('email', email).maybeSingle();
      if (!isAdmin) return json({ error: 'Admins only.' }, 403);

      const { data: occ } = await admin
        .from('greeting_occasions').select('*').eq('key', String(body.occasion_key ?? '')).maybeSingle();
      if (!occ) return json({ error: 'That occasion no longer exists.' }, 404);

      const { data: me } = await admin
        .from('profiles').select('full_name,organization').ilike('email', email).maybeSingle();

      const subject = fillTemplate(occ.subject, me?.full_name ?? null, me?.organization ?? null);
      const text    = fillTemplate(occ.body,    me?.full_name ?? null, me?.organization ?? null);
      const out = await sendEmail(email, '[TEST] ' + subject,
        renderHtml(text, `${SITE_URL}/unsubscribe.html?status=already`));

      return out.ok
        ? json({ ok: true, test: true, to: email, subject })
        : json({ ok: false, test: true, error: out.detail }, 502);
    }

    /* An explicit date makes this testable and lets you rehearse December in
       September without waiting for December. */
    const today = body.date
      ? (() => { const [y, m, d] = String(body.date).split('-').map(Number); return { y, m, d }; })()
      : todayIn(TIMEZONE);

    const { data: occRows, error: occErr } = await admin
      .from('greeting_occasions').select('*').eq('is_enabled', true);
    if (occErr) return json({ error: 'occasions_unreadable', detail: occErr.message }, 500);

    const occasions = (occRows ?? []) as Occasion[];
    const holidaysDue = occasions.filter((o) => o.key !== 'birthday' && isDueToday(o, today));
    const birthdayTpl = occasions.find((o) => o.key === 'birthday') ?? null;

    if (!holidaysDue.length && !birthdayTpl) {
      return json({ ok: true, date: today, sent: 0, note: 'nothing due today' });
    }

    const { data: memberRows, error: memErr } = await admin
      .from('profiles')
      .select('id,email,full_name,organization,birth_month,birth_day,greetings_opt_out,greetings_token')
      .eq('greetings_opt_out', false);
    if (memErr) return json({ error: 'members_unreadable', detail: memErr.message }, 500);

    const members = ((memberRows ?? []) as Member[])
      .filter((m) => m.email && m.email.trim());

    /* Build the work list: every (member, occasion) pair due today. */
    const work: Array<{ m: Member; o: Occasion; kind: 'holiday' | 'birthday' }> = [];
    for (const m of members) {
      for (const o of holidaysDue) work.push({ m, o, kind: 'holiday' });
      if (birthdayTpl && m.birth_month === today.m && m.birth_day === today.d) {
        work.push({ m, o: birthdayTpl, kind: 'birthday' });
      }
    }

    if (dryRun) {
      return json({
        ok: true, dry_run: true, date: today,
        due: holidaysDue.map((o) => o.key),
        birthdays_today: work.filter((w) => w.kind === 'birthday').length,
        would_send: work.length,
        recipients_sample: work.slice(0, 5).map((w) => ({ to: w.m.email, occasion: w.o.key })),
      });
    }

    let sent = 0, failed = 0, skipped = 0;
    const detail: unknown[] = [];

    for (const w of work) {
      /* Claim it FIRST. The unique index is what makes a second run harmless,
         and claiming before sending means a crash mid-send cannot produce a
         duplicate on the next run - at worst somebody misses one card, which is
         a far better failure than being wished happy birthday twice. */
      const { error: claimErr } = await admin.from('greeting_sends').insert({
        user_id: w.m.id, email: w.m.email, kind: w.kind,
        occasion_key: w.o.key, year: today.y, status: 'sent',
      });
      if (claimErr) {
        // 23505 = already sent this year. Everything else is worth logging.
        if ((claimErr as any).code !== '23505') {
          console.error('greetings: claim failed', w.m.email, claimErr.message);
        }
        skipped++;
        continue;
      }

      const subject = fillTemplate(w.o.subject, w.m.full_name, w.m.organization);
      const text    = fillTemplate(w.o.body,    w.m.full_name, w.m.organization);
      const unsub   = `${SUPABASE_URL}/functions/v1/unsubscribe?t=${w.m.greetings_token ?? ''}&k=greetings`;

      const out = await sendEmail(w.m.email as string, subject, renderHtml(text, unsub));
      if (out.ok) {
        sent++;
      } else {
        failed++;
        await admin.from('greeting_sends')
          .update({ status: 'failed', detail: out.detail })
          .eq('user_id', w.m.id).eq('kind', w.kind)
          .eq('occasion_key', w.o.key).eq('year', today.y);
        detail.push({ to: w.m.email, occasion: w.o.key, error: out.detail });
      }
      await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
    }

    return json({
      ok: true, date: today,
      occasions: holidaysDue.map((o) => o.key),
      sent, failed, skipped, detail: detail.slice(0, 20),
    });

  } catch (e) {
    console.error('send-greetings: unhandled', e instanceof Error ? e.message : String(e));
    return json({ error: 'unhandled' }, 500);
  }
});
