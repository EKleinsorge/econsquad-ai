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

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id, alert_type, message } = await req.json()

    if (!user_id || !message) {
      return new Response(
        JSON.stringify({ error: 'user_id and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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
      Body: `EconSquad AI: ${message}`,
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
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
