// supabase/functions/org-invite/index.ts
//
// ═══════════════════════════════════════════════════════════════════════
//  INVITES SOMEBODY ONTO A TEAM'S SEATS
// ═══════════════════════════════════════════════════════════════════════
//
// Called by a customer, not by an admin. So the check is different from
// send-quote: the caller's JWT is verified, and then their SEAT is looked up.
// Holding an EconSquad account is not permission to add people to a team; a
// live, unrevoked membership of THAT organisation carrying can_manage_seats is.
//
// ⚠️ THIS FUNCTION HOLDS THE SERVICE ROLE, WHICH MEANS THE DATABASE TRIGGER
//    THAT NORMALLY STOPS PRIVILEGE ESCALATION IS NOT WATCHING IT.
//
// esq_org_guard_privileges() steps aside when there is no session, because that
// is how provisioning and support have to work. This function has no session in
// the database's eyes. So the rule "only the owner decides what somebody may
// do" has to be re-stated HERE, in code, or an ordinary seat manager could post
// can_manage_seats:true in the body and hand themselves a deputy.
//
// Save first, email second - the same order as request-quote. A Resend outage
// should leave a pending invitation somebody can resend, not a silent nothing.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';
const FROM_EMAIL     = 'EconSquad AI <eric@econsquad.ai>';
const REPLY_TO       = 'eric@econsquad.ai';
const SITE           = 'https://econsquad.ai';

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

// Control characters stripped, length capped. A name goes into an email
// subject line and a database row; neither wants a stray newline.
export function clean(v: unknown, max: number): string {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

export function validEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(s);
}

/* ── ⚠️ Does that domain actually exist ────────────────────────────────
   A mistyped address is a SILENT failure and always has been: the row saves,
   the panel says INVITED, a seat is held, the mail provider accepts it, and
   nobody ever finds out. Eric lost a test to exactly this - one extra letter
   in the domain, gslobaltrademag.com instead of globaltrademag.com, which does
   not resolve at all.

   A spelling mistake is catchable at the only moment anybody can fix it: while
   they are still looking at the box they typed it into.

   Returns true / false / null, and NULL MEANS "could not tell". Fails open on
   purpose: DNS being slow, or the runtime not offering resolveDns at all, must
   never stop a real invitation going out. This only refuses when the answer
   comes back clearly and says the domain is not there. */
export async function domainResolves(email: string): Promise<boolean | null> {
  const domain = (email.split('@')[1] || '').trim().toLowerCase();
  if (!domain) return false;

  const dns = (Deno as unknown as {
    resolveDns?: (q: string, t: string, o?: unknown) => Promise<unknown[]>;
  }).resolveDns;
  if (typeof dns !== 'function') return null;

  const look = (async (): Promise<boolean> => {
    // MX first, because that is what actually carries the mail. A record as a
    // fallback: plenty of small domains still accept mail without an MX.
    try { const mx = await dns(domain, 'MX'); if (mx && mx.length) return true; } catch { /* keep going */ }
    try { const a  = await dns(domain, 'A');  if (a  && a.length)  return true; } catch { /* keep going */ }
    return false;
  })();

  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
  try {
    return await Promise.race([look, timeout]);
  } catch {
    return null;
  }
}

/* ── The invitation itself ──────────────────────────────────────────────
   Deliberately plain. It is going to a colleague who was told to expect it,
   often through a public-sector mail filter that dislikes heavy markup, and
   the only thing it has to do is carry one link that works. */
export function inviteEmail(o: {
  orgName: string; inviterName: string; firstName: string;
  link: string; canProfile: boolean; canSeats: boolean; expires: string;
  isOwner?: boolean;
}): string {
  const extras: string[] = [];
  if (o.isOwner) extras.push('run the account: add and remove people, and set what each of them may change');
  else {
    if (o.canProfile) extras.push('edit the shared organization profile');
    if (o.canSeats)   extras.push('invite and remove team members');
  }
  const extraLine = extras.length
    ? `<p style="margin:0 0 14px;">You have also been given permission to ${esc(extras.join(' and '))}.</p>`
    : '';

  return `<!doctype html><html><body style="margin:0;background:#f4f6fa;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px 34px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16202e;">
  <tr><td>
    <div style="font-size:12px;letter-spacing:.10em;text-transform:uppercase;color:#5a6a80;margin-bottom:6px;">EconSquad AI</div>
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;">${esc(o.firstName || 'Hello')}, you have a seat at ${esc(o.orgName)}</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">${esc(o.inviterName)} has added you to ${esc(o.orgName)} on EconSquad AI &mdash; 22 AI specialists built for economic development work.</p>
    ${extraLine}
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">Set your own password and you are in. It takes about a minute.</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:9px;background:#12212f;">
      <a href="${esc(o.link)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#aaff3e;text-decoration:none;">Accept and set my password</a>
    </td></tr></table>
    <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#5a6a80;">This link is yours alone and expires on ${esc(o.expires)}. Nobody at EconSquad or at ${esc(o.orgName)} can see the password you choose &mdash; not even the person who invited you.</p>
    <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#5a6a80;">If you were not expecting this, ignore it and no account is created. Questions: just reply.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
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
    if (!caller?.id) return json({ ok: false, error: 'not_signed_in' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const orgId = Number(body.org_id);
    if (!Number.isFinite(orgId) || orgId <= 0) return json({ ok: false, error: 'Missing team.' }, 400);

    // ── Is this person allowed to add people to THIS team ────────────
    // Two ways in, and they are not the same thing.
    //
    // A SITE ADMIN (public.admins - Eric) can invite on any team. That is not
    // a convenience: provisioning a paid quote has to send the buyer their
    // owner's invitation, and at that moment nobody holds a seat on that team
    // at all, so there is no seat-based permission to check.
    //
    // A CUSTOMER needs a live, unrevoked seat on THAT team carrying
    // can_manage_seats. Holding an EconSquad account is not permission to add
    // people to somebody's team.
    const { data: siteAdmin } = caller.email
      ? await admin.from('admins').select('email').ilike('email', caller.email).maybeSingle()
      : { data: null };
    const isSiteAdmin = !!siteAdmin;

    const { data: me } = await admin
      .from('esq_org_members')
      .select('role, can_manage_seats')
      .eq('org_id', orgId).eq('user_id', caller.id).is('revoked_at', null)
      .maybeSingle();

    const isOwner = me?.role === 'owner';
    if (!isSiteAdmin && (!me || !(isOwner || me.can_manage_seats))) {
      console.warn('org-invite: refused, no seat permission on org', orgId);
      return json({ ok: false, error: 'You do not have permission to manage this team.' }, 403);
    }
    // Who may hand out powers: the owner, or us.
    const mayGrant = isOwner || isSiteAdmin;

    const { data: org } = await admin
      .from('esq_organizations').select('id, name, status, seats_paid, seats_free')
      .eq('id', orgId).maybeSingle();
    if (!org) return json({ ok: false, error: 'That team no longer exists.' }, 404);
    if (org.status !== 'active') {
      return json({ ok: false, error: 'That team is not active. Get in touch and we will sort it out.' }, 400);
    }

    // ── Resending an existing invitation ─────────────────────────────
    // A separate path on purpose. Resend must not create a second row, or the
    // second one silently eats another seat.
    const resendId = Number(body.resend_id);
    let inv: Record<string, unknown> | null = null;

    if (Number.isFinite(resendId) && resendId > 0) {
      const { data: existing } = await admin
        .from('esq_org_invites').select('*')
        .eq('id', resendId).eq('org_id', orgId)
        .is('accepted_at', null).is('revoked_at', null)
        .maybeSingle();
      if (!existing) return json({ ok: false, error: 'That invitation is no longer pending.' }, 404);

      // Push the clock forward, or a resend of a nearly-expired invite hands
      // somebody a link that dies tomorrow.
      const { data: bumped } = await admin
        .from('esq_org_invites')
        .update({ expires_at: new Date(Date.now() + 14 * 864e5).toISOString() })
        .eq('id', resendId).select('*').maybeSingle();
      inv = bumped ?? existing;

    } else {
      const email = clean(body.email, 200).toLowerCase();
      const first = clean(body.first_name, 80);
      const last  = clean(body.last_name, 80);
      if (!validEmail(email)) return json({ ok: false, error: 'That email address does not look right.' }, 400);

      // Caught here rather than discovered a week later when nobody turns up.
      const domain = email.split('@')[1] || '';
      const resolves = await domainResolves(email);
      if (resolves === false) {
        console.warn('org-invite: refusing, domain does not resolve:', domain);
        return json({
          ok: false,
          error: 'There is no mail server for "' + domain + '". Check the spelling — nothing was sent and no seat was used.',
        }, 400);
      }

      // ⚠️ THE ESCALATION RULE, RE-STATED. The database trigger is not
      // watching the service role, so it is enforced here instead: only the
      // owner (or us) may hand out permissions, whatever the body asks for.
      const canProfile = mayGrant ? body.can_edit_profile === true : false;
      const canSeats   = mayGrant ? body.can_manage_seats === true : false;
      if (!mayGrant && (body.can_edit_profile === true || body.can_manage_seats === true)) {
        console.warn('org-invite: non-owner tried to grant permissions on org', orgId);
        return json({ ok: false, error: 'Only the team owner can give somebody extra permissions.' }, 403);
      }

      // ⚠️ THE OWNER'S CHAIR IS OURS TO HAND OUT, NOBODY ELSE'S.
      // Only provisioning seats an owner, and provisioning is us. A customer
      // asking for role:'owner' - even the current owner - gets 'member',
      // because a second owner is a support conversation, not a feature.
      let role = 'member';
      if (isSiteAdmin && (body.role === 'owner' || body.role === 'admin')) {
        role = String(body.role);
      }

      // Already holding a seat? Then this is not an invitation.
      const { data: dupe } = await admin
        .from('esq_org_members').select('id, user_id')
        .eq('org_id', orgId).is('revoked_at', null);
      if (dupe && dupe.length) {
        const ids = dupe.map((d: { user_id: string }) => d.user_id);
        const { data: prof } = await admin
          .from('profiles').select('id, email').in('id', ids).ilike('email', email);
        if (prof && prof.length) {
          return json({ ok: false, error: 'That person already holds a seat on this team.' }, 409);
        }
      }

      const { data: created, error: insErr } = await admin
        .from('esq_org_invites')
        .insert({
          org_id: orgId, email, first_name: first || null, last_name: last || null,
          role, can_edit_profile: canProfile, can_manage_seats: canSeats,
          invited_by: caller.id,
        })
        .select('*').maybeSingle();

      if (insErr) {
        const m = String(insErr.message || '');
        // Both of these are the database saying no for a good reason, and both
        // deserve a sentence a person can act on rather than a raw SQLSTATE.
        if (/esq_org_invites_live_idx/.test(m)) {
          return json({ ok: false, error: 'There is already an invitation waiting for that address. Resend it instead.' }, 409);
        }
        if (/seats\./.test(m) || /check_violation/.test(m) || /of \d+ seats/.test(m)) {
          return json({ ok: false, error: 'Every seat on the plan is taken. Remove somebody first, or add seats.' }, 409);
        }
        console.error('org-invite: insert failed:', m);
        return json({ ok: false, error: 'That invitation could not be saved.' }, 500);
      }
      inv = created;
    }

    if (!inv) return json({ ok: false, error: 'That invitation could not be saved.' }, 500);

    // ── Then the email ───────────────────────────────────────────────
    const inviterName =
      clean((caller.user_metadata as Record<string, unknown> | undefined)?.full_name, 120) ||
      clean(caller.email, 120) || 'A colleague';

    const expires = new Date(String(inv.expires_at)).toLocaleDateString('en-US',
      { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });

    // ⚠️ The token is the credential. It goes in the link and nowhere else -
    // not into a log line, not into an error message, not into the response.
    const link = `${SITE}/#invite=${encodeURIComponent(String(inv.token))}`;

    let send_error = '';
    if (!RESEND_API_KEY) {
      send_error = 'No RESEND_API_KEY configured.';
    } else {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [String(inv.email)],
          reply_to: REPLY_TO,
          // ⚠️ No possessive and no trailing "team". "GSLI Test Team's team"
          // is what the first version produced, because the wording assumed
          // the organisation was not already called one.
          subject: `Your EconSquad AI seat at ${org.name}`,
          html: inviteEmail({
            orgName: String(org.name),
            inviterName,
            firstName: String(inv.first_name ?? ''),
            link,
            canProfile: inv.can_edit_profile === true,
            canSeats: inv.can_manage_seats === true,
            isOwner: inv.role === 'owner',
            expires,
          }),
        }),
      });
      if (!res.ok) {
        send_error = `Resend returned ${res.status}`;
        console.error('org-invite: send failed:', send_error, await res.text().catch(() => ''));
      }
    }

    // The row exists either way. Say plainly which happened, because "invited"
    // and "invited but the email bounced off our provider" are different facts
    // and the person waiting on the link cannot tell them apart.
    return json({
      ok: true,
      id: inv.id,
      email: inv.email,
      emailed: !send_error,
      send_error: send_error || undefined,
    });

  } catch (e) {
    console.error('org-invite: unhandled:', e instanceof Error ? e.message : String(e));
    return json({ ok: false, error: 'Something went wrong sending that invitation.' }, 500);
  }
});
