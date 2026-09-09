// supabase/functions/send-quote/index.ts
//
// ═══════════════════════════════════════════════════════════════════════
//  SENDS A PREPARED QUOTE TO THE PROSPECT
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ THIS FUNCTION SENDS MAIL AS ECONSQUAD TO AN ARBITRARY ADDRESS.
// It is therefore admin-only, checked the same way send-admin-message checks:
// the caller's own JWT is verified, then their email is looked up in
// public.admins. An ordinary signed-in member reaching this endpoint gets a
// 403. Being able to call an edge function is not the same as being allowed to.
//
// ⚠️ THE BODY CARRIES ONLY AN id. NOTHING ELSE IS TRUSTED.
//
// Every figure in the quote is read from the database row, never from the
// request. Two reasons, and the second is the important one:
//
//   1. The quote that goes out is then necessarily the quote that was reviewed
//      and saved. There is no way for the email and the record to disagree,
//      which for a priced document a public body will hold you to is the whole
//      point.
//   2. quote_total is a generated column. Even the database will not let a
//      total be written that disagrees with seats x unit price, so a tampered
//      or simply stale browser cannot produce a quote whose sum is wrong.
//
// Eric is BCC'd so he holds a copy of exactly what the prospect received.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildQuotePdf } from './quotepdf.ts';
import { logoBytes } from './logo.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';
const FROM_EMAIL     = 'EconSquad AI <eric@econsquad.ai>';
const REPLY_TO       = 'eric@econsquad.ai';
const BCC            = 'eric@gslisolutions.com';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Content-Type': 'application/json',
};

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* Admin-written prose. Line breaks are preserved; markup is not, because an
   admin pasting from Word should not be able to put a <script> or a stray
   table into a document going to a customer. */
export function para(s: unknown): string {
  const t = esc(s).trim();
  if (!t) return '';
  return t.split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 12px;">${p.replace(/\n/g, '<br>')}</p>`).join('');
}

export function money(n: unknown): string {
  const v = Number(n ?? 0);
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function longDate(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d.length <= 10 ? d + 'T12:00:00Z' : d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
}

export interface QuoteRow {
  organization: string; full_name: string; role_title?: string | null;
  email: string; quote_sent_to?: string | null;
  quote_no?: string | null; quote_prepared_at?: string | null;
  quote_seats?: number | null; quote_unit_price?: number | null;
  quote_free_seats?: number | null; quote_total?: number | null;
  quote_valid_until?: string | null; quote_intro?: string | null; quote_terms?: string | null;
}

export function renderQuote(r: QuoteRow): string {
  const seats = r.quote_seats ?? 0;
  const free  = r.quote_free_seats ?? 0;
  const unit  = Number(r.quote_unit_price ?? 0);
  const total = Number(r.quote_total ?? 0);

  const row = (desc: string, qty: string, amount: string, muted = false) =>
    `<tr>
       <td style="padding:10px 0;border-bottom:1px solid #e6eaf2;color:${muted ? '#6b7a96' : '#0d1220'};">${desc}</td>
       <td style="padding:10px 0;border-bottom:1px solid #e6eaf2;text-align:center;color:${muted ? '#6b7a96' : '#0d1220'};">${qty}</td>
       <td style="padding:10px 0;border-bottom:1px solid #e6eaf2;text-align:right;color:${muted ? '#6b7a96' : '#0d1220'};white-space:nowrap;">${amount}</td>
     </tr>`;

  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:620px;color:#0d1220;line-height:1.6;">

  <div style="border-bottom:3px solid #aaff3e;padding-bottom:10px;margin-bottom:6px;">
    <img src="https://econsquad.ai/econsquad-logo.png" width="200" height="50"
         alt="EconSquad AI" style="display:block;border:0;outline:none;text-decoration:none;">
  </div>
  <div style="font-size:11px;color:#6b7a96;margin-bottom:26px;">
    Global Site Location Industries, LLC &nbsp;&middot;&nbsp; econsquad.ai &nbsp;&middot;&nbsp; eric@econsquad.ai
  </div>

  <div style="font-size:18px;font-weight:800;letter-spacing:.04em;margin-bottom:20px;">QUOTATION — TEAM PLAN</div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px;">
    <tr>
      <td style="vertical-align:top;width:55%;">
        <div style="font-size:10px;font-weight:700;color:#6b7a96;letter-spacing:.08em;margin-bottom:6px;">PREPARED FOR</div>
        <div style="font-weight:700;">${esc(r.organization)}</div>
        <div>${esc(r.full_name)}${r.role_title ? ', ' + esc(r.role_title) : ''}</div>
      </td>
      <td style="vertical-align:top;">
        <div style="font-size:10px;font-weight:700;color:#6b7a96;letter-spacing:.08em;margin-bottom:6px;">QUOTE DETAILS</div>
        <div><span style="color:#6b7a96;">Quote no.</span> <strong>${esc(r.quote_no || '—')}</strong></div>
        <div><span style="color:#6b7a96;">Date</span> ${longDate(r.quote_prepared_at)}</div>
        <div><span style="color:#6b7a96;">Valid until</span> ${longDate(r.quote_valid_until)}</div>
        <div><span style="color:#6b7a96;">Prepared by</span> Eric Kleinsorge</div>
      </td>
    </tr>
  </table>

  ${para(r.quote_intro)}

  <div style="font-size:10px;font-weight:700;color:#6b7a96;letter-spacing:.08em;margin:24px 0 8px;">WHAT IS BEING QUOTED</div>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <tr>
      <th style="text-align:left;padding:0 0 8px;font-size:10px;color:#6b7a96;letter-spacing:.06em;border-bottom:2px solid #0d1220;">ITEM</th>
      <th style="text-align:center;padding:0 0 8px;font-size:10px;color:#6b7a96;letter-spacing:.06em;border-bottom:2px solid #0d1220;">QTY</th>
      <th style="text-align:right;padding:0 0 8px;font-size:10px;color:#6b7a96;letter-spacing:.06em;border-bottom:2px solid #0d1220;">AMOUNT</th>
    </tr>
    ${row('EconSquad AI — Pro Squad, annual subscription<br><span style="font-size:11px;color:#6b7a96;">per named user, ' + money(unit) + ' each</span>', String(seats), money(total))}
    ${free > 0 ? row('Additional seat — included at no charge', String(free), money(0), true) : ''}
    ${row('Onboarding session for the team (60 minutes, remote)', '1', 'Included', true)}
    <tr>
      <td style="padding:14px 0 0;font-weight:800;">TOTAL — 12 months</td>
      <td></td>
      <td style="padding:14px 0 0;text-align:right;font-weight:800;font-size:17px;white-space:nowrap;">${money(total)}</td>
    </tr>
  </table>
  <div style="font-size:12px;color:#6b7a96;margin-top:8px;">
    ${seats + free} named user${seats + free === 1 ? '' : 's'}. One invoice. One renewal date.
  </div>

  <div style="font-size:10px;font-weight:700;color:#6b7a96;letter-spacing:.08em;margin:28px 0 8px;">WHAT EACH SEAT INCLUDES</div>
  <ul style="margin:0;padding-left:20px;font-size:13px;">
    <li style="margin-bottom:5px;">All 22 EconSquad specialists — grants, RFI and RFP responses, site scoring, BRE, economic impact, workforce, incentives, tax credits, press and board reporting.</li>
    <li style="margin-bottom:5px;">ARIA, the assistant that routes work to the right specialist and prepares a morning briefing.</li>
    <li style="margin-bottom:5px;">Gmail, Google Calendar and Tasks integration.</li>
    <li style="margin-bottom:5px;">Output that pastes cleanly into Word and Google Docs, with formatting intact.</li>
    <li style="margin-bottom:5px;">Priority support, direct to Eric.</li>
    <li style="margin-bottom:5px;">Seats are held by the organisation, not the individual — reassign one to a new hire at any time, at no cost and with no change to the invoice.</li>
  </ul>

  <div style="font-size:10px;font-weight:700;color:#6b7a96;letter-spacing:.08em;margin:28px 0 8px;">TERMS</div>
  <div style="font-size:13px;">${para(r.quote_terms)}</div>

  <div style="margin:28px 0 0;padding:16px 20px;background:#f4f6fa;border-left:3px solid #aaff3e;font-size:13px;">
    <strong>To accept:</strong> sign and return the attached PDF, reply to this email, or
    issue a purchase order referencing ${esc(r.quote_no || 'this quote')}. We will invoice on receipt.
    <div style="margin-top:8px;color:#6b7a96;font-size:12px;">
      The attached copy has a signature block you can fill in on screen or print and sign by hand.
    </div>
  </div>

  <p style="margin-top:24px;font-size:13px;">Eric Kleinsorge<br>
  <span style="color:#6b7a96;">EconSquad AI &middot; Global Site Location Industries, LLC &middot; econsquad.ai</span></p>

  <p style="margin-top:22px;font-size:11px;color:#8a94a8;border-top:1px solid #e6eaf2;padding-top:12px;">
    We will never ask you for a card number, bank details or a password by email.
    Payment is by invoice, or by a secure link you request from us directly.
  </p>
</div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
    // ── Who is calling ───────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') || '';
    const asCaller = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userRes } = await asCaller.auth.getUser();
    const caller = userRes?.user;
    if (!caller?.email) return json({ ok: false, error: 'not_signed_in' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: adminRow } = await admin
      .from('admins').select('email').ilike('email', caller.email).maybeSingle();
    if (!adminRow) {
      console.warn('send-quote: not an admin:', caller.email);
      return json({ ok: false, error: 'not_admin' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) return json({ ok: false, error: 'Missing quote id' }, 400);

    // ── Everything comes from the row, nothing from the request ──────
    const { data: r, error } = await admin
      .from('quote_requests').select('*').eq('id', id).maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 500);
    if (!r) return json({ ok: false, error: 'That quote request no longer exists.' }, 404);

    if (!r.quote_no || !r.quote_seats || r.quote_unit_price == null) {
      return json({ ok: false, error: 'Prepare the quote first — it needs a quote number, a seat count and a price.' }, 400);
    }

    const to = String(r.quote_sent_to || r.email).trim();
    if (!/^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(to)) {
      return json({ ok: false, error: 'That recipient address does not look right.' }, 400);
    }

    const html = renderQuote(r as QuoteRow);

    /* ── The signable PDF ────────────────────────────────────────────
       Eric: "I would also like to send a PDF of the quote for them to print and
       turn in or ability to sign."

       Built from the SAME ROW, in the same pass as the email above. It is a
       second presentation of one set of figures, not a second drawing of the
       document - which is exactly the distinction that made the old
       browser-side print view worth deleting.

       Wrapped, and failure is not fatal: a quote that arrives without its
       attachment is recoverable, a quote that never sends because a PDF library
       hiccupped is a customer left waiting. The error is recorded so it is
       visible rather than silent. */
    let pdfBase64: string | null = null;
    let pdf_error: string | null = null;
    try {
      const bytes = await buildQuotePdf(r, logoBytes());
      // No spread. The previous version pushed 32,768 elements into a single
      // call, which V8 permits when there is stack to spare and refuses when
      // there is not - fine in Node, RangeError in an edge function. A plain
      // loop is safe at any length and the document is only tens of kilobytes.
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      pdfBase64 = btoa(bin);
      console.log(`send-quote: PDF built, ${bytes.length} bytes`);
    } catch (e) {
      // Name and message both: "Maximum call stack size exceeded" without
      // "RangeError" in front of it sends you looking in the wrong place.
      pdf_error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      console.error('send-quote: PDF build failed:', pdf_error,
                    e instanceof Error ? e.stack : '');
    }

    const pdfName = `EconSquad-Quote-${String(r.quote_no || 'quote').replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`;

    /* ── Preview: render and stop ────────────────────────────────────
       Returns the very bytes that would be emailed. Nothing is sent, and
       NOTHING IS WRITTEN - quote_sent_at in particular, since that is what the
       status trigger watches, and previewing a quote must not mark it as
       having been quoted.

       The admin check above has already run, so a preview is exactly as
       restricted as a send. It has to be: the rendered quote contains the
       prospect's name, employer and the price being offered them. */
    if (body.preview === true) {
      console.log(`send-quote: preview of ${r.quote_no} by ${caller.email}`);
      // The PDF goes back with it, so Eric can open the very attachment the
      // customer will get rather than take its existence on trust.
      return json({ ok: true, preview: true, html, to,
                    pdf: pdfBase64, pdf_name: pdfName, pdf_error });
    }

    let sent_at: string | null = null;
    let send_error: string | null = null;
    try {
      if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [to],
          bcc: [BCC],          // Eric holds a copy of exactly what was received
          reply_to: REPLY_TO,
          subject: `EconSquad AI — Team plan quote ${r.quote_no} for ${r.organization}`,
          html,
          // A public buyer needs a file to sign and attach to a requisition.
          // Omitted rather than faked if the build failed above.
          ...(pdfBase64 ? { attachments: [{ filename: pdfName, content: pdfBase64 }] } : {}),
        }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
      sent_at = new Date().toISOString();
    } catch (e) {
      send_error = e instanceof Error ? e.message : String(e);
      console.error('send-quote: send failed:', send_error);
    }

    // quote_sent_at is what the status trigger watches, so it is only written
    // when the send actually succeeded.
    // A quote that went out without its attachment is worth being able to see,
    // because the email tells the customer a PDF is attached.
    const noteErr = [send_error, pdf_error && `PDF not attached: ${pdf_error}`]
      .filter(Boolean).join(' | ') || null;
    await admin.from('quote_requests').update(
      sent_at
        ? { quote_sent_at: sent_at, quote_sent_to: to, quote_send_error: noteErr }
        : { quote_send_error: noteErr },
    ).eq('id', id);

    if (!sent_at) return json({ ok: false, error: 'The quote could not be sent: ' + send_error }, 502);

    console.log(`send-quote: ${r.quote_no} to ${to}, by ${caller.email}`);
    return json({ ok: true, sent_at, to });
  } catch (e) {
    console.error('send-quote threw:', e instanceof Error ? e.message : String(e));
    return json({ ok: false, error: 'Something went wrong sending that.' }, 500);
  }
});
