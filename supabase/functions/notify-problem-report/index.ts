// ============================================================
// Supabase Edge Function: notify-problem-report
// Called when a user submits a problem report
// Emails all configured recipients via Resend
// ============================================================

const RESEND_API_KEY  = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL        = 'https://econsquad.ai';
const FROM_EMAIL      = 'EconSquad AI <eric@econsquad.ai>';
const FALLBACK_TO     = 'eric@gslisolutions.com';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Content-Type': 'application/json',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    const { problem, version, url, user, userAgent, timestamp } = body;
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

    const ts = timestamp ? new Date(timestamp).toLocaleString('en-US', { timeZone: 'America/New_York' }) : new Date().toLocaleString();

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#04050d;font-family:Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;padding:32px 20px;">

  <!-- Header -->
  <div style="margin-bottom:24px;">
    <span style="font-family:Arial,sans-serif;font-size:20px;font-weight:900;"><span style="color:#ffffff;">Econ</span><span style="color:#aaff3e;">Squad</span> <span style="color:#ffffff;font-size:13px;">AI</span></span>
    <span style="margin-left:12px;background:rgba(255,80,80,0.15);border:1px solid rgba(255,80,80,0.3);color:#ff8080;font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:.06em;text-transform:uppercase;">🚨 Problem Report</span>
  </div>

  <!-- Card -->
  <div style="background:rgba(14,20,36,0.9);border:1px solid rgba(255,80,80,0.2);border-radius:16px;padding:28px;margin-bottom:20px;">
    <h2 style="font-size:18px;font-weight:900;color:#eef3fc;margin:0 0 20px;">A user reported a problem</h2>

    <!-- Problem description -->
    <div style="background:rgba(255,80,80,0.06);border:1px solid rgba(255,80,80,0.15);border-radius:10px;padding:16px;margin-bottom:20px;">
      <div style="font-size:10px;font-weight:700;color:#ff8080;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;">Problem Description</div>
      <div style="font-size:14px;color:#eef3fc;line-height:1.7;white-space:pre-wrap;">${problem}</div>
    </div>

    <!-- Meta info table -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr><td style="padding-bottom:10px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:11px;font-weight:700;color:#4a5568;width:100px;vertical-align:top;padding-top:1px;">USER</td>
          <td style="font-size:12px;color:#8a97b5;">${user || 'Anonymous'}</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding-bottom:10px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:11px;font-weight:700;color:#4a5568;width:100px;vertical-align:top;padding-top:1px;">TIME</td>
          <td style="font-size:12px;color:#8a97b5;">${ts}</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding-bottom:10px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:11px;font-weight:700;color:#4a5568;width:100px;vertical-align:top;padding-top:1px;">VERSION</td>
          <td style="font-size:12px;color:#8a97b5;">${version || '—'}</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding-bottom:10px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:11px;font-weight:700;color:#4a5568;width:100px;vertical-align:top;padding-top:1px;">PAGE</td>
          <td style="font-size:12px;color:#8a97b5;word-break:break-all;">${url || '—'}</td>
        </tr></table>
      </td></tr>
    </table>

    <!-- CTA -->
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06);">
      <a href="${SITE_URL}/admin.html" style="display:inline-block;background:rgba(255,80,80,0.15);border:1px solid rgba(255,80,80,0.3);color:#ff8080;font-size:12px;font-weight:700;padding:8px 20px;border-radius:8px;text-decoration:none;">View in Admin Panel →</a>
    </div>
  </div>

  <p style="font-size:11px;color:#4a5568;margin:0;text-align:center;">EconSquad AI · <a href="${SITE_URL}" style="color:#6b7a96;">econsquad.ai</a></p>
</div>
</body>
</html>`;

    // Send to all recipients
    const sendResults = await Promise.all(recipients.map(async (toEmail) => {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from:    FROM_EMAIL,
          to:      [toEmail],
          subject: `🚨 Problem Report from ${user || 'Anonymous'} — EconSquad AI`,
          html,
        }),
      });
      const result = await r.json();
      console.log('[notify-problem-report] Resend →', toEmail, r.status, JSON.stringify(result));
      return { to: toEmail, ok: r.ok, result };
    }));

    const allOk = sendResults.every(function(r) { return r.ok; });
    return new Response(JSON.stringify({ ok: allOk, sent: sendResults.length }), { status: 200, headers: CORS });

  } catch (err: any) {
    console.log('[notify-problem-report] error:', err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: CORS });
  }
});
