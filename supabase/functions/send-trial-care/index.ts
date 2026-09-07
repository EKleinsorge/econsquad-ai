// supabase/functions/send-trial-care/index.ts
//
// Trial Member Care. Runs daily and asks, for every person still in a trial:
// given what they have actually DONE, is anything worth saying today?
//
// WHY IT IS NOT A DRIP SEQUENCE
//
// A drip sends day 3 to everybody on day 3. That means congratulating somebody
// on their first draft and, the same morning, asking why they have not tried it
// yet. Touchpoints here are gated on the count of rows in task_history, so the
// person using it and the person who never started get different mail - and the
// person using it gets told well done rather than nagged.
//
// THREE RULES THAT KEEP IT FROM BECOMING SPAM
//
// 1. At most ONE email per person per run. Two touchpoints can come due on the
//    same morning; the lower sort_order wins and the other waits for tomorrow.
// 2. Each touchpoint ONCE, ever - unique (user_id, touchpoint_key), claimed
//    before the send.
// 3. It stops the moment they subscribe. Nothing is more corrosive than being
//    asked to convert two days after paying.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';
const ANON_KEY       = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';

/* Two senders, one rule: whoever is named must be who actually reads the
   reply. ARIA coaches; ARIA cannot read an inbox. So REPLY_TO is Eric on
   every message, including ARIA's - a reply always reaches a person, and no
   email ever claims otherwise. */
const FROM_ERIC = 'Eric at EconSquad AI <eric@econsquad.ai>';
const FROM_ARIA = 'ARIA from EconSquad <aria@econsquad.ai>';
const REPLY_TO  = 'eric@econsquad.ai';
const SITE_URL   = 'https://econsquad.ai';
const SEND_DELAY_MS = 60;
// A trial that lapsed a month ago is not a trial, it is a stranger. Stop.
const STOP_AFTER_TRIAL_END_DAYS = 14;
// Long enough for a considered win-back, short enough that it never becomes
// cold outreach to somebody who left last year.
const STOP_AFTER_CANCEL_DAYS = 60;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type Touchpoint = {
  key: string; label: string;
  audience: 'trial' | 'cancelled';
  sender: 'eric' | 'aria';
  when_kind: 'days_after_signup' | 'days_before_trial_end' | 'missions_reached' | 'days_after_cancel';
  when_value: number;
  min_missions: number | null; max_missions: number | null;
  subject: string; body: string; is_enabled: boolean; sort_order: number;
};

export type Person = {
  id: string; email: string; full_name: string | null; organization: string | null;
  plan: string | null; subscription_status: string | null; is_beta_tester: boolean | null;
  lifecycle_opt_out: boolean; created_at: string; trial_end: string | null;
  canceled_at: string | null; audience: 'trial' | 'cancelled'; daysSinceCancel: number | null;
  greetings_token: string | null;
  missions: number; hours: number; topSpecialist: string | null;
  daysSinceSignup: number; daysToTrialEnd: number | null;
};

/** Whole days between two dates, by calendar day rather than by 24-hour blocks —
 *  someone who signed up at 11pm is one day in the next morning, not in 25 hours. */
export function dayDiff(fromIso: string, toIso: string): number {
  const a = new Date(fromIso), b = new Date(toIso);
  const da = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const db = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((db - da) / 86400000);
}

/** Does this touchpoint apply to this person today? */
export function matches(t: Touchpoint, p: Person): boolean {
  // A churned customer must never receive "welcome, here is one thing to try".
  if (t.audience !== p.audience) return false;
  if (t.min_missions != null && p.missions < t.min_missions) return false;
  if (t.max_missions != null && p.missions > t.max_missions) return false;

  if (t.when_kind === 'days_after_signup') return p.daysSinceSignup === t.when_value;

  if (t.when_kind === 'days_before_trial_end') {
    if (p.daysToTrialEnd === null) return false;
    return p.daysToTrialEnd === t.when_value;
  }

  if (t.when_kind === 'days_after_cancel') {
    if (p.daysSinceCancel === null) return false;
    return p.daysSinceCancel === t.when_value;
  }

  // A milestone is not a date. It fires the first run AFTER they get there,
  // however long that takes - and the once-ever constraint stops it repeating.
  if (t.when_kind === 'missions_reached') return p.missions >= t.when_value;

  return false;
}

/** Everything due today, best first. */
export function dueFor(touchpoints: Touchpoint[], p: Person, alreadySent: Set<string>): Touchpoint[] {
  return touchpoints
    .filter((t) => t.is_enabled)
    .filter((t) => !alreadySent.has(t.key))
    .filter((t) => matches(t, p))
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function fillTemplate(text: string, p: Person): string {
  const first = (p.full_name ?? '').trim().split(/\s+/)[0] || 'there';
  const org = (p.organization ?? '').trim();
  const hours = p.hours >= 10 ? String(Math.round(p.hours)) : p.hours.toFixed(1).replace(/\.0$/, '');
  return String(text ?? '')
    .replace(/\{\{name\}\}/g, first)
    .replace(/ (?:for|at|and) \{\{org\}\}/g, org ? ` $&`.trim().replace('{{org}}', org) : '')
    .replace(/\{\{org\}\}/g, org || 'your team')
    .replace(/\{\{missions\}\}/g, String(p.missions))
    .replace(/\{\{hours\}\}/g, hours)
    .replace(/\{\{days_left\}\}/g, String(Math.max(0, p.daysToTrialEnd ?? 0)))
    .replace(/\{\{top_specialist\}\}/g, p.topSpecialist || 'your first specialist');
}

function renderHtml(bodyText: string, unsubUrl: string): string {
  const paras = bodyText.split(/\n\s*\n/).map((para) =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#2d3748;">${esc(para).replace(/\n/g, '<br>')}</p>`
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
    You are getting this because you started a trial.
    <a href="${unsubUrl}" style="color:#a0aec0;">Stop these</a> &mdash; your receipts and account emails are unaffected.
  </div>
</div></body></html>`;
}

async function sendEmail(to: string, subject: string, html: string, sender: string = 'eric') {
  if (!RESEND_API_KEY) return { ok: false, detail: 'RESEND_API_KEY is not set' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: sender === 'aria' ? FROM_ARIA : FROM_ERIC,
        to: [to], subject, html, reply_to: REPLY_TO,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, detail: `Resend ${res.status}: ${data?.message ?? 'unknown'}` };
    return { ok: true, id: data?.id ?? null };
  } catch (e) {
    return { ok: false, detail: `Resend unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/* ── The run ────────────────────────────────────────────────── */

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
    const nowIso = body.now ? String(body.now) : new Date().toISOString();

    /* ── Test send ────────────────────────────────────────────
       Admin-gated, sends ONE real email to the caller's own address using the
       real template, with plausible sample numbers so the merge fields are
       visible. Not recorded in trial_sends, so it cannot consume anybody's
       once-ever slot. */
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

      const { data: tp } = await admin
        .from('trial_touchpoints').select('*').eq('key', String(body.touchpoint_key ?? '')).maybeSingle();
      if (!tp) return json({ error: 'That touchpoint no longer exists.' }, 404);

      const { data: me } = await admin
        .from('profiles').select('full_name,organization').ilike('email', email).maybeSingle();

      const sample: Person = {
        id: 'test', email, full_name: me?.full_name ?? null, organization: me?.organization ?? null,
        plan: 'trial', subscription_status: null, is_beta_tester: false, lifecycle_opt_out: false,
        created_at: new Date().toISOString(), trial_end: null, greetings_token: null,
        canceled_at: null, audience: tp.audience, daysSinceCancel: 3,
        missions: 7, hours: 16.5, topSpecialist: 'Gary — Grant Writer Pro',
        daysSinceSignup: 7, daysToTrialEnd: 3,
      };
      const out = await sendEmail(email, '[TEST] ' + fillTemplate(tp.subject, sample),
        renderHtml(fillTemplate(tp.body, sample), `${SITE_URL}/unsubscribe.html?status=already`), tp.sender);
      return out.ok
        ? json({ ok: true, test: true, to: email, subject: fillTemplate(tp.subject, sample) })
        : json({ ok: false, test: true, error: out.detail }, 502);
    }

    const { data: tpRows, error: tpErr } = await admin
      .from('trial_touchpoints').select('*').order('sort_order');
    if (tpErr) return json({ error: 'touchpoints_unreadable', detail: tpErr.message }, 500);
    const touchpoints = (tpRows ?? []) as Touchpoint[];

    /* Who is in scope, and which of the two audiences they belong to.
       ------------------------------------------------------------------
       THE TRAP: stripe-webhook sets `plan` back to 'trial' when a subscription
       is cancelled, keeping subscription_status = 'canceled' and stamping
       canceled_at. On a naive `plan = 'trial'` query a churned customer looks
       exactly like a fresh signup and would be sent "welcome, here is one thing
       to try" days after leaving. canceled_at is what tells them apart. */
    const { data: profRows, error: profErr } = await admin
      .from('profiles')
      .select('id,email,full_name,organization,plan,subscription_status,is_beta_tester,lifecycle_opt_out,created_at,trial_end,canceled_at,greetings_token')
      .eq('lifecycle_opt_out', false);
    if (profErr) return json({ error: 'profiles_unreadable', detail: profErr.message }, 500);

    const candidates = (profRows ?? []).filter((r: any) =>
      r.email && String(r.email).trim() &&
      // Comped and focus-group accounts are neither trials nor churn, and must
      // never be sold to.
      !r.is_beta_tester &&
      // Anyone currently paying is out of both audiences - not a trial to
      // convert, and not somebody to win back.
      r.subscription_status !== 'active' &&
      (
        // Churned: they paid, then left.
        (r.subscription_status === 'canceled' && r.canceled_at) ||
        // Still deciding: on a trial and never cancelled.
        (r.plan === 'trial' && !r.canceled_at)
      )
    );

    if (!candidates.length) return json({ ok: true, considered: 0, sent: 0, note: 'nobody in a trial' });

    const ids = candidates.map((c: any) => c.id);

    /* Activity, in two queries rather than one per person. */
    const { data: tasks } = await admin
      .from('task_history').select('user_id,specialist_name,hours_saved').in('user_id', ids);

    const missionsBy = new Map<string, number>();
    const hoursBy    = new Map<string, number>();
    const specCount  = new Map<string, Map<string, number>>();
    for (const t of (tasks ?? []) as any[]) {
      missionsBy.set(t.user_id, (missionsBy.get(t.user_id) ?? 0) + 1);
      hoursBy.set(t.user_id, (hoursBy.get(t.user_id) ?? 0) + (Number(t.hours_saved) || 0));
      if (t.specialist_name) {
        const m = specCount.get(t.user_id) ?? new Map<string, number>();
        m.set(t.specialist_name, (m.get(t.specialist_name) ?? 0) + 1);
        specCount.set(t.user_id, m);
      }
    }

    const { data: sentRows } = await admin
      .from('trial_sends').select('user_id,touchpoint_key').in('user_id', ids);
    const sentBy = new Map<string, Set<string>>();
    for (const s of (sentRows ?? []) as any[]) {
      const set = sentBy.get(s.user_id) ?? new Set<string>();
      set.add(s.touchpoint_key);
      sentBy.set(s.user_id, set);
    }

    const people: Person[] = candidates.map((r: any) => {
      const top = specCount.get(r.id);
      let topSpecialist: string | null = null;
      if (top) {
        let best = -1;
        for (const [name, n] of top) if (n > best) { best = n; topSpecialist = name; }
      }
      const cancelled = r.subscription_status === 'canceled' && !!r.canceled_at;
      return {
        ...r,
        audience: cancelled ? 'cancelled' : 'trial',
        missions: missionsBy.get(r.id) ?? 0,
        hours: hoursBy.get(r.id) ?? 0,
        topSpecialist,
        daysSinceSignup: r.created_at ? dayDiff(r.created_at, nowIso) : 0,
        daysToTrialEnd: r.trial_end ? dayDiff(nowIso, r.trial_end) : null,
        daysSinceCancel: cancelled ? dayDiff(r.canceled_at, nowIso) : null,
      } as Person;
    }).filter((p: Person) => {
      // Somebody who left three months ago has stopped being a win-back and
      // started being a stranger.
      if (p.audience === 'cancelled') {
        return p.daysSinceCancel !== null && p.daysSinceCancel <= STOP_AFTER_CANCEL_DAYS;
      }
      // A trial that lapsed a fortnight ago is not a trial any more.
      return p.daysToTrialEnd === null || p.daysToTrialEnd >= -STOP_AFTER_TRIAL_END_DAYS;
    });

    /* At most one per person. The rest wait for tomorrow. */
    const plan: Array<{ p: Person; t: Touchpoint; alsoDue: string[] }> = [];
    for (const p of people) {
      const due = dueFor(touchpoints, p, sentBy.get(p.id) ?? new Set());
      if (due.length) plan.push({ p, t: due[0], alsoDue: due.slice(1).map((x) => x.key) });
    }

    if (dryRun) {
      return json({
        ok: true, dry_run: true, now: nowIso,
        considered: people.length,
        would_send: plan.length,
        breakdown: plan.reduce((acc: Record<string, number>, x) => {
          acc[x.t.key] = (acc[x.t.key] ?? 0) + 1; return acc;
        }, {}),
        sample: plan.slice(0, 8).map((x) => ({
          to: x.p.email, touchpoint: x.t.key, audience: x.p.audience, from: x.t.sender,
          missions: x.p.missions, day: x.p.daysSinceSignup, days_left: x.p.daysToTrialEnd,
          held_back: x.alsoDue,
        })),
      });
    }

    let sent = 0, failed = 0, skipped = 0;
    const detail: unknown[] = [];

    for (const { p, t } of plan) {
      // Claim first — the unique index is what makes a repeated run harmless.
      const { error: claimErr } = await admin.from('trial_sends').insert({
        user_id: p.id, email: p.email, touchpoint_key: t.key,
        missions_at_send: p.missions, status: 'sent',
      });
      if (claimErr) {
        if ((claimErr as any).code !== '23505') {
          console.error('trial-care: claim failed', p.email, claimErr.message);
        }
        skipped++;
        continue;
      }

      const subject = fillTemplate(t.subject, p);
      const text    = fillTemplate(t.body, p);
      const unsub   = `${SUPABASE_URL}/functions/v1/unsubscribe?t=${p.greetings_token ?? ''}&k=lifecycle`;

      const out = await sendEmail(p.email, subject, renderHtml(text, unsub), t.sender);
      if (out.ok) sent++;
      else {
        failed++;
        await admin.from('trial_sends')
          .update({ status: 'failed', detail: out.detail })
          .eq('user_id', p.id).eq('touchpoint_key', t.key);
        detail.push({ to: p.email, touchpoint: t.key, error: out.detail });
      }
      await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
    }

    return json({ ok: true, considered: people.length, sent, failed, skipped, detail: detail.slice(0, 20) });

  } catch (e) {
    console.error('send-trial-care: unhandled', e instanceof Error ? e.message : String(e));
    return json({ error: 'unhandled' }, 500);
  }
});
