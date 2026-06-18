import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { sendMemberPaymentFailedEmail } from '@/lib/notify'
import { escalateDunning } from '@/lib/dunning/escalate'
import { PRICING_TIERS, type PlanKey } from '@/lib/pricing'
import {
  isStripeEventProcessed,
  markStripeEventProcessed,
} from '@/lib/stripe/webhook-idempotency'

// Plan-Member-Limits derived from PRICING_TIERS (single-source-of-truth).
// Without this derivation the webhook drifts away from /pricing whenever
// the marketing tiers move — paying customers then hit "limit reached"
// with their advertised member count. Free is excluded (handled at signup).
//
// 'pro' is conceptually unlimited; we use a high sentinel (1e6) instead of
// null because the consuming columns are NOT NULL in the schema.
// 2026-05 single-tier model: alle paid plans haben unbegrenzte Mitglieder.
// PRO_PLAN_SENTINEL bleibt als Tag in der DB für "unlimited" damit existierende
// Reports + Member-Limit-Checks weiterlaufen ohne Schema-Migration.
const PRO_PLAN_SENTINEL = 1_000_000
const PLAN_LIMITS: Record<PlanKey, number> = (() => {
  const map = {} as Record<PlanKey, number>
  for (const t of PRICING_TIERS) {
    map[t.planKey] = t.membersTo ?? PRO_PLAN_SENTINEL
  }
  return map
})()

async function notifyGymDispute(
  supabase: ReturnType<typeof createClient<Database>>,
  gymId: string,
  disputeId: string,
  amountCents: number,
  chargeId: string,
) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return
  // Audit 2026-05-10: vorher zwei `(gym as any).email`-Casts ohne Type-Safety.
  // Wenn DB-Schema email zu null macht, kam silent `to: null` an Resend → 4xx
  // → Webhook-Retry-Storm. Jetzt strict typed mit early-return bei null.
  const { data: gym } = await supabase
    .from('gyms')
    .select('email, name')
    .eq('id', gymId)
    .single()
  if (!gym?.email) return
  const amountEur = (amountCents / 100).toFixed(2).replace('.', ',')
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: gym.email,
      subject: `⚠️ Chargeback eröffnet – ${amountEur} € – Sofortmaßnahme erforderlich`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
          <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#dc2626">⚠️ Chargeback / Dispute eröffnet</p>
          <p style="font-size:15px;color:#374151;line-height:1.6">
            Ein Mitglied oder die Bank hat eine Zahlung über <strong>${amountEur} €</strong> zurückgebucht.
            Du hast in der Regel <strong>7 Tage</strong>, um Beweise einzureichen.
          </p>
          <table style="width:100%;margin:16px 0;font-size:14px;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#6b7280">Dispute-ID</td><td style="padding:6px 0;font-weight:600">${disputeId}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Betrag</td><td style="padding:6px 0;font-weight:600">${amountEur} €</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Charge-ID</td><td style="padding:6px 0">${chargeId}</td></tr>
          </table>
          <a href="https://dashboard.stripe.com/disputes/${disputeId}" style="display:inline-block;background:#dc2626;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">
            Jetzt in Stripe-Dashboard ansehen →
          </a>
        </div>
      `,
    }),
  }).catch(e => console.error('Dispute notify email error:', e))
}

export async function POST(req: Request) {
  const stripeKey     = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripeKey || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe nicht konfiguriert' }, { status: 400 })
  }

  const stripe = new Stripe(stripeKey)
  const body   = await req.text()
  const sig    = req.headers.get('stripe-signature')
  if (!sig) return new Response('Missing stripe-signature', { status: 400 })

  let event: Stripe.Event | null = null
  for (const secret of [webhookSecret, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(Boolean) as string[]) {
    try { event = stripe.webhooks.constructEvent(body, sig, secret); break }
    catch { /* try next */ }
  }
  if (!event) return NextResponse.json({ error: 'Webhook-Signatur ungültig' }, { status: 400 })

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Redis L1-Idempotency (Sprint B 2026-05-30): wenn der Webhook schon
  // erfolgreich verarbeitet wurde, sehen wir das in Redis sofort und sparen
  // 2 DB-Roundtrips. Cache-TTL 24h, Stripe retried max 3 Tage — DB-Tabelle
  // bleibt source of truth für die längeren Replays.
  if (await isStripeEventProcessed(event.id)) {
    return NextResponse.json({ received: true, duplicate: true, layer: 'redis' })
  }

  // Transactional-outbox pattern. Two-phase event processing:
  //
  //   Phase 1 (claim):    INSERT stripe_events row with processed_at = NULL.
  //   Phase 2 (handle):   run side-effects (DB updates, Resend mails, Stripe API calls).
  //   Phase 3 (settle):   markProcessed() sets processed_at = NOW() at the end.
  //
  // On 23505 (UNIQUE violation) we look at the existing row's processed_at:
  //   - NOT NULL → real duplicate, an earlier delivery already finished.   Return 200.
  //   - NULL     → an earlier delivery CRASHED mid-handler. Stripe is replaying.
  //                Continue processing (the side-effects must be idempotent — they are:
  //                payments.update by intent-id, members.update by id, gyms.update by id).
  //
  // On any uncaught exception during side-effects we record last_error + bump retry_count
  // and return 5xx so Stripe retries. The handler stays safe to replay because
  // processed_at remains NULL until the final markProcessed call.
  const { error: dedupErr } = await supabase
    .from('stripe_events')
    .insert({ event_id: event.id, type: event.type })
  if (dedupErr) {
    if ((dedupErr as { code?: string }).code === '23505') {
      const { data: existing, error: lookupErr } = await supabase
        .from('stripe_events')
        .select('processed_at')
        .eq('event_id', event.id)
        .single()
      if (lookupErr) {
        console.error('[webhook] stripe_events lookup after 23505 failed:', lookupErr)
        return NextResponse.json({ error: 'Dedup lookup failed' }, { status: 500 })
      }
      if (existing?.processed_at) {
        // Genuine duplicate — first delivery already settled.
        return NextResponse.json({ received: true, duplicate: true })
      }
      // processed_at IS NULL → earlier delivery crashed; replay the side-effects.
      console.warn(`[webhook] replaying unprocessed event ${event.id} (recovery)`)
    } else {
      console.error('[webhook] stripe_events insert error:', dedupErr)
      return NextResponse.json({ error: 'Dedup insert failed' }, { status: 500 })
    }
  }

  // Mark the event as fully processed. Called at every success-return below.
  // After this returns, future deliveries from Stripe for the same event_id
  // will hit the 23505 branch above and short-circuit as "duplicate".
  const markProcessed = async () => {
    const { error: markErr } = await supabase
      .from('stripe_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', event!.id)
    if (markErr) {
      // Don't fail the webhook for this — Stripe replay will hit the
      // recovery branch and re-run idempotent side-effects.
      console.error('[webhook] markProcessed failed:', markErr)
    }
    // Redis L1 (Sprint B 2026-05-30) — best-effort, kein await-fail
    await markStripeEventProcessed(event!.id)
  }

  try {

  // ── checkout.session.completed ──────────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session         = event.data.object as Stripe.Checkout.Session
    const memberId        = session.metadata?.memberId ?? null
    const sessionId       = session.id
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null

    if (session.metadata?.type === 'owner_plan') {
      const { gymId, plan } = session.metadata
      const planKey = (plan && plan in PLAN_LIMITS) ? plan as Exclude<PlanKey, 'free'> : null
      const { error: planErr } = await supabase.from('gyms').update({
        plan:                        plan as Database['public']['Tables']['gyms']['Update']['plan'],
        plan_member_limit:           planKey ? PLAN_LIMITS[planKey] : 30,
        osss_stripe_customer_id:     typeof session.customer    === 'string' ? session.customer    : undefined,
        osss_stripe_subscription_id: typeof session.subscription === 'string' ? session.subscription : undefined,
      }).eq('id', gymId)
      if (planErr) throw planErr
    }

    if (memberId && session.mode === 'subscription') {
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null
      if (subscriptionId) {
        const { error: subErr } = await supabase.from('members')
          .update({ stripe_subscription_id: subscriptionId, subscription_status: 'active' })
          .eq('id', memberId)
        if (subErr) throw subErr
      }
    }

    if (session.payment_status === 'paid') {
      const now   = new Date().toISOString()
      const gymId = session.metadata?.gymId ?? null
      let matched = false

      const { data: bySession, error: bySessionErr } = await supabase
        .from('payments')
        .update({ status: 'paid', paid_at: now, stripe_payment_intent_id: paymentIntentId })
        .eq('stripe_checkout_session_id', sessionId)
        .limit(1)
        .select('id')
      if (bySessionErr) throw bySessionErr
      if (bySession && bySession.length > 0) matched = true

      if (!matched && paymentIntentId) {
        const { data: byIntent, error: byIntentErr } = await supabase
          .from('payments')
          .update({ status: 'paid', paid_at: now })
          .eq('stripe_payment_intent_id', paymentIntentId)
          .limit(1)
          .select('id')
        if (byIntentErr) throw byIntentErr
        if (byIntent && byIntent.length > 0) matched = true

        if (!matched && memberId) {
          const { data: pending, error: pendingErr } = await supabase
            .from('payments').select('id')
            .eq('member_id', memberId).eq('status', 'pending')
            .order('created_at', { ascending: false }).limit(1).single()
          if (pendingErr && pendingErr.code !== 'PGRST116') throw pendingErr
          if (pending) {
            const { error: updErr } = await supabase.from('payments')
              .update({ status: 'paid', paid_at: now, stripe_payment_intent_id: paymentIntentId, stripe_checkout_session_id: sessionId })
              .eq('id', pending.id)
            if (updErr) throw updErr
            matched = true
          }
        }
      }

      if (!matched && memberId && gymId && session.mode === 'subscription') {
        const { data: existing, error: existErr } = await supabase
          .from('payments').select('id')
          .eq('stripe_checkout_session_id', sessionId).limit(1)
        if (existErr) throw existErr
        if (!existing || existing.length === 0) {
          const { data: mRow } = await supabase.from('members').select('first_name, last_name').eq('id', memberId).single()
          const memberName = mRow ? (`${mRow.first_name ?? ''} ${mRow.last_name ?? ''}`).trim() || null : null
          const { error: insErr } = await supabase.from('payments').insert({
            gym_id:                     gymId,
            member_id:                  memberId,
            member_name:                memberName,
            amount_cents:               session.amount_total ?? 0,
            status:                     'paid',
            paid_at:                    now,
            stripe_payment_intent_id:   paymentIntentId,
            stripe_checkout_session_id: sessionId,
          })
          if (insErr) throw insErr
        }
      }
    }
  }

  // ── account.updated ─────────────────────────────────────────────────────────
  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account
    const { data: gym, error: gymLookupErr } = await supabase.from('gyms').select('id').eq('stripe_account_id', account.id).single()
    if (gymLookupErr && gymLookupErr.code !== 'PGRST116') throw gymLookupErr
    if (gym) {
      const { error: updErr } = await supabase.from('gyms').update({ stripe_charges_enabled: account.charges_enabled }).eq('id', gym.id)
      if (updErr) throw updErr
    }
  }

  // ── account.application.deauthorized ────────────────────────────────────────
  // Gym disconnected the Stripe Connect app — clear the link so further checkouts
  // fail fast in the UI instead of silently 500'ing on the connected account.
  if (event.type === 'account.application.deauthorized') {
    const accountId = event.account ?? null
    if (accountId) {
      const { error: deauthErr } = await supabase
        .from('gyms')
        .update({ stripe_account_id: null, stripe_charges_enabled: false } as never)
        .eq('stripe_account_id', accountId)
      if (deauthErr) {
        console.error('[webhook] deauthorized cleanup error:', deauthErr)
        throw deauthErr
      }
    }
  }

  // ── charge.refunded ─────────────────────────────────────────────────────────
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge
    const piId   = typeof charge.payment_intent === 'string' ? charge.payment_intent : null
    if (piId) {
      const { error: refErr } = await supabase.from('payments').update({ status: 'refunded' }).eq('stripe_payment_intent_id', piId)
      if (refErr) throw refErr
    }
  }

  // ── payment_intent.payment_failed ───────────────────────────────────────────
  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object as Stripe.PaymentIntent
    const { error: failErr } = await supabase.from('payments').update({ status: 'failed' }).eq('stripe_payment_intent_id', pi.id)
    if (failErr) throw failErr

    // Mahn-Flow auch für Einmal-/SEPA-Zahlungen — bisher eskalierten NUR
    // Abo-Rechnungen (invoice.payment_failed), Einmal-Fehler rutschten durch
    // → Rückstände häuften sich unbemerkt an. memberId via PI-Metadata, sonst
    // via payments-Row. Kein Member-Link → nur Status, kein Mahn-Trigger.
    let pfMemberId = typeof pi.metadata?.memberId === 'string' ? pi.metadata.memberId : null
    if (!pfMemberId) {
      const { data: payRow } = await supabase.from('payments')
        .select('member_id').eq('stripe_payment_intent_id', pi.id).maybeSingle()
      pfMemberId = (payRow as { member_id?: string | null } | null)?.member_id ?? null
    }
    if (pfMemberId) {
      await escalateDunning(supabase, pfMemberId, pi.amount ?? 0, `Einmal-Zahlung fehlgeschlagen (PI ${pi.id})`)
    }
  }

  // ── customer.subscription.created / updated ──────────────────────────────────
  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const sub      = event.data.object as Stripe.Subscription
    const memberId = sub.metadata?.memberId
    const subType  = sub.metadata?.type

    // Owner-Plan branch — Studio-Owner upgraded/downgraded their SaaS-tier
    // (typically via the Stripe Billing Portal). Without this branch the DB
    // stays on whatever plan was set at first checkout, so a paid Grow tier
    // still has Starter's plan_member_limit. That's the fastest support-ticket
    // generator imaginable.
    if (subType === 'owner_plan') {
      const newPlan = sub.metadata?.plan as Exclude<PlanKey, 'free'> | undefined
      const gymId   = sub.metadata?.gymId
      if (newPlan && gymId && newPlan in PLAN_LIMITS) {
        // Note: gyms-table has no subscription_status column (only members does).
        // We update plan + member-limit + stripe-sub-id; the plan itself
        // (free vs starter/grow/pro) is the truth signal for the dashboard.
        // If the sub is canceled, the customer.subscription.deleted branch
        // below downgrades to 'free' separately.
        const { error: ownerSubErr } = await supabase.from('gyms').update({
          plan: newPlan,
          plan_member_limit: PLAN_LIMITS[newPlan],
          osss_stripe_subscription_id: sub.id,
        }).eq('id', gymId)
        if (ownerSubErr) throw ownerSubErr
      }
      // owner_plan handled — fall through to the next event-branch.
      await markProcessed()
      return NextResponse.json({ received: true })
    }

    if (memberId) {
      const status: Database['public']['Tables']['members']['Update']['subscription_status'] =
        sub.status === 'active'   ? 'active'    :
        sub.status === 'past_due' ? 'past_due'  :
        sub.status === 'canceled' ? 'cancelled' :
        'none'
      const { error: subUpdErr } = await supabase.from('members')
        .update({ stripe_subscription_id: sub.id, subscription_status: status })
        .eq('id', memberId)
      if (subUpdErr) throw subUpdErr

      if (event.type === 'customer.subscription.created') {
        const cancelAtTs = sub.metadata?.cancel_at_ts
        if (cancelAtTs && !sub.cancel_at) {
          try {
            const connectedAccount = req.headers.get('stripe-account') ?? undefined
            await stripe.subscriptions.update(
              sub.id,
              { cancel_at: parseInt(cancelAtTs, 10) },
              connectedAccount ? { stripeAccount: connectedAccount } : undefined,
            )
          } catch (err) {
            console.error('[webhook] Failed to set cancel_at on subscription:', err)
          }
        }
      }
    }
  }

  // ── customer.subscription.deleted ───────────────────────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const sub      = event.data.object as Stripe.Subscription
    const memberId = sub.metadata?.memberId
    if (memberId) {
      const { error: delMemberErr } = await supabase.from('members')
        .update({ stripe_subscription_id: null, subscription_status: 'cancelled' })
        .eq('id', memberId)
      if (delMemberErr) throw delMemberErr
    }

    const { data: gymWithSub, error: gymLookupErr } = await supabase.from('gyms').select('id').eq('osss_stripe_subscription_id', sub.id).single()
    if (gymLookupErr && gymLookupErr.code !== 'PGRST116') throw gymLookupErr
    if (gymWithSub) {
      const { error: gymDownErr } = await supabase.from('gyms').update({
        plan:                        'free',
        plan_member_limit:           30,
        osss_stripe_subscription_id: null,
      }).eq('id', gymWithSub.id)
      if (gymDownErr) throw gymDownErr
    }
  }

  // ── invoice.paid ─────────────────────────────────────────────────────────────
  if (event.type === 'invoice.paid') {
    const inv             = event.data.object as Stripe.Invoice
    const meta            = (inv as unknown as { subscription_details?: { metadata?: Record<string, string> } }).subscription_details?.metadata ?? inv.metadata ?? {}
    const memberId        = meta.memberId
    const gymId           = meta.gymId
    const amountCents     = inv.amount_paid
    const paymentIntentId = typeof (inv as unknown as { payment_intent?: string }).payment_intent === 'string'
      ? (inv as unknown as { payment_intent: string }).payment_intent
      : null
    const invoiceId = inv.id

    if (memberId && amountCents > 0) {
      if (invoiceId) {
        const { data: byInvoice } = await supabase
          .from('payments').select('id')
          .eq('stripe_invoice_id', invoiceId)
          .single()
        if (byInvoice) {
          await markProcessed()
          return NextResponse.json({ received: true })
        }
      }
      if (paymentIntentId) {
        const { data: byIntent } = await supabase
          .from('payments').select('id')
          .eq('stripe_payment_intent_id', paymentIntentId)
          .single()
        if (byIntent) {
          await markProcessed()
          return NextResponse.json({ received: true })
        }
      }

      // Recover past_due → active when subscription payment succeeds
      await supabase.from('members')
        .update({ subscription_status: 'active' } as never)
        .eq('id', memberId)
        .eq('subscription_status', 'past_due')

      const { data: mRow } = await supabase.from('members').select('first_name, last_name').eq('id', memberId).single()
      const memberName = mRow ? `${mRow.first_name} ${mRow.last_name}` : null
      const { error: insErr } = await supabase.from('payments').insert({
        gym_id:                   gymId ?? null,
        member_id:                memberId,
        member_name:              memberName,
        amount_cents:             amountCents,
        status:                   'paid',
        paid_at:                  new Date().toISOString(),
        stripe_payment_intent_id: paymentIntentId,
        stripe_invoice_id:        invoiceId ?? null,
      } as any)
      if (insErr) throw insErr
    }
  }

  // ── payment_intent.succeeded (SEPA async confirmation) ──────────────────────
  if (event.type === 'payment_intent.succeeded') {
    const pi  = event.data.object as Stripe.PaymentIntent
    const now = new Date().toISOString()
    const { error: sepaErr } = await supabase
      .from('payments')
      .update({ status: 'paid', paid_at: now })
      .eq('stripe_payment_intent_id', pi.id)
      .eq('status', 'pending')
    if (sepaErr) throw sepaErr
  }

  // ── invoice.payment_failed ───────────────────────────────────────────────────
  if (event.type === 'invoice.payment_failed') {
    const inv      = event.data.object as Stripe.Invoice
    const meta     = (inv as unknown as { subscription_details?: { metadata?: Record<string, string> } }).subscription_details?.metadata ?? inv.metadata ?? {}
    const memberId = meta.memberId

    if (memberId) {
      const { error: pastDueErr } = await supabase.from('members').update({ subscription_status: 'past_due' }).eq('id', memberId)
      if (pastDueErr) throw pastDueErr

      // Notify gym owner about failed member payment (non-critical — never fail webhook)
      try {
        const failedGymId = inv.metadata?.gymId
          ?? (inv as unknown as { subscription_details?: { metadata?: Record<string,string> } })
             .subscription_details?.metadata?.gymId
        if (failedGymId) {
          const [{ data: failedMember }, { data: failedGym }] = await Promise.all([
            supabase.from('members').select('first_name, last_name').eq('id', memberId).maybeSingle(),
            supabase.from('gyms').select('name, email').eq('id', failedGymId).maybeSingle(),
          ])
          if (failedMember && failedGym?.email) {
            const mName = `${failedMember.first_name} ${failedMember.last_name}`
            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.osss.pro'
            await sendMemberPaymentFailedEmail(
              failedGym.email,
              mName,
              failedGym.name ?? '',
              inv.amount_due ?? inv.total ?? 0,
              `${appUrl}/dashboard/members/${memberId}`,
            )
          }
        }
      } catch (notifyErr) {
        console.error('[webhook] dunning notification failed:', notifyErr)
      }

      // Auto-Mahnung via gemeinsamem Helper (auch von payment_intent.payment_failed
      // genutzt, damit Abo- UND Einmal-Zahlungen denselben Mahn-Flow auslösen).
      const failedAmountCents = inv.amount_due ?? inv.total ?? 0
      await escalateDunning(supabase, memberId, failedAmountCents, `Stripe-Zahlung fehlgeschlagen (Invoice ${inv.id ?? '?'})`)
    } else if (meta.type === 'owner_plan') {
      const gymId = meta.gymId
      if (gymId) {
        // Audit 2026-05-11: Owner-Plan NICHT bei jedem failed payment downgraden.
        // Stripe Smart Retries versucht standardmäßig bis zu 4× über ~21 Tage.
        // Erst bei der letzten Attempt (oder via `customer.subscription.deleted`)
        // ist das Abo wirklich tot — vorher würde ein 3-Tage-Karten-Decline
        // den zahlenden Owner für 3 Tage offline werfen.
        const attemptCount = inv.attempt_count ?? 0
        const isFinalAttempt = (inv.next_payment_attempt ?? null) === null
        if (attemptCount >= 4 || isFinalAttempt) {
          const { error: downErr } = await supabase.from('gyms').update({ plan: 'free', plan_member_limit: 30 }).eq('id', gymId)
          if (downErr) throw downErr
          console.warn(`[webhook] Owner plan downgrade for gym ${gymId} — attempt=${attemptCount}, final=${isFinalAttempt}`)
        } else {
          console.log(`[webhook] Owner plan payment failed gym=${gymId}, attempt=${attemptCount}, awaiting Stripe retry`)
        }
      }
    }
  }

  // ── invoice.upcoming ─────────────────────────────────────────────────────────
  if (event.type === 'invoice.upcoming') {
    const invoice = event.data.object as Stripe.Invoice
    const gymId   = invoice.metadata?.gymId
      ?? (invoice as unknown as { subscription_details?: { metadata?: Record<string, string> } }).subscription_details?.metadata?.gymId
    if (gymId) {
      const { data: gym } = await supabase.from('gyms').select('email, name').eq('id', gymId).single()
      const g = gym as any
      if (g?.email && process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL,
            to:   g.email,
            subject: `Erinnerung: Dein Abonnement verlängert sich in 3 Tagen`,
            html: `
              <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
                <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1d4ed8">Verlängerung in 3 Tagen</p>
                <p style="font-size:15px;color:#374151;line-height:1.6">
                  Hallo ${g.name ?? 'Team'},<br/><br/>
                  dein Osss-Abonnement wird in <strong>3 Tagen</strong> automatisch verlängert.
                  Bitte stelle sicher, dass deine Zahlungsmethode aktuell ist.
                </p>
                <a href="https://dashboard.stripe.com/billing" style="display:inline-block;background:#1d4ed8;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">
                  Zahlungsmethode prüfen →
                </a>
              </div>
            `,
          }),
        }).catch(e => console.error('[webhook] invoice.upcoming email error:', e))
      }
    }
    await markProcessed()
    return NextResponse.json({ received: true })
  }

  // ── customer.subscription.trial_will_end ─────────────────────────────────────
  if (event.type === 'customer.subscription.trial_will_end') {
    const sub      = event.data.object as Stripe.Subscription
    const memberId = sub.metadata?.memberId
    if (memberId) {
      const { error: trialErr } = await supabase.from('members')
        .update({ subscription_status: 'trial' } as never)
        .eq('id', memberId)
      if (trialErr) console.error('[webhook] trial_will_end update error:', trialErr)
      else console.log(`[webhook] trial_will_end — member ${memberId} status set to trial`)
    }
    await markProcessed()
    return NextResponse.json({ received: true })
  }

  // ── charge.dispute.closed ────────────────────────────────────────────────────
  if (event.type === 'charge.dispute.closed') {
    const dispute  = event.data.object as Stripe.Dispute
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id
    if (chargeId) {
      const finalStatus = dispute.status === 'won' ? 'paid' : 'disputed_lost'
      const { error: disputeCloseErr } = await supabase.from('payments')
        .update({ status: finalStatus } as never)
        .eq('stripe_payment_intent_id', dispute.payment_intent as string)
      if (disputeCloseErr) throw disputeCloseErr
    }
    await markProcessed()
    return NextResponse.json({ received: true })
  }

  // ── charge.dispute.updated ───────────────────────────────────────────────────
  if (event.type === 'charge.dispute.updated') {
    const dispute = event.data.object as Stripe.Dispute
    const piId    = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : null
    if (piId) {
      await supabase.from('payments')
        .update({ status: 'disputed' } as never)
        .eq('stripe_payment_intent_id', piId)
        .eq('status', 'disputed')
    }
    await markProcessed()
    return NextResponse.json({ received: true })
  }

  // ── charge.dispute.created ───────────────────────────────────────────────────
  if (event.type === 'charge.dispute.created') {
    const dispute  = event.data.object as Stripe.Dispute
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id ?? ''

    if (chargeId) {
      const { data: charge } = await (async () => {
        try { return { data: await stripe.charges.retrieve(chargeId) } }
        catch { return { data: null } }
      })()
      const piId = typeof charge?.payment_intent === 'string' ? charge.payment_intent : null
      if (piId) {
        const { data: pmt, error: disputeUpdErr } = await supabase
          .from('payments')
          .update({ status: 'disputed' })
          .eq('stripe_payment_intent_id', piId)
          .select('gym_id, amount_cents')
          .single()
        if (disputeUpdErr && disputeUpdErr.code !== 'PGRST116') throw disputeUpdErr

        if (pmt) {
          await notifyGymDispute(supabase, (pmt as any).gym_id, dispute.id, (pmt as any).amount_cents, chargeId)
        }
      }
    }
  }

  await markProcessed()
  return NextResponse.json({ received: true })
  } catch (handlerErr) {
    // Side-effect crashed — record diagnostic info on the stripe_events row and
    // return 5xx so Stripe's at-least-once retry kicks in. The next delivery
    // will hit the 23505 + processed_at IS NULL recovery branch above and
    // re-run the (idempotent) side-effects until they fully succeed.
    const errMsg = handlerErr instanceof Error
      ? handlerErr.message
      : (typeof handlerErr === 'object' && handlerErr !== null && 'message' in handlerErr
          ? String((handlerErr as { message: unknown }).message)
          : String(handlerErr))
    console.error(`[webhook] handler crashed for event ${event.id}:`, handlerErr)

    // Read current retry_count, then bump. We avoid an RPC for now to keep the
    // change minimal; the read+write race is benign because per-event deliveries
    // from Stripe are sequential.
    const { data: existing } = await supabase
      .from('stripe_events')
      .select('retry_count')
      .eq('event_id', event.id)
      .single()
    const nextRetry = ((existing as { retry_count?: number } | null)?.retry_count ?? 0) + 1
    const { error: updateErr } = await supabase
      .from('stripe_events')
      .update({ last_error: errMsg.slice(0, 4000), retry_count: nextRetry })
      .eq('event_id', event.id)
    if (updateErr) {
      console.error('[webhook] failed to record handler error on stripe_events:', updateErr)
    }
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
