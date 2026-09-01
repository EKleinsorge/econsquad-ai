// supabase/functions/google-token/index.ts
//
// Exchanges the stored Google refresh token for a fresh access token.
//
// WHY THIS EXISTS
//
// Supabase puts `provider_token` on the session at sign-in and never refreshes
// it. Google access tokens last about an hour. So the digital office worked for
// an hour after connecting and then went quiet, with no error the user could
// act on — the inbox and calendar simply came back empty.
//
// The capture half shipped 2026-08-28: connectGmail() asks for
// access_type=offline and _captureGoogleRefreshToken() writes the refresh token
// to public.google_credentials. Nothing read it until now. This is the reader.
//
// SECURITY
//
// - verify_jwt stays TRUE (the default). The gateway rejects anyone without a
//   valid Supabase JWT before this code runs, and we derive the user from that
//   token — never from the request body. A caller cannot ask for someone
//   else's mail token.
// - google_credentials has SELECT revoked from `authenticated` and no SELECT
//   policy, so only the service role can read a refresh token. That is this
//   function and nothing else.
// - GOOGLE_CLIENT_SECRET lives in Supabase secrets. It is never sent to the
//   browser and never appears in this repo.
// - The response carries only a short-lived access token and its expiry.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!
    const CLIENT_ID     = Deno.env.get('GOOGLE_CLIENT_ID')
    const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')

    if (!CLIENT_ID || !CLIENT_SECRET) {
      console.error('google-token: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set')
      return json({ error: 'not_configured' }, 500)
    }

    // Who is calling? Read it from the JWT, never from the body.
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'no_auth' }, 401)

    const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userRes, error: userErr } = await asCaller.auth.getUser()
    const user = userRes?.user
    if (userErr || !user) return json({ error: 'no_user' }, 401)

    // Only the service role can read this table.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: cred, error: credErr } = await admin
      .from('google_credentials')
      .select('refresh_token')
      .eq('user_id', user.id)
      .maybeSingle()

    if (credErr) {
      console.error('google-token: credential read failed', credErr.message)
      return json({ error: 'lookup_failed' }, 500)
    }
    // No stored token — the user has never completed the Gmail consent since
    // capture shipped. The client shows the Connect prompt.
    if (!cred?.refresh_token) return json({ reconnect: true, reason: 'no_refresh_token' }, 200)

    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: cred.refresh_token,
      grant_type: 'refresh_token',
    })

    const gRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const g = await gRes.json().catch(() => ({}))

    if (!gRes.ok) {
      // invalid_grant = revoked by the user, password changed, or unused for
      // 6 months. The stored token is dead; drop it so the UI stops pretending
      // and asks for a reconnect.
      if (g?.error === 'invalid_grant') {
        await admin.from('google_credentials').delete().eq('user_id', user.id)
        return json({ reconnect: true, reason: 'invalid_grant' }, 200)
      }
      console.error('google-token: google refused', gRes.status, g?.error)
      return json({ error: 'google_error', detail: g?.error ?? null }, 502)
    }

    return json({
      access_token: g.access_token,
      expires_in: g.expires_in ?? 3600,
    })
  } catch (e) {
    console.error('google-token: unhandled', e instanceof Error ? e.message : String(e))
    return json({ error: 'unhandled' }, 500)
  }
})
