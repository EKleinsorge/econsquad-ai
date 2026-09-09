// supabase/functions/request-quote/index.ts
//
// ═══════════════════════════════════════════════════════════════════════
//  TEAM QUOTE REQUESTS
// ═══════════════════════════════════════════════════════════════════════
//
// Replaces a mailto: link that did nothing on any browser without a mail
// handler registered — which is most of the public-sector buyers the Team card
// is written for. Saves the request, then emails Eric.
//
// ⚠️ NO PAYMENT DETAILS, EVER
//
// This function accepts a payment PREFERENCE — the word 'card', 'invoice',
// 'check' or 'unsure' — and nothing else about money. Anything that resembles a
// card number or a bank account in the free-text fields is REFUSED, not stored
// and not emailed, with a message telling the sender why. Somebody helpfully
// pasting their card into "anything else we should know" must not end up with
// it sitting in a database row and an inbox, and the only moment it can be
// stopped is here, before the first write.
//
// verify_jwt stays ON for this one. Unlike track-click, the caller is the
// pricing page itself, which already holds the anon key, so there is no reason
// to add a second unauthenticated endpoint to the product.
//
// ORDER OF OPERATIONS: save first, email second. If Resend is down, a lead that
// is in the table with email_error set can still be recovered; a lead that was
// only ever an email attempt is gone. The admin list shows which is which.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';
const FROM_EMAIL     = 'EconSquad AI <eric@econsquad.ai>';
const FALLBACK_TO    = 'eric@gslisolutions.com';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Content-Type': 'application/json',
};

const PAY_LABEL: Record<string, string> = {
  card:    'Credit card',
  invoice: 'Purchase order / invoice',
  check:   'Check or bank transfer (ACH)',
  unsure:  'Not sure yet — wants to discuss',
};

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function clean(v: unknown, max: number): string {
  // Strips control characters as well as trimming: a newline injected into a
  // header-ish field is the classic way to make one field look like two.
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

// Deliberately loose. A stricter regex rejects real addresses (public-sector
// domains get long and odd) and the cost of a bad address here is a bounce, not
// a security problem.
export function looksLikeEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;
}

function luhn(digits: string): boolean {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d; alt = !alt;
  }
  return sum % 10 === 0;
}

/* Catches a payment detail somebody typed in by mistake, before it is written
   anywhere.

   THE HARD PART IS NOT CATCHING CARDS, IT IS NOT CATCHING PHONE NUMBERS. My
   first version flagged any run of more than eight digits, which rejects
   "call me at 555-123-4567" — one of the most ordinary things a person can put
   in a notes box, and the kind of false positive that makes somebody give up on
   a form rather than edit it. So the rules are specific about what they mean:

     1. Thirteen or more consecutive digits. Every card number is 13–19 digits;
        nothing legitimate on this form is. A US phone is 10, with a country
        code 11, and a PO or budget figure is far shorter.
     2. Eight to twelve digits ONLY when the surrounding text is talking about
        banking — routing, ABA, account number, IBAN, checking, savings. That is
        what separates a 9-digit routing number from a 9-digit anything else.

   Luhn is used to explain the refusal, not to decide it: a mistyped card is
   still a card, and should still be kept out. */
const BANK_WORDS = /\b(routing|aba|iban|swift|bic|acct|account\s*(?:no|number|#)|checking|savings|sort\s*code)\b/i;

export function containsPaymentDetail(text: string): boolean {
  const s = String(text ?? '');
  const runs = s.match(/\d(?:[\d ‑–—.-]*\d)?/g) ?? [];
  const bankish = BANK_WORDS.test(s);
  for (const run of runs) {
    const d = run.replace(/\D/g, '');
    if (d.length >= 13) return true;                       // rule 1
    if (bankish && d.length >= 8 && d.length <= 12) return true;  // rule 2
  }
  return false;
}

async function sb(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405, headers: CORS });
  }

  const fail = (msg: string, status = 400) =>
    new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));

    // Honeypot: a field hidden from people and irresistible to form bots.
    // Answered = not a person. Return success so the bot stops retrying.
    if (clean(body.website, 200)) {
      console.log('[request-quote] honeypot filled, dropping silently');
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
    }

    const full_name    = clean(body.full_name, 120);
    const organization = clean(body.organization, 200);
    const email        = clean(body.email, 254).toLowerCase();
    const phone        = clean(body.phone, 40);
    const role_title   = clean(body.role_title, 120);
    const timeline     = clean(body.timeline, 200);
    const notes        = clean(body.notes, 2000);
    const payment_pref = clean(body.payment_pref, 20).toLowerCase();

    if (!full_name)    return fail('Please tell us your name.');
    if (!organization) return fail('Please tell us your organization.');
    if (!looksLikeEmail(email)) return fail('That email address does not look right.');
    if (payment_pref && !PAY_LABEL[payment_pref]) return fail('Unrecognised payment preference.');

    let seats: number | null = Number(body.seats);
    if (!Number.isFinite(seats) || seats <= 0) seats = null;
    else seats = Math.min(Math.round(seats), 5000);

    // See containsPaymentDetail. This runs before anything is written.
    // Phone is checked with the same rule as everything else. It used to take a
    // looser second argument, left over from the first version that counted
    // digit runs; the rewrite dropped the parameter and this call site kept
    // passing it. JavaScript ignored the extra argument so it behaved
    // correctly, which is exactly why it survived a live deploy unnoticed -
    // caught by a type check, not by anything going wrong.
    if (containsPaymentDetail(notes) || containsPaymentDetail(role_title) ||
        containsPaymentDetail(organization) || containsPaymentDetail(phone)) {
      return fail(
        'For your security, please remove any card or bank account numbers. ' +
        'Just choose how you would like to pay and we will send a secure payment link or an invoice.',
      );
    }

    // ── Light abuse guard ────────────────────────────────────────────
    // Somebody submitting twice because they were not sure it worked is normal.
    // Five in an hour from one address is a script.
    const since = new Date(Date.now() - 3600_000).toISOString();
    const dupeRes = await sb(
      `quote_requests?select=id&email=eq.${encodeURIComponent(email)}&created_at=gte.${since}`,
    );
    const dupes = dupeRes.ok ? await dupeRes.json().catch(() => []) : [];
    if (Array.isArray(dupes) && dupes.length >= 5) {
      console.log('[request-quote] rate limited:', email);
      // Same shape as success. A rate limiter that announces itself is a rate
      // limiter somebody tunes their script against.
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
    }

    const acq = (body.acq ?? {}) as Record<string, unknown>;
    const row = {
      full_name, organization, email,
      phone:        phone || null,
      role_title:   role_title || null,
      seats,
      payment_pref: payment_pref || null,
      timeline:     timeline || null,
      notes:        notes || null,
      acq_channel:  clean(acq.channel, 60) || null,
      acq_campaign: clean(acq.campaign, 120) || null,
      acq_source:   clean(acq.source, 120) || null,
      landing:      clean(acq.landing, 300) || null,
      referrer:     clean(acq.referrer, 300) || null,
      user_agent:   (req.headers.get('user-agent') ?? '').slice(0, 300) || null,
    };

    // ── Save first ───────────────────────────────────────────────────
    const insRes = await sb('quote_requests', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    if (!insRes.ok) {
      const t = await insRes.text();
      console.error('[request-quote] insert failed:', insRes.status, t);
      return fail('We could not save that just now. Please email eric@econsquad.ai and we will pick it up.', 500);
    }
    const saved = (await insRes.json())[0];
    console.log('[request-quote] saved request', saved?.id, 'from', organization);

    // ── Then tell Eric ───────────────────────────────────────────────
    let recipients = [FALLBACK_TO];
    try {
      const s = await sb('app_settings?key=eq.quote_recipients&select=value');
      const rows = await s.json();
      if (rows?.[0]?.value) {
        const list = String(rows[0].value).split(',').map((x: string) => x.trim()).filter(Boolean);
        if (list.length) recipients = list;
      }
    } catch { /* fallback stands */ }

    const when = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short',
    });
    const line = (k: string, v: string) => v
      ? `<tr><td style="padding:6px 14px 6px 0;color:#6b7a96;white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="padding:6px 0;color:#0d1220;font-weight:600;">${esc(v)}</td></tr>`
      : '';

    const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;">
  <p style="font-size:13px;color:#6b7a96;margin:0 0 4px;">Team quote request &middot; ${esc(when)} ET</p>
  <h2 style="margin:0 0 16px;font-size:22px;color:#0d1220;">${esc(organization)}</h2>
  <table style="border-collapse:collapse;font-size:14px;">
    ${line('Name', full_name)}
    ${line('Role', role_title)}
    ${line('Email', email)}
    ${line('Phone', phone)}
    ${line('Seats wanted', seats ? String(seats) : '')}
    ${line('Wants to pay by', payment_pref ? PAY_LABEL[payment_pref] : '')}
    ${line('Timeline', timeline)}
    ${line('Came from', row.acq_channel ?? '')}
    ${line('Campaign', row.acq_campaign ?? '')}
  </table>
  ${notes ? `<p style="margin:18px 0 4px;color:#6b7a96;font-size:13px;">What they said</p>
  <div style="background:#f4f6fa;border-left:3px solid #aaff3e;padding:12px 16px;font-size:14px;color:#0d1220;white-space:pre-wrap;">${esc(notes)}</div>` : ''}
  <p style="margin:22px 0 0;font-size:13px;color:#6b7a96;">Reply to this email to answer ${esc(full_name.split(' ')[0])} directly.</p>
</div>`;

    // ── Tell the person who asked, first ─────────────────────────────
    // Until this existed they filled in the form, saw a green confirmation
    // promising them a written quote by email, and then received nothing at
    // all. Somebody who submits a form and hears nothing assumes it failed —
    // and a public-sector buyer has no record of having asked. This is short on
    // purpose: it is a receipt, not a pitch, and the real quote follows from
    // Eric.
    let ack_emailed_at: string | null = null;
    let ack_error: string | null = null;
    try {
      if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
      const first = full_name.split(' ')[0] || 'there';
      const ackHtml = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:540px;color:#0d1220;line-height:1.6;">
  <p>Hi ${esc(first)},</p>
  <p>Thanks for asking about the Team plan for <strong>${esc(organization)}</strong>. This is just to confirm it reached us${seats ? `, for ${seats} ${seats === 1 ? 'person' : 'people'}` : ''}.</p>
  <p>Eric will send you a written quote within one business day — one you can take to a board or attach to a purchase order. ${payment_pref === 'invoice' || payment_pref === 'check' ? 'It will be set up for a purchase order, with net 30 terms, and a W-9 is available on request.' : ''}</p>
  <p style="margin:20px 0;padding:14px 18px;background:#f4f6fa;border-left:3px solid #aaff3e;">
    <strong>What the Team plan is:</strong> $4,950 a year for five people, with a sixth seat at no charge.
    Every seat gets all 22 specialists, ARIA, and the Gmail and Calendar integration.
    Seats belong to the organisation, so you reassign one when somebody joins or leaves.
  </p>
  <p>If anything has changed, or you would rather talk it through first, just reply to this email — it comes straight to Eric.</p>
  <p style="margin-top:22px;">Eric Kleinsorge<br>
  <span style="color:#6b7a96;font-size:13px;">EconSquad AI &middot; Global Site Location Industries, LLC<br>econsquad.ai</span></p>
  <p style="margin-top:22px;font-size:12px;color:#8a94a8;">
    We will never ask you for a card number, bank details or a password by email.
  </p>
</div>`;
      const ar = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [email],
          reply_to: 'eric@econsquad.ai',
          subject: `Your EconSquad Team quote request — ${organization}`,
          html: ackHtml,
        }),
      });
      if (!ar.ok) throw new Error(`Resend ${ar.status}: ${(await ar.text()).slice(0, 200)}`);
      ack_emailed_at = new Date().toISOString();
    } catch (e) {
      ack_error = e instanceof Error ? e.message : String(e);
      // Not fatal. The request is saved and Eric is about to be told; the admin
      // list shows that this person is still waiting to hear anything.
      console.error('[request-quote] acknowledgement failed:', ack_error);
    }

    let emailed_at: string | null = null;
    let email_error: string | null = null;
    try {
      if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: recipients,
          // So Eric can hit reply and be writing to the prospect, not to himself.
          reply_to: email,
          subject: `Team quote request — ${organization}${seats ? ` (${seats} seats)` : ''}`,
          html,
        }),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
      emailed_at = new Date().toISOString();
    } catch (e) {
      email_error = e instanceof Error ? e.message : String(e);
      console.error('[request-quote] notification email failed:', email_error);
    }

    // The request is already safe. This only records whether Eric was told.
    if (saved?.id) {
      await sb(`quote_requests?id=eq.${saved.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ emailed_at, email_error, ack_emailed_at, ack_error }),
      }).catch(() => {});
    }

    // Success either way: the person asked for a quote and the request is
    // recorded. A failed notification is Eric's problem to see in admin, not
    // something to show a prospect as an error.
    return new Response(JSON.stringify({ ok: true, id: saved?.id ?? null }), { status: 200, headers: CORS });
  } catch (e) {
    console.error('[request-quote] unhandled:', e instanceof Error ? e.message : String(e));
    return fail('Something went wrong. Please email eric@econsquad.ai and we will pick it up.', 500);
  }
});
