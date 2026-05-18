// ============================================================
// Supabase Edge Function: send-affiliate-approval
// Called by admin when approving a partner application
// ============================================================

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SITE_URL       = 'https://econsquad.ai';
const FROM_EMAIL     = 'Eric from EconSquad <eric@econsquad.ai>';

Deno.serve(async (req: Request) => {
  console.log('[send-affiliate-approval] invoked', req.method, req.url);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    console.log('[send-affiliate-approval] body:', JSON.stringify(body));
    const { to, name, code } = body;

    const CORS = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
      'Content-Type': 'application/json',
    };

    if (!to || !code) {
      console.log('[send-affiliate-approval] missing fields, to=', to, 'code=', code);
      return new Response(JSON.stringify({ ok: false, error: 'Missing required fields' }), {
        status: 400, headers: CORS,
      });
    }

    const firstName   = (name || 'there').split(' ')[0];
    const refLink     = `${SITE_URL}/?ref=${code}`;
    const guideUrl    = `${SITE_URL}/affiliate-guide.html?ref=${code}&name=${encodeURIComponent(name||'')}`;
    const dashUrl     = `${SITE_URL}/index.html?ret=1`;

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>You're approved as an EconSquad AI Partner!</title>
</head>
<body style="margin:0;padding:0;background:#04050d;font-family:'DM Sans',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px 20px;">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:32px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 10px;">
      <tr>
        <td style="vertical-align:middle;padding-right:10px;">
          <!-- Logo icon: lime box with triangle-of-dots SVG -->
          <div style="width:40px;height:40px;background:#aaff3e;border-radius:9px;display:inline-block;text-align:center;line-height:40px;">
            <svg width="24" height="24" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-top:-2px;">
              <circle cx="11" cy="6" r="3.2" fill="rgba(15,30,0,0.85)"/>
              <circle cx="5" cy="16" r="2.6" fill="rgba(15,30,0,0.8)"/>
              <circle cx="17" cy="16" r="2.6" fill="rgba(15,30,0,0.8)"/>
              <line x1="11" y1="6" x2="5" y2="16" stroke="rgba(15,30,0,0.45)" stroke-width="1.2"/>
              <line x1="11" y1="6" x2="17" y2="16" stroke="rgba(15,30,0,0.45)" stroke-width="1.2"/>
              <line x1="5" y1="16" x2="17" y2="16" stroke="rgba(15,30,0,0.45)" stroke-width="1.2"/>
            </svg>
          </div>
        </td>
        <td style="vertical-align:middle;">
          <span style="font-family:Arial,sans-serif;font-size:22px;font-weight:900;letter-spacing:.02em;"><span style="color:#ffffff;">Econ</span><span style="color:#aaff3e;">Squad</span> <span style="color:#ffffff;font-size:14px;">AI</span></span>
        </td>
      </tr>
    </table>
    <div>
      <span style="background:rgba(170,255,62,0.1);border:1px solid rgba(170,255,62,0.25);color:#aaff3e;font-size:11px;font-weight:700;padding:4px 14px;border-radius:20px;letter-spacing:.06em;text-transform:uppercase;">
        ⚡ Squad Affiliate Program
      </span>
    </div>
  </div>

  <!-- Main card -->
  <div style="background:rgba(14,20,36,0.9);border:1px solid rgba(170,255,62,0.2);border-radius:16px;padding:32px;margin-bottom:20px;">
    <div style="font-size:36px;text-align:center;margin-bottom:16px;">🎉</div>
    <h1 style="font-family:Arial,sans-serif;font-size:26px;font-weight:900;color:#eef3fc;margin:0 0 10px;text-align:center;line-height:1.2;">
      You're in the Squad, ${firstName}!
    </h1>
    <p style="font-size:14px;color:#6b7a96;text-align:center;margin:0 0 28px;line-height:1.7;">
      Welcome to the EconSquad AI Squad Affiliate Program. You're now set up to earn commissions every month by bringing other economic developers into the Squad.
    </p>

    <!-- Referral link box -->
    <div style="background:rgba(170,255,62,0.08);border:1px solid rgba(170,255,62,0.3);border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
      <div style="font-size:11px;font-weight:700;color:#aaff3e;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;">Your Referral Link</div>
      <div style="font-family:monospace;font-size:15px;color:#eef3fc;word-break:break-all;margin-bottom:16px;">${refLink}</div>
      <a href="${refLink}" style="display:inline-block;background:#aaff3e;color:#1a3300;font-family:Arial,sans-serif;font-size:13px;font-weight:900;padding:10px 24px;border-radius:8px;text-decoration:none;">View your link →</a>
    </div>

    <!-- Commission reminder (table layout for email client compatibility) -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
      <tr><td style="padding-bottom:12px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:18px;padding-right:12px;vertical-align:top;line-height:1.4;">💰</td>
          <td style="font-size:13px;color:#8a97b5;line-height:1.6;vertical-align:top;"><strong style="color:#eef3fc;">10% monthly</strong> for every paying subscriber you refer — for as long as they stay subscribed.</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding-bottom:12px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:18px;padding-right:12px;vertical-align:top;line-height:1.4;">🏆</td>
          <td style="font-size:13px;color:#8a97b5;line-height:1.6;vertical-align:top;"><strong style="color:#eef3fc;">Milestone bonuses:</strong> $50 · $100 · $250 · $500 · $1,000 as your referral count grows.</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding-bottom:12px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:18px;padding-right:12px;vertical-align:top;line-height:1.4;">📅</td>
          <td style="font-size:13px;color:#8a97b5;line-height:1.6;vertical-align:top;"><strong style="color:#eef3fc;">Paid monthly</strong> via PayPal or Direct Deposit. Update your payout details anytime from your Partner dashboard.</td>
        </tr></table>
      </td></tr>
      <tr><td>
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:18px;padding-right:12px;vertical-align:top;line-height:1.4;">⏱️</td>
          <td style="font-size:13px;color:#8a97b5;line-height:1.6;vertical-align:top;">Anyone who signs up through your link within <strong style="color:#eef3fc;">30 days</strong> is counted as your referral.</td>
        </tr></table>
      </td></tr>
    </table>

    <!-- CTA buttons -->
    <div style="display:flex;flex-direction:column;gap:10px;">
      <a href="${guideUrl}" style="display:block;background:#aaff3e;color:#1a3300;font-family:Arial,sans-serif;font-size:14px;font-weight:900;padding:14px 28px;border-radius:10px;text-decoration:none;text-align:center;">
        ⚡ See your Squad sharing guide — email, text &amp; social templates
      </a>
      <a href="${dashUrl}" style="display:block;border:1px solid rgba(170,255,62,0.25);color:#aaff3e;font-family:Arial,sans-serif;font-size:13px;font-weight:700;padding:11px 28px;border-radius:10px;text-decoration:none;text-align:center;">
        ← Back to your dashboard
      </a>
    </div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:24px;">
    <p style="font-size:11px;color:#4a5568;margin:0 0 8px;">
      Questions? Reply to this email or reach us at <a href="mailto:partners@econsquad.ai" style="color:#6b7a96;">partners@econsquad.ai</a>
    </p>
    <p style="font-size:11px;color:#4a5568;margin:0;">
      <a href="${SITE_URL}" style="color:#6b7a96;text-decoration:underline;">econsquad.ai</a>
    </p>
  </div>

</div>
</body>
</html>`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [to],
        subject: `⚡ Welcome to the Squad, ${firstName}! Your affiliate link is ready.`,
        html,
      }),
    });

    const result = await r.json();
    console.log('[send-affiliate-approval] Resend status:', r.status, JSON.stringify(result));
    if (!r.ok) {
      return new Response(JSON.stringify({ ok: false, error: result }), {
        status: 500, headers: CORS,
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: CORS,
    });

  } catch (err: any) {
    console.log('[send-affiliate-approval] caught error:', err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
    });
  }
});
