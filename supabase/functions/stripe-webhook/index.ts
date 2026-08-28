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
        // Stripe issues a $0.00 invoice at the START of a trial and marks it
        // paid. Treating that as a conversion set plan='starter' the moment a
        // trial began, so the UI stopped showing the countdown — plan==='trial'
        // is what gates it. A real conversion has money on it.
        if ((invoice.amount_paid ?? 0) <= 0) {
          console.log(`Ignoring $0 invoice ${invoice.id} — trial start, not a conversion`)
          break
        }
        const customerId = invoice.customer as string
        const plan       = resolvePlan(invoice)
        if (plan) await updatePlan(supa, customerId, plan)
        break
      }

      // Subscription updated (plan change, trial end converted, etc.)
      case 'customer.subscription.updated': {
        const sub        = event.data.object
        const customerId = sub.customer as string
        if (!(await syncSubscription(supa, customerId, sub))) return notLinkedYet(customerId)
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
        // Payment Links do not set subscription metadata, so this almost
        // always no-ops; the real link happens on checkout.session.completed.
        await linkCustomer(supa, customerId, sub.metadata?.supabase_uid ?? null, null)
        // Trial window comes from Stripe, so changing the trial length there
        // is all that's needed — nothing in the app hardcodes it any more.
        if (!(await syncSubscription(supa, customerId, sub))) return notLinkedYet(customerId)
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
        // past_due was previously invisible: a failed card looked like nothing
        // at all in the admin panel.
        await supa.from('profiles')
          .update({ subscription_status: 'past_due' })
          .eq('stripe_customer_id', (event.data.object as any).customer as string)
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
        await markCanceled(supa, customerId, sub)
        await updatePlan(supa, customerId, 'trial')
        break
      }

      // Checkout session completed — link customer to Supabase user
      case 'checkout.session.completed': {
        const session    = event.data.object
        const customerId = session.customer as string
        const uid        = session.client_reference_id as string | null
        const email      = session.customer_details?.email ?? session.customer_email ?? null
        // index.html sends the literal string 'guest' when nobody is signed in,
        // and a direct share of a payment link sends nothing at all. Email is
        // the fallback so those checkouts still find their profile.
        if (customerId) await linkCustomer(supa, customerId, uid, email)
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
async function syncSubscription(supa: any, customerId: string, sub: any) {
  const toIso = (s: number | null | undefined) =>
    s ? new Date(s * 1000).toISOString() : null

  const price    = sub.items?.data?.[0]?.price ?? {}
  const interval = price.recurring?.interval ?? null      // 'month' | 'year'
  const tier     = PRICE_TO_PLAN[price.id ?? ''] ?? null  // 'starter' | 'pro'

  const patch: Record<string, unknown> = {
    trial_start:         toIso(sub.trial_start),
    trial_end:           toIso(sub.trial_end),
    subscription_status: sub.status ?? null,
    plan_interval:       interval,
  }
  // Only overwrite the tier when Stripe actually named a price we know. An
  // unmapped price should leave the last good value alone, not null it out.
  if (tier) patch.plan_tier = tier
  // A subscription that is alive again clears the old cancellation stamp.
  if (sub.status === 'active' || sub.status === 'trialing') patch.canceled_at = null

  const { data, error } = await supa
    .from('profiles')
    .update(patch)
    .eq('stripe_customer_id', customerId)
    .select('id')

  if (error) { console.error('syncSubscription error:', error.message); return 0 }
  const n = data?.length ?? 0
  console.log(`Synced ${customerId} (${n} row): status=${sub.status} tier=${tier} interval=${interval} trial_end=${toIso(sub.trial_end)}`)
  return n
}

/**
 * Record the cancellation so churn is countable.
 *
 * updatePlan() puts `plan` back to 'trial' on cancel, which makes a churned
 * customer indistinguishable from someone who never subscribed — there was no
 * cancellation history at all before this.
 */
async function markCanceled(supa: any, customerId: string, sub: any) {
  const endedAt = sub.ended_at
    ? new Date(sub.ended_at * 1000).toISOString()
    : new Date().toISOString()

  const { data, error } = await supa
    .from('profiles')
    .update({ subscription_status: 'canceled', canceled_at: endedAt })
    .eq('stripe_customer_id', customerId)
    .select('id')

  if (error) console.error('markCanceled error:', error.message)
  else console.log(`Marked ${customerId} canceled at ${endedAt} (${data?.length ?? 0} row)`)
}

/** Update plan in profiles table by stripe_customer_id */
async function updatePlan(supa: any, customerId: string, plan: string) {
  const { data, error } = await supa
    .from('profiles')
    .update({ plan })
    .eq('stripe_customer_id', customerId)
    .select('id')

  if (error) { console.error('updatePlan error:', error.message); return 0 }
  const n = data?.length ?? 0
  console.log(`Updated plan to "${plan}" for customer ${customerId} (${n} row)`)
  return n
}

/** Store stripe_customer_id on the profile, by uid then by email. */
async function linkCustomer(supa: any, customerId: string, uid: string | null, email: string | null) {
  const isUuid = !!uid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)
  if (isUuid) {
    const { data, error } = await supa
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', uid)
      .select('id')
    if (error) console.error('linkCustomer (uid) error:', error.message)
    else if ((data?.length ?? 0) > 0) {
      console.log(`Linked ${customerId} to profile ${uid}`)
      return true
    }
  }
  if (email) {
    const { data, error } = await supa
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .ilike('email', email)
      .select('id')
    if (error) console.error('linkCustomer (email) error:', error.message)
    else if ((data?.length ?? 0) > 0) {
      console.log(`Linked ${customerId} to profile by email ${email}`)
      return true
    }
  }
  console.error(`linkCustomer: no profile matched uid=${uid} email=${email}`)
  return false
}

/**
 * Stripe creates the subscription BEFORE the checkout session completes, so
 * customer.subscription.created usually arrives about a second before the
 * profile has a stripe_customer_id to match on. A zero-row update is not an
 * error in PostgREST, so this used to succeed silently and the trial window
 * was never written — the original trial-expiry bug, wearing a new hat.
 *
 * Answering non-2xx makes Stripe redeliver on its own schedule, by which time
 * checkout.session.completed has linked the customer. Deliberately NOT used on
 * customer.subscription.deleted: an orphaned customer there would retry for
 * three days against a profile that is never coming.
 */
function notLinkedYet(customerId: string) {
  console.warn(`No profile linked to ${customerId} yet — asking Stripe to retry`)
  return new Response('profile not linked yet', { status: 409 })
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
