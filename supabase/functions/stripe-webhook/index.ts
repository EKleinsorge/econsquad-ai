import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Map Stripe Price IDs → plan names.
// Fill these in with your real Stripe Price IDs from the Dashboard.
const PRICE_TO_PLAN: Record<string, string> = {
  // Starter monthly / annual
  'price_starter_monthly': 'starter',
  'price_starter_annual':  'starter',
  // Pro monthly / annual
  'price_pro_monthly':     'pro',
  'price_pro_annual':      'pro',
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
        const plan       = resolvePlanFromSub(sub)
        if (plan) await updatePlan(supa, customerId, plan)
        break
      }

      // Subscription created fresh (after checkout)
      case 'customer.subscription.created': {
        const sub        = event.data.object
        const customerId = sub.customer as string
        // Store stripe_customer_id immediately even if still in trial
        await linkCustomer(supa, customerId, sub.metadata?.supabase_uid ?? null)
        const plan = resolvePlanFromSub(sub)
        if (plan && sub.status === 'active') await updatePlan(supa, customerId, plan)
        break
      }

      // Payment failed — optionally downgrade or mark
      case 'invoice.payment_failed': {
        const invoice    = event.data.object
        const customerId = invoice.customer as string
        console.log('Payment failed for customer', customerId)
        // You could set plan back to 'trial' or add a flag here if desired
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
