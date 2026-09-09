// supabase/functions/create-quote-invoice/index.ts
//
// ═══════════════════════════════════════════════════════════════════════
//  A STRIPE INVOICE FOR A TEAM QUOTE
// ═══════════════════════════════════════════════════════════════════════
//
// Creates a draft invoice, adds one line item from the quote, finalises it, and
// hands back the hosted payment page. Card and ACH both enabled so the buyer
// picks - a $4,950 card payment costs roughly $145 in fees and a bank payment
// costs a few dollars, and the only way to collect that saving is to offer both
// rather than to choose for them.
//
// ⚠️ IT DOES NOT EMAIL ANYBODY AND IT DOES NOT CHARGE ANYBODY.
// Finalising makes the invoice payable; sending it is a separate decision Eric
// makes, with the link, in his own words. Nothing here moves money.
//
// ⚠️ THIS ACCOUNT CARRIES A SECOND BUSINESS.
// Two guards follow from that, and neither is optional:
//
//   1. pending_invoice_items_behavior: 'exclude'. By default Stripe sweeps every
//      pending invoice item for a customer onto a new invoice. On a shared
//      account that is how somebody else's unbilled line lands on an EconSquad
//      quote. This invoice contains exactly what this function put on it.
//
//   2. metadata.esq_quote_id. The webhook matches Team invoices on THIS, never
//      on price. PRICE_TO_PLAN drives plan and plan_tier on an individual's
//      profile; a Team purchase belongs to an organisation, and filing it as one
//      person's subscription tier would corrupt the Revenue page silently.
//      There is already a scar from resolvePlan guessing a tier from an amount.
//
// ⚠️ USE A RESTRICTED KEY. Scoped to Invoices (write) and Customers (write),
// nothing else. Never sk_live_ in an edge function - the same rule the billing
// portal note lays down. Set STRIPE_QUOTE_KEY in Supabase secrets by hand.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_KEY   = Deno.env.get('STRIPE_QUOTE_KEY') ?? Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Content-Type': 'application/json',
};

/* Stripe's API is form-encoded, including nested keys like
   payment_settings[payment_method_types][0]. Built by hand rather than pulling
   in the SDK: three calls, and one less remote module to end up with two
   copies of. */
function form(obj: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') p.append(k, String(v));
  }
  return p.toString();
}

async function stripe(path: string, body?: Record<string, string | number | undefined | null>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? form(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message ?? `Stripe ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
    if (!STRIPE_KEY) {
      return json({ ok: false, error: 'STRIPE_QUOTE_KEY is not set in Supabase secrets.' }, 500);
    }

    // ── Admin only, same check as send-quote ─────────────────────────
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
      console.warn('create-quote-invoice: not an admin:', caller.email);
      return json({ ok: false, error: 'not_admin' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) return json({ ok: false, error: 'Missing quote id' }, 400);

    // Everything comes from the row. Same rule as send-quote: the browser says
    // which quote, never what it costs.
    const { data: r, error } = await admin
      .from('quote_requests').select('*').eq('id', id).maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 500);
    if (!r) return json({ ok: false, error: 'That quote request no longer exists.' }, 404);

    if (!r.quote_no || !r.quote_seats || r.quote_unit_price == null) {
      return json({ ok: false, error: 'Prepare the quote first - it needs a number, a seat count and a price.' }, 400);
    }
    if (r.paid_at) {
      return json({ ok: false, error: 'This quote is already marked paid. Nothing to invoice.' }, 400);
    }
    if (r.stripe_invoice_id) {
      // Never a second invoice for one quote by accident: two live invoices for
      // the same $4,950 is a customer paying twice.
      return json({
        ok: true, already: true,
        invoice_id: r.stripe_invoice_id, url: r.stripe_invoice_url,
        status: r.stripe_invoice_status,
      });
    }

    const total = Number(r.quote_total ?? 0);
    if (!(total > 0)) return json({ ok: false, error: 'That quote totals zero - nothing to invoice.' }, 400);

    const to = String(r.quote_sent_to || r.email).trim();

    // ── The customer ─────────────────────────────────────────────────
    // Reuse the one we made for this quote if the call is being retried, and
    // otherwise search by email so a repeat buyer is not duplicated.
    let customerId = r.stripe_customer_id as string | null;
    if (!customerId) {
      const found = await stripe(`customers/search?query=${encodeURIComponent(`email:'${to}'`)}&limit=1`);
      customerId = found?.data?.[0]?.id ?? null;
    }
    if (!customerId) {
      const c = await stripe('customers', {
        email: to,
        name: r.organization,
        description: `EconSquad Team plan - ${r.organization}`,
        'metadata[esq_quote_id]': String(r.id),
      });
      customerId = c.id;
    }

    // ── The invoice ──────────────────────────────────────────────────
    const inv = await stripe('invoices', {
      customer: customerId!,
      collection_method: 'send_invoice',
      days_until_due: 30,                       // matches the net 30 on the quote
      // See the header. Without this a pending item belonging to the other
      // business on this account could ride along on an EconSquad invoice.
      pending_invoice_items_behavior: 'exclude',
      auto_advance: false,                      // no automatic emailing or dunning
      description: `EconSquad AI - Team plan, 12 months (${r.quote_no})`,
      footer: 'Thank you. Questions: eric@econsquad.ai',
      'payment_settings[payment_method_types][0]': 'card',
      'payment_settings[payment_method_types][1]': 'us_bank_account',
      'metadata[esq_quote_id]': String(r.id),
      'metadata[esq_quote_no]': String(r.quote_no),
      'metadata[esq_kind]': 'team_quote',
    });

    const seats = Number(r.quote_seats);
    const free  = Number(r.quote_free_seats ?? 0);
    await stripe('invoiceitems', {
      customer: customerId!,
      invoice: inv.id,
      // Cents, from the generated total - the same number on the PDF.
      amount: Math.round(total * 100),
      currency: 'usd',
      description: `EconSquad AI Pro Squad, annual subscription - ${seats} named user${seats === 1 ? '' : 's'}`
        + (free > 0 ? ` plus ${free} at no charge` : '')
        + ` (quote ${r.quote_no})`,
      'metadata[esq_quote_id]': String(r.id),
    });

    // Finalising makes it payable and produces the hosted page. It does NOT
    // email the customer - auto_advance is off and no send call is made.
    const finalised = await stripe(`invoices/${inv.id}/finalize`, { auto_advance: 'false' });

    await admin.from('quote_requests').update({
      stripe_invoice_id: finalised.id,
      stripe_invoice_url: finalised.hosted_invoice_url,
      stripe_invoice_status: finalised.status,
      stripe_customer_id: customerId,
    }).eq('id', id);

    console.log(`create-quote-invoice: ${r.quote_no} -> ${finalised.id} (${finalised.status}) by ${caller.email}`);
    return json({
      ok: true,
      invoice_id: finalised.id,
      url: finalised.hosted_invoice_url,
      pdf: finalised.invoice_pdf,
      status: finalised.status,
      amount: total,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('create-quote-invoice:', msg);
    return json({ ok: false, error: msg }, 500);
  }
});
