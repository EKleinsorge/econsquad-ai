// ============================================================
// Supabase Edge Function: send-monday-drop
// Triggered hourly on Mondays via GitHub Actions.
// Sends only to subscribers where it is currently 10am in
// their stored timezone — skips everyone else that hour.
// The unique constraint on monday_drop_sends prevents any
// subscriber from receiving the same issue twice.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY      = Deno.env.get('SERVICE_ROLE_KEY')!;
const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!;
const SITE_URL         = 'https://econsquad.ai';
const FROM_EMAIL       = 'ARIA from EconSquad <aria@econsquad.ai>';
const WARN_THRESHOLD   = 2500;

const supa = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Helpers ──────────────────────────────────────────────────

function todayDateStr(): string {
  return new Date().toISOString().split('T')[0];
}

/** Returns the current hour (0-23) in the given IANA timezone. */
function localHour(timezone: string): number {
  try {
    const str = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(new Date());
    const h = parseInt(str, 10);
    return isNaN(h) ? -1 : h;
  } catch {
    return -1; // unknown timezone — skip
  }
}

async function getTodaysIssue(): Promise<any | null> {
  const res  = await fetch(`${SITE_URL}/blog-feed.json?v=${Date.now()}`);
  const feed = await res.json();
  const today = todayDateStr();
  const drops: any[] = feed?.monday_drops ?? [];
  return drops.find((d: any) => d.date === today) ?? null;
}

async function getActiveSubscribers(): Promise<any[]> {
  const { data, error } = await supa
    .from('monday_drop_subscribers')
    .select('id, email, name, unsubscribe_token, timezone')
    .is('unsubscribed_at', null);
  if (error) throw error;
  return data ?? [];
}

async function getMonthlyCount(): Promise<number> {
  const start = new Date();
  start.setDate(1); start.setHours(0,0,0,0);
  const { count } = await supa
    .from('monday_drop_sends')
    .select('id', { count: 'exact', head: true })
    .gte('sent_at', start.toISOString());
  return count ?? 0;
}

async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  });
  return r.ok;
}

function buildEmailHtml(subscriber: any, issue: any, trackingToken: string): string {
  const unsubUrl    = `${SITE_URL}/unsubscribe.html?t=${subscriber.unsubscribe_token}`;
  const trackPixel  = `${SUPABASE_URL}/functions/v1/track-open?t=${trackingToken}`;
  const issueUrl    = `${SITE_URL}/${issue.url}`;
  const name        = subscriber.name || 'there';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${issue.title}</title>
</head>
<body style="margin:0;padding:0;background:#04050d;font-family:'DM Sans',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px 20px;">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:32px;">
    <div style="display:inline-flex;align-items:center;gap:10px;text-decoration:none;">
      <div style="width:36px;height:36px;background:#aaff3e;border-radius:8px;display:inline-block;"></div>
      <span style="font-family:Arial,sans-serif;font-size:20px;font-weight:900;color:#aaff3e;letter-spacing:.02em;">EconSquad<sup style="font-size:12px;">AI</sup></span>
    </div>
    <div style="margin-top:8px;">
      <span style="background:rgba(170,255,62,0.1);border:1px solid rgba(170,255,62,0.25);color:#aaff3e;font-size:11px;font-weight:700;padding:4px 14px;border-radius:20px;letter-spacing:.06em;text-transform:uppercase;">
        Monday AI for ED Drop — Issue #${issue.issue}
      </span>
    </div>
  </div>

  <!-- Article card -->
  <div style="background:rgba(14,20,36,0.9);border:1px solid rgba(170,255,62,0.2);border-radius:16px;padding:32px;margin-bottom:20px;">
    <p style="font-size:14px;color:#6b7a96;margin:0 0 8px;">Good morning, ${name} —</p>
    <h1 style="font-family:Arial,sans-serif;font-size:24px;font-weight:900;color:#eef3fc;margin:0 0 14px;line-height:1.25;">
      ${issue.title.replace(/^Issue #\d+:\s*/, '')}
    </h1>
    <p style="font-size:14px;color:#8a97b5;line-height:1.75;margin:0 0 24px;">${issue.excerpt}</p>
    <a href="${issueUrl}" style="display:inline-block;background:#aaff3e;color:#1a3300;font-family:Arial,sans-serif;font-size:14px;font-weight:900;padding:14px 28px;border-radius:10px;text-decoration:none;">Read this week's drop →</a>
  </div>

  <!-- ARIA note -->
  <div style="display:flex;gap:12px;align-items:flex-start;background:rgba(14,20,36,0.5);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:18px;margin-bottom:20px;">
    <div style="width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#d4ff70,#aaff3e 50%,#5a9900);flex-shrink:0;margin-top:2px;"></div>
    <div>
      <div style="font-family:Arial,sans-serif;font-size:12px;font-weight:800;color:#aaff3e;margin-bottom:4px;">ARIA</div>
      <p style="font-size:13px;color:#8a97b5;line-height:1.6;margin:0;">This week's workflows are ready to use in your squad. Log in and I'll help you put them into action.</p>
    </div>
  </div>

  <!-- Back to dashboard -->
  <div style="text-align:center;margin-bottom:28px;">
    <a href="${SITE_URL}/index.html?ret=1" style="display:inline-block;border:1px solid rgba(170,255,62,0.25);color:#aaff3e;font-family:Arial,sans-serif;font-size:13px;font-weight:700;padding:11px 22px;border-radius:10px;text-decoration:none;">← Back to your squad dashboard</a>
  </div>

  <!-- Footer -->
  <div style="text-align:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:24px;">
    <p style="font-size:11px;color:#4a5568;margin:0 0 8px;">
      You're receiving this because you have an EconSquad AI account.
    </p>
    <p style="font-size:11px;color:#4a5568;margin:0;">
      <a href="${unsubUrl}" style="color:#6b7a96;text-decoration:underline;">Unsubscribe from Monday Drop emails</a>
      &nbsp;·&nbsp;
      <a href="${SITE_URL}" style="color:#6b7a96;text-decoration:underline;">econsquad.ai</a>
    </p>
  </div>
</div>

<!-- Tracking pixel -->
<img src="${trackPixel}" width="1" height="1" style="display:none;" alt="">
</body>
</html>`;
}

// ── Main handler ─────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* no body is fine */ }
    const dryRun = body.dry_run === true  || body.dry_run === 'true'
                || body.dry_run === 1     || body.dry_run === '1';
    const force  = body.force  === true  || body.force  === 'true'
                || body.force  === 1     || body.force  === '1';

    // Monthly warning check
    const monthlyCount = await getMonthlyCount();
    if (monthlyCount >= WARN_THRESHOLD) {
      console.warn(`⚠️ Monthly send count ${monthlyCount} >= ${WARN_THRESHOLD}`);
      if (!dryRun) {
        await supa.from('monday_drop_sends').insert({
          subscriber_id: null,
          issue_number: -1,
          issue_date: todayDateStr(),
          issue_title: `WARNING: ${monthlyCount} emails sent this month — approaching limit`,
        }).select();
      }
    }

    // Find today's issue
    const issue = await getTodaysIssue();
    if (!issue) {
      return new Response(JSON.stringify({ ok: false, message: 'No issue scheduled for today' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get all active subscribers (includes timezone column)
    const allSubscribers = await getActiveSubscribers();
    if (!allSubscribers.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, message: 'No active subscribers' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Filter to subscribers where it is currently 10am in their timezone (skip when force=true)
    const subscribers = force
      ? allSubscribers
      : allSubscribers.filter(s => localHour(s.timezone ?? 'America/Chicago') === 10);

    // Dry run: report what would happen this hour
    if (dryRun) {
      const { data: already } = await supa
        .from('monday_drop_sends')
        .select('subscriber_id')
        .eq('issue_number', issue.issue);
      const alreadySent = new Set((already ?? []).map((r: any) => r.subscriber_id));
      const wouldSend   = subscribers.filter((s: any) => !alreadySent.has(s.id));

      const report = {
        ok: true,
        mode: 'dry_run',
        issue: issue.issue,
        issue_title: issue.title,
        utc_hour: new Date().getUTCHours(),
        force,
        all_subscribers: allSubscribers.length,
        in_10am_window: force ? allSubscribers.length : subscribers.length,
        would_send: wouldSend.length,
        would_skip_already_sent: subscribers.length - wouldSend.length,
        monthly_count: monthlyCount,
        sample: wouldSend.slice(0, 10).map((s: any) => ({ email: s.email, timezone: s.timezone })),
      };
      console.log('Monday Drop DRY RUN:', report);
      return new Response(JSON.stringify(report), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    let sent = 0, skipped = 0, failed = 0;

    for (const sub of subscribers) {
      // Insert send record — unique constraint skips if already sent this issue
      const { data: sendRecord, error: insertErr } = await supa
        .from('monday_drop_sends')
        .insert({
          subscriber_id: sub.id,
          issue_number:  issue.issue,
          issue_date:    issue.date,
          issue_title:   issue.title,
        })
        .select('id, tracking_token')
        .single();

      if (insertErr) { skipped++; continue; }

      const html    = buildEmailHtml(sub, issue, sendRecord.tracking_token);
      const subject = `📬 Monday AI for ED Drop #${issue.issue}: ${issue.title.replace(/^Issue #\d+:\s*/, '')}`;
      const ok      = await sendViaResend(sub.email, subject, html);

      if (ok) { sent++; } else { failed++; }

      await new Promise(r => setTimeout(r, 50));
    }

    const result = {
      ok: true,
      issue: issue.issue,
      utc_hour: new Date().getUTCHours(),
      force,
      in_10am_window: subscribers.length,
      sent, skipped, failed,
      monthlyTotal: monthlyCount + sent,
    };
    console.log('Monday Drop send complete:', result);

    return new Response(JSON.stringify(result), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('send-monday-drop error:', err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
