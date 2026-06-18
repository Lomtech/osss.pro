import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { getAppUrl } from '@/lib/app-url'
import { isValidAmountCents, normalizeFeePercent, platformFeeCents } from '@/lib/billing/checkout-math'
import type { Database } from '@/types/database'

function authClient(accessToken: string) {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  )
}

export async function POST(req: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return NextResponse.json({ error: 'Stripe nicht konfiguriert.' }, { status: 400 })
  }

  const accessToken = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!accessToken) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const supabase = authClient(accessToken)
  const { data: { user } } = await supabase.auth.getUser(accessToken)
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { memberId, gymId, memberEmail, memberName, amountCents } = await req.json()

  if (!isValidAmountCents(amountCents, 50)) {
    return NextResponse.json({ error: 'Ungültiger Betrag (Minimum: 0,50 €, muss eine ganze Zahl in Cent sein)' }, { status: 400 })
  }

  const stripe = new Stripe(stripeKey)

  const { data: gymData } = await (supabase.from('gyms') as any)
    .select('id, stripe_account_id, payment_method_types')
    .eq('id', gymId)
    .eq('owner_id', user.id)  // ensures caller owns this gym (RLS + explicit guard)
    .single()
  if (!gymData) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 })
  const connectedAccountId  = gymData?.stripe_account_id

  // Cross-gym guard: member must belong to the caller's gym
  const { data: memberData } = await supabase.from('members')
    .select('stripe_customer_id, gym_id')
    .eq('id', memberId)
    .single()
  if (!memberData || memberData.gym_id !== gymId) {
    return NextResponse.json({ error: 'Mitglied nicht gefunden' }, { status: 403 })
  }
  let customerId = memberData?.stripe_customer_id

  const appUrl = getAppUrl()
  const platformFeePercent = normalizeFeePercent(process.env.STRIPE_PLATFORM_FEE_PERCENT)
  const stripeOpts = connectedAccountId ? { stripeAccount: connectedAccountId } : undefined

  try {
    // Verify existing customer is on connected account; recreate if not
    if (customerId && connectedAccountId) {
      try {
        await stripe.customers.retrieve(customerId, {}, { stripeAccount: connectedAccountId })
      } catch {
        customerId = null
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create(
        { email: memberEmail, name: memberName, metadata: { memberId, gymId } },
        { ...(stripeOpts ?? {}), idempotencyKey: `customer-${memberId}-${connectedAccountId}` },
      )
      customerId = customer.id
      await supabase.from('members').update({ stripe_customer_id: customerId }).eq('id', memberId)
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: 'Monatlicher Mitgliedsbeitrag', description: `Osss – ${memberName}` },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${appUrl}/dashboard/members/${memberId}?payment=success`,
      cancel_url:  `${appUrl}/dashboard/members/${memberId}`,
      metadata: { memberId, gymId },
    }

    // memberId/gymId auch auf den PaymentIntent — damit
    // payment_intent.payment_failed (Mahn-Flow) den Member zuverlässig auflösen
    // kann, nicht nur die Checkout-Session.
    const fee = connectedAccountId ? platformFeeCents(amountCents, platformFeePercent) : 0
    sessionParams.payment_intent_data = {
      metadata: { memberId, gymId },
      ...(fee > 0 ? { application_fee_amount: fee } : {}),
    }

    // Direct charge: session on connected account so customer is found
    const session = await stripe.checkout.sessions.create(
      sessionParams,
      { ...stripeOpts, idempotencyKey: `checkout-${memberId}-${gymId}-${Date.now().toString().slice(0, -3)}` },
    )

    // Store session ID as primary match key — payment_intent may be null until payment completes
    await supabase.from('payments').insert({
      gym_id:                    gymId,
      member_id:                 memberId,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id:  typeof session.payment_intent === 'string' ? session.payment_intent : null,
      amount_cents:              amountCents,
      status:                    'pending',
      checkout_url:              session.url,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Stripe-Fehler beim Erstellen des Zahlungslinks'
    console.error('Stripe create-checkout error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
