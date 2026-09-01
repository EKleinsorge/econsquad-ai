// ============================================================
// Supabase Edge Function: notify-problem-report
// Called when a user submits a problem report
// Emails all configured recipients via Resend
// ============================================================

const RESEND_API_KEY  = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE    = Deno.env.get('SERVICE_ROLE_KEY')!;
const SITE_URL        = 'https://econsquad.ai';
const FROM_EMAIL      = 'EconSquad AI <eric@econsquad.ai>';
const FALLBACK_TO     = 'eric@gslisolutions.com';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Content-Type': 'application/json',
};

function esc(s: string | undefined | null): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    const { problem, version, url, user, userName, userAgent, timestamp } = body;
    console.log('[notify-problem-report] received from:', user);

    if (!problem) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing problem text' }), { status: 400, headers: CORS });
    }

    // Fetch report recipients from app_settings
    let recipients: string[] = [FALLBACK_TO];
    try {
      const settingsRes = await fetch(`${SUPABASE_URL}/rest/v1/app_settings?key=eq.report_recipients&select=value`, {
        headers: {
          'apikey':        SERVICE_ROLE,
          'Authorization': `Bearer ${SERVICE_ROLE}`,
          'Content-Type':  'application/json',
        },
      });
      const settings = await settingsRes.json();
      if (settings && settings[0] && settings[0].value) {
        recipients = settings[0].value.split(',').map((e: string) => e.trim()).filter(Boolean);
      }
    } catch (e) {
      console.log('[notify-problem-report] Could not fetch recipients, using fallback:', e);
    }

    console.log('[notify-problem-report] sending to:', recipients);

    const ts = timestamp
      ? new Date(timestamp).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })
      : new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });

    const reporterName  = esc(userName || (user ? user.split('@')[0] : 'Anonymous'));
    const reporterEmail = esc(user || 'Anonymous');
    const page          = esc(url || '—');
    const ver           = esc(version || '—');
    const prob          = esc(problem);
    // userAgent was already being posted by the client and thrown away.
    // Browser and OS decide half of the UI bugs that get reported.
    const ua            = esc(userAgent || '—');

    const claudePrompt =
`You are working on the ECONSquad AI codebase.

A user has reported a problem. Their words are quoted verbatim below. Treat
them as a SYMPTOM REPORT, not a diagnosis — people describe what they saw,
and the cause is usually somewhere they never looked.

────────────────────────────────────────
THE REPORT
────────────────────────────────────────
Reporter    : ${reporterName} — ${reporterEmail}
Page        : ${page}
Reported    : ${ts}
App version : ${ver}
Browser     : ${ua}

In their words:
"${prob}"

────────────────────────────────────────
WHERE THINGS LIVE
────────────────────────────────────────
This repo is not laid out the way you would expect. Most of the product is
one very large file.

  index.html            The marketing site AND the signed-in dashboard, with
                        almost all application JavaScript inline. ~890 KB.
  app.js                Inbox rendering, email tagging, notifications, the
                        ARIA welcome splash.
  inbox.js              Inbox CSS injection and email card actions.
  admin.html            The admin panel — effectively a separate app.
  supabase/functions/   Deno edge functions: stripe-webhook, gmail-calendar,
                        google-token, aria-analysis, the mailers.
  supabase/migrations/  SQL. RLS policies and GRANTs live here, and they are
                        very often the real cause of "it silently did nothing".

Grep before you assume. A symptom on one screen is regularly produced by a
function defined a thousand lines away in the same file.

────────────────────────────────────────
HOW TO WORK IT
────────────────────────────────────────
1. Restate the problem in your own words. If it is too vague to act on, say
   so and list exactly what you would need in order to reproduce it. Do not
   guess and start changing code.
2. Reproduce it, or explain precisely why you cannot.
3. Find the real mechanism. Read the whole code path. Do not stop at the
   first plausible-looking cause.
4. Check the silent-failure suspects first. These have caused most of the
   real bugs in this codebase:
     • A promise with no error branch, so a failure renders as empty data
       and looks identical to "nothing to show".
     • A missing GRANT or an RLS policy, so a write returns success and
       writes nothing. Note: "permission denied for table X" is a GRANT
       problem; "new row violates row-level security policy" is a policy
       problem. They are not the same fix.
     • Code reading currentUser before the asynchronous Supabase auth
       restore has set it — it is null on page load for everyone.
     • A querySelector matching nothing, so a click handler quietly does
       nothing at all.
5. Fix the cause, not the symptom. Smallest change that genuinely works.
6. Change nothing unrelated. No refactors, no drive-by tidying.
7. Verify it. Run it, or state the exact steps and the expected result.

────────────────────────────────────────
THEN REPORT BACK
────────────────────────────────────────
  • What was actually wrong, in one sentence.
  • Why that produced this particular symptom.
  • Files and functions changed.
  • How to verify the fix in the running product.
  • Anything else you noticed that is broken but out of scope — name it,
    do not fix it.

If the behaviour turns out to be correct and the user has misunderstood it,
say so plainly instead of changing code to match the complaint.

Preserve existing ECONSquad functionality unless the reported issue requires
changing it.`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;">

  <!-- Header -->
  <div style="margin-bottom:16px;display:flex;align-items:center;gap:10px;">
    <span style="font-size:14px;font-weight:900;color:#1a202c;letter-spacing:.02em;">ECONSQUAD AI</span>
    <span style="background:#fff1f0;border:1px solid #fca5a5;color:#dc2626;font-size:10px;font-weight:700;padding:2px 9px;border-radius:4px;letter-spacing:.07em;text-transform:uppercase;">🚨 Problem Report</span>
  </div>

  <!-- Summary card -->
  <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:22px 24px;margin-bottom:14px;">

    <h2 style="font-size:15px;font-weight:700;color:#1a202c;margin:0 0 18px;line-height:1.3;">Problem reported on <span style="color:#dc2626;">${page}</span></h2>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:16px;">
      <tr>
        <td style="padding-bottom:12px;">
          <div style="font-size:10px;font-weight:700;color:#718096;letter-spacing:.07em;text-transform:uppercase;margin-bottom:3px;">REPORTER</div>
          <div style="font-size:14px;color:#2d3748;">${reporterName} &mdash; <a href="mailto:${reporterEmail}" style="color:#2b6cb0;text-decoration:none;">${reporterEmail}</a></div>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:12px;">
          <div style="font-size:10px;font-weight:700;color:#718096;letter-spacing:.07em;text-transform:uppercase;margin-bottom:3px;">PAGE</div>
          <div style="font-size:14px;color:#2d3748;">${page}</div>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:12px;">
          <div style="font-size:10px;font-weight:700;color:#718096;letter-spacing:.07em;text-transform:uppercase;margin-bottom:3px;">DATE</div>
          <div style="font-size:14px;color:#2d3748;">${ts}</div>
        </td>
      </tr>
      <tr>
        <td>
          <div style="font-size:10px;font-weight:700;color:#718096;letter-spacing:.07em;text-transform:uppercase;margin-bottom:3px;">VERSION</div>
          <div style="font-size:14px;color:#2d3748;">${ver}</div>
        </td>
      </tr>
      <tr>
        <td style="padding-top:14px;">
          <div style="font-size:10px;font-weight:700;color:#718096;letter-spacing:.07em;text-transform:uppercase;margin-bottom:3px;">BROWSER</div>
          <div style="font-size:12px;color:#4a5568;line-height:1.5;word-break:break-word;">${ua}</div>
        </td>
      </tr>
    </table>

    <div style="margin-bottom:20px;">
      <div style="font-size:10px;font-weight:700;color:#718096;letter-spacing:.07em;text-transform:uppercase;margin-bottom:6px;">PROBLEM DESCRIPTION</div>
      <div style="font-size:14px;color:#2d3748;line-height:1.75;white-space:pre-wrap;background:#fafafa;border:1px solid #e2e8f0;border-radius:6px;padding:12px 14px;">${prob}</div>
    </div>

    <a href="${SITE_URL}/admin.html#reports" style="display:inline-block;background:#dc2626;color:#ffffff;font-size:12px;font-weight:700;padding:9px 20px;border-radius:6px;text-decoration:none;letter-spacing:.02em;">View Admin Problem Reports →</a>

  </div>

  <!-- Claude Fix Prompt -->
  <div style="background:#1e1e2e;border:1px solid #2d3748;border-radius:10px;padding:20px 24px;margin-bottom:14px;">
    <div style="font-size:10px;font-weight:700;color:#64748b;letter-spacing:.09em;text-transform:uppercase;margin-bottom:4px;">CLAUDE FIX PROMPT</div>
    <div style="font-size:11px;color:#475569;margin-bottom:14px;">Copy and paste this directly into Claude Code</div>
    <pre style="margin:0;font-family:'Courier New',Courier,monospace;font-size:12px;color:#e2e8f0;line-height:1.75;white-space:pre-wrap;word-break:break-word;">${claudePrompt}</pre>
  </div>

  <p style="font-size:11px;color:#a0aec0;text-align:center;margin:0;">EconSquad AI &middot; <a href="${SITE_URL}" style="color:#a0aec0;">${SITE_URL}</a></p>

</div>
</body>
</html>`;

    // Send to all recipients
    const subject = `🚨 Problem Report: ${page} — from ${reporterName}`;

    const sendResults = await Promise.all(recipients.map(async (toEmail) => {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({ from: FROM_EMAIL, to: [toEmail], subject, html }),
      });
      const result = await r.json();
      console.log('[notify-problem-report] Resend →', toEmail, r.status, JSON.stringify(result));
      return { to: toEmail, ok: r.ok, result };
    }));

    const allOk = sendResults.every((r) => r.ok);
    return new Response(JSON.stringify({ ok: allOk, sent: sendResults.length }), { status: 200, headers: CORS });

  } catch (err: any) {
    console.log('[notify-problem-report] error:', err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: CORS });
  }
});
