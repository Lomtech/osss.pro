// Meldet eine erfolgreiche (Direkt-)Zahlung eines Mitglieds an Paywise, WENN der
// Fall bereits übergeben wurde — sonst zieht Paywise bereits Gezahltes ein.
// No-op, wenn es keinen offenen Paywise-Handoff gibt. Best-effort: wirft NIE
// (darf den Stripe-Webhook nicht scheitern lassen).

import { PaywiseProvider } from './paywise'

export async function reportInkassoPaymentIfHandedOver(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any,
  args: { memberId: string; amountCents: number; valueDate: string },
): Promise<void> {
  try {
    if (!args.memberId || args.amountCents <= 0) return

    const { data: handoff } = await service
      .from('dunning_handoffs')
      .select('reference_id, gym_id')
      .eq('member_id', args.memberId)
      .eq('provider', 'paywise')
      .not('reference_id', 'is', null)
      .in('status', ['sent_to_provider', 'accepted'])
      .order('initiated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!handoff?.reference_id) return // nicht (mehr) beim Inkasso → nichts zu melden

    const paywise = new PaywiseProvider()
    if (!paywise.isConfigured()) return

    const { data: gym } = await service
      .from('gyms')
      .select('paywise_user_id')
      .eq('id', handoff.gym_id)
      .maybeSingle()

    const res = await paywise.reportPayment({
      claimId: handoff.reference_id,
      amountCents: args.amountCents,
      valueDate: args.valueDate,
      userId: gym?.paywise_user_id ?? null,
    })
    if (!res.ok) console.error('[inkasso] reportPayment an Paywise fehlgeschlagen (non-fatal):', res.error)
  } catch (e) {
    console.error('[inkasso] reportInkassoPaymentIfHandedOver fehlgeschlagen (non-fatal):', e)
  }
}
