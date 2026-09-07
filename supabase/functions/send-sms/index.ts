// supabase/functions/send-sms/index.ts
//
// Sends a text to ONE user, honouring the SMS preferences on their profile.
//
// WHAT CHANGED 2026-09-07
//
// This function took `user_id` from the request body and believed it, while
// running with the service role. There was no auth check of any kind. Anyone
// who read the anon key out of the page source of econsquad.ai could have made
// it text any user with a number on file, with any message, at Eric's expense
// and under the EconSquad name.
//
// That was survivable only because Twilio was never configured, so it had never
// sent anything. The A2P campaign registered on 2026-09-07 removes that
// accident of safety.
//
// The caller is now established before anything else happens:
//
//   - the SERVICE ROLE key (stripe-webhook calls this way) may name any user
//   - a signed-in USER may only ever text THEMSELVES; the body's user_id is
//     ignored entirely rather than validated, because a value you never read
//     cannot be wrong
//   - anything else, including the anon key, is refused
//
// Also fixed here: the same GSM-7 problem found in dispatch-alerts. One
// character outside the GSM-7 alphabet - a curly quote, an em dash - flips the
// whole message to UCS-2 and cuts the segment size from 160 characters to 70,
// tripling the cost of every message. Text is transliterated before sending.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWILIO_ACCOUNT_SID  = Deno.env.get('TWILIO_ACCOUNT_SID')  ?? ''
const TWILIO_AUTH_TOKEN   = Deno.env.get('TWILIO_AUTH_TOKEN')   ?? ''
const TWILIO_FROM_NUMBER  = Deno.env.get('TWILIO_FROM_NUMBER')  ?? ''
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')        ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GSM7_SAFE: Record<string, string> = {
  '\u2014': '-', '\u2013': '-', '\u2212': '-',
  '\u2018': "'", '\u2019': "'", '\u201a': "'",
  '\u201c': '"', '\u201d': '"', '\u201e': '"',
  '\u2026': '...', '\u2022': '*', '\u00b7': '.',
  '\u2192': '->', '\u2190': '<-', '\u00a0': ' ',
  '\u2122': 'TM', '\u00ae': '(R)', '\u00a9': '(C)',
}
const GSM7 =
  '@\u00a3$\u00a5\u00e8\u00e9\u00f9\u00ec\u00f2\u00c7\n\u00d8\u00f8\r\u00c5\u00e5' +
  '\u0394_\u03a6\u0393\u039b\u03a9\u03a0\u03a8\u03a3\u0398\u039e\u00c6\u00e6\u00df\u00c9' +
  ' !"#\u00a4%&\'()*+,-./0123456789:;<=>?\u00a1' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ\u00c4\u00d6\u00d1\u00dc\u00a7\u00bf' +
  'abcdefghijklmnopqrstuvwxyz\u00e4\u00f6\u00f1\u00fc\u00e0'
const GSM7_EXT = '^{}\\[~]|\u20ac'

function toGsm7(input: string): string {
  let out = ''
  for (const ch of String(input ?? '')) {
    const mapped = GSM7_SAFE[ch] ?? ch
    for (const c of mapped) out += (GSM7.includes(c) || GSM7_EXT.includes(c)) ? c : '?'
  }
  return out
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const { alert_type, message } = payload

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Who is calling? ──────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Not authorised.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const token = authHeader.slice('Bearer '.length).trim()

    let user_id: string

    // An exact string match on the service key, not a decoded role claim. The
    // key is a fixed secret only our own server code holds; comparing the whole
    // string leaves nothing to reason about.
    if (SUPABASE_SERVICE_KEY && token === SUPABASE_SERVICE_KEY) {
      // Trusted server-to-server call - stripe-webhook texting a customer.
      user_id = String(payload.user_id ?? '')
      if (!user_id) {
        return new Response(
          JSON.stringify({ error: 'user_id is required for service-role calls' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else {
      // A person. They may text themselves and nobody else. The anon key
      // resolves to no user and is refused here - that is the hole this closes.
      const asCaller = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader } },
        auth:   { persistSession: false, autoRefreshToken: false },
      })
      const { data: userRes, error: userErr } = await asCaller.auth.getUser()
      if (userErr || !userRes?.user) {
        return new Response(
          JSON.stringify({ error: 'Please sign in.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      // Deliberately NOT validated against payload.user_id - it is never read.
      user_id = userRes.user.id
    }

    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // ── Fetch user's SMS preferences ──────────────────────────────────────────
    const { data: profile, error: profileErr } = await supa
      .from('profiles')
      .select('phone, sms_alerts, sms_alert_types')
      .eq('id', user_id)
      .single()

    if (profileErr || !profile) {
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Check master SMS toggle ───────────────────────────────────────────────
    if (!profile.sms_alerts || !profile.phone) {
      return new Response(
        JSON.stringify({ skipped: 'SMS disabled or no phone number on file' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Check per-type toggle ─────────────────────────────────────────────────
    if (alert_type) {
      const types: Record<string, boolean> = profile.sms_alert_types ?? {}
      if (types[alert_type] === false) {
        return new Response(
          JSON.stringify({ skipped: `Alert type "${alert_type}" is disabled` }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // ── Normalize phone to E.164 ──────────────────────────────────────────────
    const digits = profile.phone.replace(/\D/g, '')
    if (digits.length < 10) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number — too short' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    // Assume US (+1) if 10 digits, otherwise prepend +
    const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`

    // ── Send via Twilio ───────────────────────────────────────────────────────
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
    const body = new URLSearchParams({
      To:   e164,
      From: TWILIO_FROM_NUMBER,
      Body: toGsm7(`EconSquad AI: ${message}`),
    })

    const twilioRes = await fetch(twilioUrl, {
      method:  'POST',
      headers: {
        'Authorization':  'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        'Content-Type':   'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    const twilioData = await twilioRes.json()

    if (!twilioRes.ok) {
      console.error('Twilio error:', twilioData)
      return new Response(
        JSON.stringify({ error: twilioData.message ?? 'Twilio error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`SMS sent to ${e164} for user ${user_id}: ${twilioData.sid}`)

    // ── Log to sms_log (best-effort, table may not exist yet) ─────────────────
    await supa.from('sms_log').insert({
      user_id,
      alert_type: alert_type ?? 'manual',
      message,
      phone:      e164,
      status:     'sent',
      twilio_sid: twilioData.sid,
    }).then(() => {}).catch(() => {})

    return new Response(
      JSON.stringify({ sent: true, sid: twilioData.sid }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('send-sms unhandled error:', err)
    return new Response(
      /* Was err.message on an `unknown` - never type-checked because this
         function predates any check being run on it. */
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
