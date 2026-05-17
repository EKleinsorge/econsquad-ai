// ============================================================
// Supabase Edge Function: send-monday-drop
// Triggered every Monday at 8am CT via GitHub Actions
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!;
const SITE_URL         = 'https://econsquad.ai';
const FROM_EMAIL       = 'ARIA from EconSquad <aria@econsquad.ai>';
const WARN_THRESHOLD   = 2500; // warn in admin when monthly sends exceed this

const supa = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Helpers ──────────────────────────────────────────────────

function todayDateStr(): string {
  return new Date().toISOString().split('T')[0];
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
    .select('id, email, name, unsubscribe_token')
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

  <!-- Hero -->
  <div style="background:rgba(14,20,36,0.9);border:1px solid rgba(170,255,62,0.2);border-radius:16px;padding:32px;margin-bottom:24px;">
    <p style="font-size:14px;color:#6b7a96;margin:0 0 6px;">Hi ${name},</p>
    <h1 style="font-family:Arial,sans-serif;font-size:26px;font-weight:900;color:#eef3fc;margin:0 0 16px;line-height:1.2;">
      ${issue.title.replace(/^Issue #\d+:\s*/, '')}
    </h1>
    <p style="font-size:14px;color:#8a97b5;line-height:1.7;margin:0 0 24px;">${issue.excerpt}</p>
    <a href="${issueUrl}" style="display:inline-block;background:#aaff3e;color:#1a3300;font-family:Arial,sans-serif;font-size:14px;font-weight:900;padding:14px 28px;border-radius:10px;text-decoration:none;">
      Read this week's drop →
    </a>
  </div>

  <!-- ARIA note -->
  <div style="display:flex;gap:12px;align-items:flex-start;background:rgba(14,20,36,0.5);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin-bottom:24px;">
    <div style="width:32px;height:32px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#d4ff70,#aaff3e 50%,#5a9900);flex-shrink:0;margin-top:2px;"></div>
    <div>
      <div style="font-family:Arial,sans-serif;font-size:13px;font-weight:800;color:#aaff3e;margin-bottom:4px;">ARIA</div>
      <p style="font-size:13px;color:#8a97b5;line-height:1.6;margin:0;">
        This week's drop is packed with practical workflows your team can start using today.
        Log in to your squad to put them into action — I'll be ready.
      </p>
    </div>
  </div>

  <!-- CTA -->
  <div style="text-align:center;margin-bottom:32px;">
    <a href="${SITE_URL}" style="display:inline-block;border:1px solid rgba(170,255,62,0.3);color:#aaff3e;font-family:Arial,sans-serif;font-size:13px;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;">
      Open My Squad Dashboard →
    </a>
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
  // Only allow POST from our GitHub Actions (auth via service key header)
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Check monthly warning threshold
    const monthlyCount = await getMonthlyCount();
    if (monthlyCount >= WARN_THRESHOLD) {
      console.warn(`⚠️ Monthly send count ${monthlyCount} has reached warning threshold ${WARN_THRESHOLD}`);
      // Store warning flag in DB so admin can see it
      await supa.from('monday_drop_sends').insert({
        subscriber_id: null,
        issue_number: -1,
        issue_date: todayDateStr(),
        issue_title: `WARNING: ${monthlyCount} emails sent this month — approaching limit`,
      }).select();
    }

    // Find today's issue
    const issue = await getTodaysIssue();
    if (!issue) {
      return new Response(JSON.stringify({ ok: false, message: 'No issue scheduled for today' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get active subscribers
    const subscribers = await getActiveSubscribers();
    if (!subscribers.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, message: 'No active subscribers' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    let sent = 0, skipped = 0, failed = 0;

    for (const sub of subscribers) {
      // Create send record (skip if already sent this issue)
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

      if (insertErr) {
        // Unique constraint = already sent this issue to this subscriber
        skipped++;
        continue;
      }

      // Build and send email
      const html = buildEmailHtml(sub, issue, sendRecord.tracking_token);
      const subject = `📬 Monday AI for ED Drop #${issue.issue}: ${issue.title.replace(/^Issue #\d+:\s*/, '')}`;
      const ok = await sendViaResend(sub.email, subject, html);

      if (ok) { sent++; } else { failed++; }

      // Small delay to stay within Resend rate limits
      await new Promise(r => setTimeout(r, 50));
    }

    const result = { ok: true, issue: issue.issue, sent, skipped, failed, monthlyTotal: monthlyCount + sent };
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
