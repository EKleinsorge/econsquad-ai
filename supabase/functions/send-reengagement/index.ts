// ============================================================
// Supabase Edge Function: send-reengagement
// Emails lapsed EconSquad users a nudge to come back.
// Runs weekly (Mondays 9am CT) via GitHub Actions.
//
// Body params (all optional):
//   dry_run       true | "true"  -> select audience, send nothing
//   inactive_days number         -> override inactivity threshold
//   limit         number         -> override max sends this run
//   test_email    string         -> send exactly one email here, log nothing
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY    = Deno.env.get('SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;

const SITE_URL   = 'https://econsquad.ai';
const FROM_EMAIL = 'ARIA from EconSquad <aria@econsquad.ai>';

// ── Tunables ─────────────────────────────────────────────────
const INACTIVE_DAYS = 14;   // no task_history in this many days = lapsed
const GRACE_DAYS    = 3;    // never nudge an account younger than this
const COOLDOWN_DAYS = 30;   // never nudge the same person twice inside this
const MAX_PER_RUN   = 200;  // hard cap, protects send reputation + quota
const SEND_DELAY_MS = 60;   // stay inside Resend rate limits

// Plans that should never receive a re-engagement nudge
const EXCLUDED_PLANS = ['cancelled', 'suspended'];

// Internal accounts — staff, family, and test rigs. These sit in
// monday_drop_subscribers like anyone else and were showing up in the
// audience, which would mean automated win-back mail to your own people.
const EXCLUDED_DOMAINS = ['gslisolutions.com'];
const EXCLUDED_EMAILS  = [
  'econsquadai@outlook.com',
  'sorge76@aol.com',
];

function isInternal(email: string): boolean {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return true;                                  // no address, no send
  if (EXCLUDED_EMAILS.includes(e)) return true;
  const domain = e.split('@')[1] || '';
  return EXCLUDED_DOMAINS.includes(domain);
}

const supa = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Helpers ──────────────────────────────────────────────────

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function daysBetween(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function truthy(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1';
}

async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    });
    if (!r.ok) {
      console.error(`Resend ${r.status} for ${to}: ${await r.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`Resend threw for ${to}:`, e);
    return false;
  }
}

// ── Audience selection ───────────────────────────────────────

interface Candidate {
  user_id: string;
  subscriber_id: string;
  email: string;
  name: string;
  unsubscribe_token: string;
  days_inactive: number | null;
  plan: string | null;
}

async function getCandidates(inactiveDays: number): Promise<Candidate[]> {
  // 1. Everyone still opted in. This is the same opt-out list the Monday Drop
  //    uses on purpose — if someone unsubscribed there, they hear nothing here.
  //    Subscribers with no user_id are newsletter-only signups with no app
  //    account to come back to, so they are skipped.
  const { data: subs, error: subErr } = await supa
    .from('monday_drop_subscribers')
    .select('id, user_id, email, name, unsubscribe_token')
    .is('unsubscribed_at', null)
    .not('user_id', 'is', null);
  if (subErr) throw new Error(`subscribers: ${subErr.message}`);
  if (!subs?.length) return [];

  const userIds = subs.map((s: any) => s.user_id);

  // 2. Profile data — plan, signup date, last touch.
  const { data: profiles, error: profErr } = await supa
    .from('profiles')
    .select('id, full_name, plan, created_at, updated_at')
    .in('id', userIds);
  if (profErr) throw new Error(`profiles: ${profErr.message}`);
  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  // 3. Anyone who actually used the product inside the window is active.
  const { data: recentTasks, error: taskErr } = await supa
    .from('task_history')
    .select('user_id')
    .in('user_id', userIds)
    .gte('created_at', daysAgoIso(inactiveDays));
  if (taskErr) throw new Error(`task_history: ${taskErr.message}`);
  const activeUserIds = new Set((recentTasks ?? []).map((t: any) => t.user_id));

  // 4. Anyone nudged recently is in cooldown.
  const { data: recentSends, error: sendErr } = await supa
    .from('reengagement_sends')
    .select('user_id')
    .in('user_id', userIds)
    .gte('sent_at', daysAgoIso(COOLDOWN_DAYS));
  if (sendErr) throw new Error(`reengagement_sends: ${sendErr.message}`);
  const cooledDown = new Set((recentSends ?? []).map((s: any) => s.user_id));

  // 5. Last task per user, for the "it's been N days" line in the email.
  const { data: lastTasks } = await supa
    .from('task_history')
    .select('user_id, created_at')
    .in('user_id', userIds)
    .order('created_at', { ascending: false });
  const lastTaskByUser = new Map<string, string>();
  for (const t of (lastTasks ?? []) as any[]) {
    if (!lastTaskByUser.has(t.user_id)) lastTaskByUser.set(t.user_id, t.created_at);
  }

  const graceCutoff  = Date.now() - GRACE_DAYS * 86_400_000;
  const activeCutoff = Date.now() - inactiveDays * 86_400_000;
  const out: Candidate[] = [];

  for (const s of subs as any[]) {
    if (isInternal(s.email)) continue;
    if (activeUserIds.has(s.user_id)) continue;
    if (cooledDown.has(s.user_id)) continue;

    const prof = profileById.get(s.user_id);
    if (!prof) continue;                                          // no profile row
    if (EXCLUDED_PLANS.includes(prof.plan)) continue;             // cancelled/suspended
    if (new Date(prof.created_at).getTime() > graceCutoff) continue; // too new

    // Second activity signal, deliberately redundant.
    // task_history only gets a row when a mission renders its output, and the
    // insert swallows its own errors — the 2026-07-22 focus group had a user
    // running four specialists with nothing recorded against her account.
    // profiles.updated_at is stamped on every dashboard load, so a recent login
    // is enough to prove someone is not lapsed. Treating either signal as
    // "active" fails safe: the cost of skipping a genuinely lapsed user is one
    // missed nudge, the cost of the reverse is telling a daily user we miss them.
    const lastTouch = prof.updated_at ? new Date(prof.updated_at).getTime() : 0;
    if (lastTouch > activeCutoff) continue;

    const lastSeen = lastTaskByUser.get(s.user_id) ?? prof.updated_at ?? prof.created_at;

    out.push({
      user_id:           s.user_id,
      subscriber_id:     s.id,
      email:             s.email,
      name:              s.name || prof.full_name || 'there',
      unsubscribe_token: s.unsubscribe_token,
      days_inactive:     daysBetween(lastSeen),
      plan:              prof.plan ?? null,
    });
  }

  // Longest-lapsed first, so a truncated run still hits the coldest users.
  out.sort((a, b) => (b.days_inactive ?? 0) - (a.days_inactive ?? 0));
  return out;
}

// ── Email ────────────────────────────────────────────────────

function buildEmailHtml(c: Candidate, trackingToken: string | null): string {
  const unsubUrl   = `${SITE_URL}/unsubscribe.html?t=${c.unsubscribe_token}`;
  const trackPixel = trackingToken
    ? `${SUPABASE_URL}/functions/v1/track-open?t=${trackingToken}`
    : null;
  const firstName = String(c.name).split(' ')[0];

  const gapLine = c.days_inactive && c.days_inactive > 0
    ? `It's been about ${c.days_inactive} days since your last session, and your trial ended a while back.`
    : `It's been a while, and your trial has ended.`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your EconSquad is waiting</title>
</head>
<body style="margin:0;padding:0;background:#04050d;font-family:'DM Sans',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px 20px;">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:32px;">
    <div style="display:inline-flex;align-items:center;gap:10px;text-decoration:none;">
      <div style="width:36px;height:36px;background:#aaff3e;border-radius:8px;display:inline-block;"></div>
      <span style="font-family:Arial,sans-serif;font-size:20px;font-weight:900;color:#aaff3e;letter-spacing:.02em;">EconSquad<sup style="font-size:12px;">AI</sup></span>
    </div>
  </div>

  <!-- Main card -->
  <div style="background:rgba(14,20,36,0.9);border:1px solid rgba(170,255,62,0.2);border-radius:16px;padding:32px;margin-bottom:20px;">
    <p style="font-size:14px;color:#6b7a96;margin:0 0 8px;">Hey ${firstName} —</p>
    <h1 style="font-family:Arial,sans-serif;font-size:24px;font-weight:900;color:#eef3fc;margin:0 0 14px;line-height:1.25;">
      Your squad is still on the clock
    </h1>
    <p style="font-size:14px;color:#8a97b5;line-height:1.75;margin:0 0 18px;">
      ${gapLine} Nothing is lost — your specialists, history and saved work are exactly where you left them, and your mission history and badges are all still there.
    </p>
    <p style="font-size:14px;color:#8a97b5;line-height:1.75;margin:0 0 18px;">
      A few things have changed since you were last in. Specialist output now copies into Word and Google Docs with its formatting intact, tables included. And the mission history, hours-saved and badge tracking that was quietly failing is fixed — so your dashboard finally shows the work you actually did.
    </p>
    <p style="font-size:14px;color:#8a97b5;line-height:1.75;margin:0 0 24px;">
      If you've got fifteen minutes this week, pick one thing off your plate and hand it to the squad. A BRE survey summary, a grant narrative draft, a site-selection one-pager — whatever's been sitting there.
    </p>
    <a href="${SITE_URL}/index.html?ret=1&amp;src=reengage" style="display:inline-block;background:#aaff3e;color:#1a3300;font-family:Arial,sans-serif;font-size:14px;font-weight:900;padding:14px 28px;border-radius:10px;text-decoration:none;">Open my dashboard →</a>
  </div>

  <!-- ARIA note -->
  <div style="background:rgba(14,20,36,0.5);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px;margin-bottom:20px;">
    <div style="font-family:Arial,sans-serif;font-size:12px;font-weight:800;color:#aaff3e;margin-bottom:4px;">ARIA</div>
    <p style="font-size:13px;color:#8a97b5;line-height:1.6;margin:0;">
      Not sure where to start? Just tell me what you're working on and I'll route it to the right specialist. You don't have to know which one.
    </p>
  </div>

  <!-- Footer -->
  <div style="text-align:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:24px;">
    <p style="font-size:11px;color:#4a5568;margin:0 0 8px;">
      You're receiving this because you have an EconSquad AI account.
    </p>
    <p style="font-size:11px;color:#4a5568;margin:0;">
      <a href="${unsubUrl}" style="color:#6b7a96;text-decoration:underline;">Unsubscribe from EconSquad emails</a>
      &nbsp;·&nbsp;
      <a href="${SITE_URL}" style="color:#6b7a96;text-decoration:underline;">econsquad.ai</a>
    </p>
  </div>
</div>
${trackPixel ? `<img src="${trackPixel}" width="1" height="1" style="display:none;" alt="">` : ''}
</body>
</html>`;
}

const SUBJECT = 'Your EconSquad squad is still here — and a few things got fixed';

// ── Main handler ─────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json' },
    });

  try {
    // Body is optional — a bare POST runs with defaults.
    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    const dryRun       = truthy(body.dry_run);
    const inactiveDays = Number(body.inactive_days) > 0 ? Number(body.inactive_days) : INACTIVE_DAYS;
    const limit        = Number(body.limit) > 0 ? Math.min(Number(body.limit), MAX_PER_RUN) : MAX_PER_RUN;
    const testEmail    = typeof body.test_email === 'string' ? body.test_email.trim() : '';

    // ── Test mode: one email, no audience query, no logging ──
    if (testEmail) {
      const fake: Candidate = {
        user_id: '00000000-0000-0000-0000-000000000000',
        subscriber_id: '', email: testEmail, name: 'Eric',
        unsubscribe_token: 'test-token-not-real',
        days_inactive: 21, plan: 'pro',
      };
      const ok = await sendViaResend(testEmail, `[TEST] ${SUBJECT}`, buildEmailHtml(fake, null));
      return json({ ok, mode: 'test', to: testEmail });
    }

    // ── Select audience ──
    const all       = await getCandidates(inactiveDays);
    const selected  = all.slice(0, limit);
    const truncated = all.length - selected.length;

    if (dryRun) {
      return json({
        ok: true,
        mode: 'dry_run',
        inactive_days: inactiveDays,
        eligible: all.length,
        would_send: selected.length,
        truncated,
        recipients: selected.map(c => ({
          email: c.email, days_inactive: c.days_inactive, plan: c.plan,
        })),
      });
    }

    if (!selected.length) {
      return json({ ok: true, mode: 'live', sent: 0, message: 'No lapsed users to nudge' });
    }

    // ── Live send ──
    let sent = 0, failed = 0;
    const failures: string[] = [];

    for (const c of selected) {
      // Log first so the row (and its tracking token) exists before the send.
      const { data: rec, error: insErr } = await supa
        .from('reengagement_sends')
        .insert({
          user_id:       c.user_id,
          subscriber_id: c.subscriber_id || null,
          email:         c.email,
          days_inactive: c.days_inactive,
          plan:          c.plan,
        })
        .select('id, tracking_token')
        .single();

      if (insErr || !rec) {
        failed++; failures.push(`${c.email}: log insert failed`);
        continue;
      }

      const ok = await sendViaResend(c.email, SUBJECT, buildEmailHtml(c, rec.tracking_token));

      if (ok) {
        sent++;
      } else {
        failed++; failures.push(c.email);
        // Roll the log row back so the cooldown doesn't suppress a retry
        // for someone who never actually received anything.
        await supa.from('reengagement_sends').delete().eq('id', rec.id);
      }

      await new Promise(r => setTimeout(r, SEND_DELAY_MS));
    }

    const result = {
      ok: true, mode: 'live', inactive_days: inactiveDays,
      eligible: all.length, sent, failed, truncated,
      failures: failures.slice(0, 20),
    };
    console.log('Re-engagement send complete:', result);
    return json(result);

  } catch (err: any) {
    console.error('send-reengagement error:', err);
    return json({ ok: false, error: err.message }, 500);
  }
});
