// ============================================================
// Supabase Edge Function: unsubscribe
// Called when a subscriber clicks the unsubscribe link
// URL: /functions/v1/unsubscribe?t=<unsubscribe_token>
// Redirects to /unsubscribe.html?status=ok|error
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SERVICE_ROLE_KEY')!;
const SITE_URL     = 'https://econsquad.ai';
const supa         = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (req: Request) => {
  const url   = new URL(req.url);
  const token = url.searchParams.get('t');

  if (!token) {
    return Response.redirect(`${SITE_URL}/unsubscribe.html?status=error`, 302);
  }

  try {
    // Greetings carry ?k=greetings and a token from profiles.greetings_token.
    // Opting out of seasonal notes must NOT unsubscribe anyone from the Monday
    // Drop, and it must never touch anything transactional - receipts, resets
    // and alerts are not marketing and are not opt-out-able from a card.
    // Trial-care mail is its own consent again: somebody who does not want
    // coaching about their trial may still want a Christmas card, and must keep
    // receiving receipts either way. Same token, different flag.
    if (url.searchParams.get('k') === 'lifecycle') {
      const { data: l, error: lErr } = await supa
        .from('profiles')
        .update({ lifecycle_opt_out: true })
        .eq('greetings_token', token)
        .eq('lifecycle_opt_out', false)
        .select('email')
        .single();

      if (lErr || !l) {
        return Response.redirect(`${SITE_URL}/unsubscribe.html?status=already`, 302);
      }
      console.log(`Lifecycle opt-out: ${l.email}`);
      return Response.redirect(`${SITE_URL}/unsubscribe.html?status=ok`, 302);
    }

    if (url.searchParams.get('k') === 'greetings') {
      const { data: g, error: gErr } = await supa
        .from('profiles')
        .update({ greetings_opt_out: true })
        .eq('greetings_token', token)
        .eq('greetings_opt_out', false)   // only once
        .select('email')
        .single();

      if (gErr || !g) {
        return Response.redirect(`${SITE_URL}/unsubscribe.html?status=already`, 302);
      }
      console.log(`Greetings opt-out: ${g.email}`);
      return Response.redirect(`${SITE_URL}/unsubscribe.html?status=ok`, 302);
    }

    const { data, error } = await supa
      .from('monday_drop_subscribers')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('unsubscribe_token', token)
      .is('unsubscribed_at', null)   // only unsubscribe once
      .select('email')
      .single();

    if (error || !data) {
      // Already unsubscribed or token not found — still show success
      return Response.redirect(`${SITE_URL}/unsubscribe.html?status=already`, 302);
    }

    console.log(`Unsubscribed: ${data.email}`);
    return Response.redirect(`${SITE_URL}/unsubscribe.html?status=ok`, 302);

  } catch (e) {
    console.error('unsubscribe error:', e);
    return Response.redirect(`${SITE_URL}/unsubscribe.html?status=error`, 302);
  }
});
