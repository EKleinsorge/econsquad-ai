// supabase/functions/org-provision/index.ts
//
// ═══════════════════════════════════════════════════════════════════════
//  TURNS A PAID QUOTE INTO A TEAM
// ═══════════════════════════════════════════════════════════════════════
//
// Admin-only, checked the same way send-quote checks: the caller's own JWT is
// verified, then their email is looked up in public.admins.
//
// ⚠️ THE BODY CARRIES ONLY A QUOTE id. NOTHING ELSE IS TRUSTED.
//
// The seat count comes from the quote row, never from the request. A team's
// seats are the seats somebody paid for, and that has to be traceable back to
// the priced document they were sent - not to whatever number reached this
// endpoint. Same rule as send-quote, for the same reason.
//
// ⚠️ IT DOES NOT INVITE ANYBODY. Creating the team and emailing the buyer are
// two steps on purpose: if the mail fails, the team still exists and the
// invitation can be sent again, rather than the whole thing having to be
// unpicked. org-invite sends it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Content-Type': 'application/json',
};

export function clean(v: unknown, max: number): string {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

/* The term. A year from the day it is provisioned unless the quote said
   otherwise, because that is what the quote promises and what renewal will be
   measured from. */
export function termDates(from: Date): { start: string; end: string } {
  const start = new Date(from);
  const end = new Date(from);
  end.setFullYear(end.getFullYear() + 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
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
      console.warn('org-provision: not an admin:', caller.email);
      return json({ ok: false, error: 'not_admin' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const quoteId = Number(body.quote_id);
    if (!Number.isFinite(quoteId) || quoteId <= 0) {
      return json({ ok: false, error: 'Missing quote id' }, 400);
    }

    const { data: q, error: qErr } = await admin
      .from('quote_requests').select('*').eq('id', quoteId).maybeSingle();
    if (qErr) return json({ ok: false, error: qErr.message }, 500);
    if (!q) return json({ ok: false, error: 'That quote no longer exists.' }, 404);

    // ── Already done? Say so rather than trying and failing on the index ──
    const { data: existing } = await admin
      .from('esq_organizations').select('id, name, seats_paid, seats_free')
      .eq('quote_request_id', quoteId).maybeSingle();
    if (existing) {
      return json({
        ok: true, already: true, org_id: existing.id, name: existing.name,
        seats_paid: existing.seats_paid, seats_free: existing.seats_free,
        message: 'That quote already has a team.',
      });
    }

    // ── ⚠️ Won or paid, and nothing else ─────────────────────────────
    // "won" is Eric's judgement that they accepted - a signed acceptance or a
    // PO in hand, weeks before a cheque clears. Provisioning on that is
    // deliberate: making a public body wait for their seats until the finance
    // office moves is a bad way to start a year's relationship. But it must be
    // a decision somebody made, not merely a quote that was sent.
    const paid = !!q.paid_at;
    if (!paid && q.status !== 'won') {
      return json({
        ok: false,
        error: 'Mark the quote won or record the payment first. A team is seats somebody has actually bought.',
      }, 400);
    }

    const seats = Number(q.quote_seats ?? 0);
    if (!Number.isFinite(seats) || seats <= 0) {
      return json({ ok: false, error: 'That quote has no seat count. Prepare the quote first.' }, 400);
    }
    const free = Number(q.quote_free_seats ?? 0);

    const name = clean(q.organization, 200) || clean(q.full_name, 200) || 'Team';
    const buyerEmail = clean(q.quote_sent_to || q.email, 200).toLowerCase();
    if (!buyerEmail) return json({ ok: false, error: 'That quote has no buyer address.' }, 400);

    const term = termDates(new Date());

    const { data: org, error: insErr } = await admin
      .from('esq_organizations')
      .insert({
        name,
        quote_request_id: quoteId,
        seats_paid: seats,
        seats_free: free,
        plan_tier: 'pro',
        status: 'active',
        term_start: term.start,
        term_end: term.end,
      })
      .select('*').maybeSingle();

    if (insErr || !org) {
      const m = String(insErr?.message || '');
      // The one-team-per-quote index. Two clicks, or two people, at once.
      if (/one_per_quote/.test(m)) {
        return json({ ok: false, error: 'That quote already has a team. Reload the page.' }, 409);
      }
      console.error('org-provision: insert failed:', m);
      return json({ ok: false, error: 'That team could not be created.' }, 500);
    }

    // ── Is the buyer already with us? ────────────────────────────────
    // If they have an account they get the owner's seat now. If not, they get
    // an invitation like anybody else and choose their own password - the
    // person who bought it is not an exception to that rule.
    const { data: prof } = await admin
      .from('profiles').select('id, email').ilike('email', buyerEmail).maybeSingle();

    let seated = false;
    if (prof?.id) {
      const { error: mErr } = await admin.from('esq_org_members').insert({
        org_id: org.id, user_id: prof.id, role: 'owner',
        can_edit_profile: true, can_manage_seats: true,
      });
      if (mErr) {
        console.error('org-provision: could not seat the owner:', mErr.message);
      } else {
        seated = true;
      }
    }

    console.log(`org-provision: quote ${quoteId} -> org ${org.id}, ${seats}+${free} seats, owner ${seated ? 'seated' : 'to invite'}`);

    return json({
      ok: true,
      org_id: org.id,
      name: org.name,
      seats_paid: org.seats_paid,
      seats_free: org.seats_free,
      term_start: org.term_start,
      term_end: org.term_end,
      buyer_email: buyerEmail,
      buyer_name: clean(q.full_name, 120),
      owner_seated: seated,
      // What the admin page should do next: seat taken, or invitation to send.
      next: seated ? 'done' : 'invite_owner',
    });

  } catch (e) {
    console.error('org-provision: unhandled:', e instanceof Error ? e.message : String(e));
    return json({ ok: false, error: 'Something went wrong creating that team.' }, 500);
  }
});
