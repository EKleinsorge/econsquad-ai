// ============================================================
// Supabase Edge Function: unsubscribe
// Called when a subscriber clicks the unsubscribe link
// URL: /functions/v1/unsubscribe?t=<unsubscribe_token>
// Redirects to /unsubscribe.html?status=ok|error
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL     = 'https://econsquad.ai';
const supa         = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (req: Request) => {
  const url   = new URL(req.url);
  const token = url.searchParams.get('t');

  if (!token) {
    return Response.redirect(`${SITE_URL}/unsubscribe.html?status=error`, 302);
  }

  try {
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
