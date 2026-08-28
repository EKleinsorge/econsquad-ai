import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Map Stripe Price IDs → plan names.
// Live prices, created 2026-08-28. The test-mode IDs these replaced were
// price_1TVA… — swapping the account to live meant every one of them stopped
// matching. If a payment ever arrives on an unmapped price, resolvePlanFromSub
// returns undefined, updatePlan is skipped, and the customer silently stays on
// 'trial' while their card is charged. Update this whenever a price changes.
const PRICE_TO_PLAN: Record<string, string> = {
  'price_1U9HKTAdXRzmLVohsMCudimy': 'starter',  // Starter monthly   $49/mo
  'price_1U9HVYAdXRzmLVohyACfWvBt': 'starter',  // Starter annual   $490/yr
  'price_1U9HjkAdXRzmLVohSHH5VeU8': 'pro',      // Pro Squad monthly $99/mo
  'price_1U9HkRAdXRzmLVohfJSPwS7J': 'pro',      // Pro Squad annual $990/yr
}

serve(async (req) => {
  const body      = await req.text()
  const sigHeader = req.headers.get('stripe-signature') ?? ''

  // ── Verify Stripe signature ──────────────────────────────────────────────
  let event: any
  try {
    event = await verifyStripeSignature(body, sigHeader, STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature failed:', err.message)
    return new Response('Signature verification failed', { status: 400 })
  }

  const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // ── Handle events ────────────────────────────────────────────────────────
  try {
    switch (event.type) {

      // Trial converted to paid  OR  subscription renewed
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        // Only act on subscription invoices (not one-time charges)
        if (!invoice.subscription) break
        const customerId = invoice.customer as string
        const plan       = resolvePlan(invoice)
        if (plan) await updatePlan(supa, customerId, plan)
        break
      }

      // Subscription updated (plan change, trial end converted, etc.)
      case 'customer.subscription.updated': {
        const sub        = event.data.object
        const customerId = sub.customer as string
        await syncTrialDates(supa, customerId, sub)
        const plan       = resolvePlanFromSub(sub)
        // While trialing, the profile stays on 'trial' regardless of which
        // price they picked — the UI reads plan==='trial' to show the countdown.
        if (sub.status === 'trialing') {
          await updatePlan(supa, customerId, 'trial')
        } else if (plan) {
          await updatePlan(supa, customerId, plan)
        }
        break
      }

      // Subscription created fresh (after checkout)
      case 'customer.subscription.created': {
        const sub        = event.data.object
        const customerId = sub.customer as string
        // Store stripe_customer_id immediately even if still in trial
        await linkCustomer(supa, customerId, sub.metadata?.supabase_uid ?? null)
        // Trial window comes from Stripe, so changing the trial length there
        // is all that's needed — nothing in the app hardcodes it any more.
        await syncTrialDates(supa, customerId, sub)
        const plan = resolvePlanFromSub(sub)
        if (sub.status === 'trialing') {
          await updatePlan(supa, customerId, 'trial')
        } else if (plan && sub.status === 'active') {
          await updatePlan(supa, customerId, plan)
        }
        break
      }

      // Payment failed — notify user via SMS
      case 'invoice.payment_failed': {
        const invoice    = event.data.object
        const customerId = invoice.customer as string
        console.log('Payment failed for customer', customerId)
        // Look up user by stripe_customer_id and fire SMS alert
        const { data: profile } = await supa
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()
        if (profile?.id) {
          await sendSmsAlert(profile.id, 'payment_failed',
            'Your EconSquad AI payment failed. Please update your billing info to keep your squad running: https://econsquad.ai'
          )
        }
        break
      }

      // Subscription cancelled / expired
      case 'customer.subscription.deleted': {
        const sub        = event.data.object
        const customerId = sub.customer as string
        await updatePlan(supa, customerId, 'trial')
        break
      }

      // Checkout session completed — link customer to Supabase user
      case 'checkout.session.completed': {
        const session    = event.data.object
        const customerId = session.customer as string
        const uid        = session.client_reference_id as string | null
        if (uid && customerId) await linkCustomer(supa, customerId, uid)
        break
      }

      default:
        // Unhandled event — just acknowledge
        break
    }
  } catch (err) {
    console.error('Handler error:', err)
    return new Response('Handler error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
})

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Derive plan name from the first line item's price */
function resolvePlan(invoice: any): string | null {
  const lines = invoice.lines?.data ?? []
  for (const line of lines) {
    const priceId = line.price?.id ?? ''
    if (PRICE_TO_PLAN[priceId]) return PRICE_TO_PLAN[priceId]
    // Fallback: check metadata on the price object
    const meta = line.price?.metadata ?? {}
    if (meta.plan) return meta.plan
  }
  // Last resort: use amount to guess (rough fallback)
  const amount = invoice.amount_paid ?? 0
  if (amount > 0) return 'starter' // default to starter if paid but unknown price
  return null
}

/** Derive plan from subscription items */
function resolvePlanFromSub(sub: any): string | null {
  const items = sub.items?.data ?? []
  for (const item of items) {
    const priceId = item.price?.id ?? ''
    if (PRICE_TO_PLAN[priceId]) return PRICE_TO_PLAN[priceId]
    const meta = item.price?.metadata ?? {}
    if (meta.plan) return meta.plan
  }
  return null
}

/**
 * Write the Stripe trial window onto the profile.
 *
 * Nothing wrote trial_start / trial_end before this, so they were always null
 * — and every trial branch in index.html is gated on `plan==='trial' && trialEnd`,
 * which meant the countdown, the progress bar and the expiry prompt never
 * rendered for anyone. That was the "trial expiry bug".
 *
 * Stripe gives these as Unix seconds; null means no trial on the subscription.
 */
async function syncTrialDates(supa: any, customerId: string, sub: any) {
  const toIso = (s: number | null | undefined) =>
    s ? new Date(s * 1000).toISOString() : null

  const { error } = await supa
    .from('profiles')
    .update({
      trial_start: toIso(sub.trial_start),
      trial_end:   toIso(sub.trial_end),
    })
    .eq('stripe_customer_id', customerId)

  if (error) console.error('syncTrialDates error:', error.message)
  else console.log(`Trial window for ${customerId}: ${toIso(sub.trial_start)} → ${toIso(sub.trial_end)}`)
}

/** Update plan in profiles table by stripe_customer_id */
async function updatePlan(supa: any, customerId: string, plan: string) {
  const { error } = await supa
    .from('profiles')
    .update({ plan })
    .eq('stripe_customer_id', customerId)

  if (error) console.error('updatePlan error:', error.message)
  else console.log(`Updated plan to "${plan}" for customer ${customerId}`)
}

/** Store stripe_customer_id on the profile (by uid or email lookup) */
async function linkCustomer(supa: any, customerId: string, uid: string | null) {
  if (uid) {
    const { error } = await supa
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', uid)
    if (error) console.error('linkCustomer (uid) error:', error.message)
  }
}

/** Fire an SMS via the send-sms Edge Function (best-effort, never throws) */
async function sendSmsAlert(userId: string, alertType: string, message: string) {
  try {
    const fnUrl = `${SUPABASE_URL}/functions/v1/send-sms`
    await fetch(fnUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ user_id: userId, alert_type: alertType, message }),
    })
  } catch (err) {
    console.error('sendSmsAlert error:', err)
  }
}

// ── Stripe signature verification (no external Stripe SDK needed) ────────────
async function verifyStripeSignature(body: string, header: string, secret: string) {
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not set')

  const parts     = Object.fromEntries(header.split(',').map(p => p.split('=')))
  const timestamp = parts['t']
  const signature = parts['v1']
  if (!timestamp || !signature) throw new Error('Malformed stripe-signature header')

  const signed    = `${timestamp}.${body}`
  const key       = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const mac       = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed))
  const computed  = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('')

  if (computed !== signature) throw new Error('Signature mismatch')

  // Reject if timestamp is more than 5 minutes old
  const age = Date.now() / 1000 - Number(timestamp)
  if (age > 300) throw new Error('Webhook timestamp too old')

  return JSON.parse(body)
}
