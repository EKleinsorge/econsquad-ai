// supabase/functions/org-accept/index.ts
//
// ═══════════════════════════════════════════════════════════════════════
//  ACCEPTS A TEAM INVITATION AND SETS THE PERSON'S OWN PASSWORD
// ═══════════════════════════════════════════════════════════════════════
//
// ⚠️ THE PERSON WHO INVITED THEM NEVER SEES OR SETS THIS PASSWORD.
//
// Eric's requirement was "emails the new team member an email inviting them to
// their new account to set up their password". Not: the office manager types a
// password and reads it out. The distinction matters because these are public
// bodies - a shared or manager-chosen password is a credential the employer
// holds, and it survives the person leaving.
//
// So the password arrives here directly from the new person's own browser,
// over TLS, is passed straight to Supabase's user creation, and is never
// logged, never echoed back, never stored anywhere in our schema. Nothing in
// this file may ever print it, including in an error path.
//
// ⚠️ THE SEAT IS GRANTED BY A DATABASE FUNCTION, NOT BY TWO CALLS FROM HERE.
// A pending invitation holds a seat, so releasing the invitation and taking
// the seat have to happen together or the cap counts one person twice. See
// esq_org_accept_invite - it is one transaction, and the seat cap rolling it
// back leaves the link still usable.
//
// Three ways in, and they are genuinely different situations:
//   peek        the page asking "whose invitation is this, and is it still good"
//   signed in   they already have an EconSquad account; no password involved
//   new person  they set a password and an account is created

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

/* A password rule that refuses the things that actually get people compromised
   rather than one that demands a symbol and gets "Password1!". Length does the
   work; the rest just stops the obvious. */
export function passwordProblem(pw: string, email: string): string {
  if (pw.length < 10) return 'Please use at least 10 characters.';
  if (pw.length > 200) return 'That password is too long.';
  if (/^\s|\s$/.test(pw)) return 'Please remove the space at the start or end.';
  const local = (email.split('@')[0] || '').toLowerCase();
  if (local.length > 3 && pw.toLowerCase().includes(local)) {
    return 'Please choose something that is not part of your email address.';
  }
  if (/^(password|welcome|letmein|qwerty|econsquad)/i.test(pw)) {
    return 'Please choose something harder to guess.';
  }
  return '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const token = clean(body.token, 100);
    if (!token) return json({ ok: false, error: 'not_valid' }, 400);

    // ── The invitation, read server-side. The browser is told nothing it
    //    did not already have in its inbox. ─────────────────────────────
    const { data: inv } = await admin
      .from('esq_org_invites')
      .select('id, org_id, email, first_name, last_name, expires_at, accepted_at, revoked_at')
      .eq('token', token)
      .maybeSingle();

    const live = !!inv && !inv.accepted_at && !inv.revoked_at &&
                 new Date(String(inv.expires_at)).getTime() > Date.now();

    if (!live) {
      // One answer for expired, revoked, used and never-existed. A link that
      // says which is a link that can be probed.
      return json({ ok: false, error: 'not_valid' }, 404);
    }

    const { data: org } = await admin
      .from('esq_organizations').select('id, name, status').eq('id', inv!.org_id).maybeSingle();
    if (!org || org.status !== 'active') return json({ ok: false, error: 'not_valid' }, 404);

    const email = String(inv!.email).toLowerCase();

    // Does an account already exist for this address? profiles mirrors the
    // auth table and is the cheaper of the two to ask.
    const { data: existingProfile } = await admin
      .from('profiles').select('id').ilike('email', email).maybeSingle();

    // ── peek: what the accept page renders before anyone types ────────
    if (body.peek === true) {
      return json({
        ok: true,
        org_name: org.name,
        email,
        first_name: inv!.first_name ?? '',
        has_account: !!existingProfile,
      });
    }

    // ── Who, if anyone, is already signed in ──────────────────────────
    const authHeader = req.headers.get('Authorization') || '';
    const asCaller = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userRes } = await asCaller.auth.getUser();
    const signedIn = userRes?.user ?? null;

    let userId: string;

    if (signedIn?.id) {
      // ── Already has an account and is signed in ─────────────────────
      // The invitation belongs to an address, not to whoever holds the link.
      if (String(signedIn.email ?? '').toLowerCase() !== email) {
        return json({
          ok: false,
          error: 'wrong_account',
          invited: email,
          signed_in_as: signedIn.email,
        }, 409);
      }
      userId = signedIn.id;

    } else if (existingProfile) {
      // ── Has an account but is not signed in ─────────────────────────
      // We will not set a password for an account that already exists. That
      // would be an account takeover with extra steps, for anyone who got hold
      // of a forwarded invitation.
      return json({ ok: false, error: 'have_account', email }, 409);

    } else {
      // ── New person, setting their own password ──────────────────────
      const password = String(body.password ?? '');
      const problem = passwordProblem(password, email);
      if (problem) return json({ ok: false, error: 'weak_password', message: problem }, 400);

      const first = clean(body.first_name, 80) || clean(inv!.first_name, 80);
      const last  = clean(body.last_name, 80)  || clean(inv!.last_name, 80);
      const full  = [first, last].filter(Boolean).join(' ');

      const { data: made, error: mkErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,          // they proved the address by opening the mail
        user_metadata: full ? { full_name: full } : {},
      });

      if (mkErr || !made?.user?.id) {
        // Never let the password near a log line, including this one.
        console.error('org-accept: could not create the account:', mkErr?.message ?? 'no user returned');
        const already = /already|registered|exists/i.test(String(mkErr?.message ?? ''));
        return json(already
          ? { ok: false, error: 'have_account', email }
          : { ok: false, error: 'create_failed' }, already ? 409 : 500);
      }
      userId = made.user.id;
    }

    // ── The seat, granted atomically ──────────────────────────────────
    const { data: result, error: rpcErr } = await admin
      .rpc('esq_org_accept_invite', { p_token: token, p_user: userId, p_email: email });

    if (rpcErr) {
      console.error('org-accept: accept failed:', rpcErr.message);
      return json({ ok: false, error: 'accept_failed' }, 500);
    }
    const r = (result ?? {}) as Record<string, unknown>;
    if (r.ok !== true) {
      return json({ ok: false, error: String(r.error ?? 'not_valid') }, 409);
    }

    console.log(`org-accept: seat granted on org ${r.org_id}`);
    return json({
      ok: true,
      org_id: r.org_id,
      org_name: org.name,
      email,
      already_member: r.already_member === true,
      // Tells the page whether to offer sign-in or to sign them in itself.
      new_account: !signedIn && !existingProfile,
    });

  } catch (e) {
    console.error('org-accept: unhandled:', e instanceof Error ? e.message : String(e));
    return json({ ok: false, error: 'accept_failed' }, 500);
  }
});
