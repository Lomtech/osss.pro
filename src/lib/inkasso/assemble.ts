// Assembliert einen vollständigen InkassoCase aus Member + Gym + ältestem offenem
// Payment. Genutzt von der manuellen Handoff-Route UND dem Auto-Übergabe-Cron, damit
// beide identische, vollständige Fälle bauen (Claim-Pflichtfelder, strukturierte
// Adresse, providerUserId). Server-seitig (eine Payment- + optional eine Gym-Query).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { buildReference, type InkassoCase } from './provider'
import { parseGermanAddress } from './address'
import { buildClaimFields, type ClaimSourcePayment } from './claim-fields'

export interface AssembleArgs {
  handoffId: string
  gymId: string
  amountCents: number
  notes: string | null
  member: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
    phone: string | null
    date_of_birth: string | null
    address: string | null
    dunning_started_at: string | null
  }
  /** Optional vorab bekannt (Cron hat sie aus gymConfig) → spart die Gym-Query. */
  gymName?: string | null
  paywiseUserId?: string | null
}

export async function assembleInkassoCase(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: SupabaseClient<Database> | any,
  args: AssembleArgs,
): Promise<InkassoCase> {
  let gymName = args.gymName ?? null
  let paywiseUserId = args.paywiseUserId ?? null
  if (args.gymName === undefined || args.paywiseUserId === undefined) {
    const { data: gym } = await service
      .from('gyms')
      .select('name, paywise_user_id')
      .eq('id', args.gymId)
      .maybeSingle()
    gymName = gym?.name ?? gymName
    paywiseUserId = gym?.paywise_user_id ?? paywiseUserId
  }

  // Ältestes noch nicht bezahltes Payment als Anker für Daten + Rechnungsnummer.
  const { data: payment } = await service
    .from('payments')
    .select('invoice_number, issued_at, due_date, description')
    .eq('member_id', args.member.id)
    .neq('status', 'paid')
    .not('due_date', 'is', null)
    .order('due_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  const addr = parseGermanAddress(args.member.address)
  const claim = buildClaimFields({
    amountCents: args.amountCents,
    gymName: gymName ?? 'Studio',
    payment: (payment ?? null) as ClaimSourcePayment | null,
    dunningStartedAt: args.member.dunning_started_at,
    nowIso: new Date().toISOString(),
  })

  return {
    handoffId: args.handoffId,
    gymId: args.gymId,
    memberId: args.member.id,
    amountCents: args.amountCents,
    reference: buildReference(args.gymId, args.handoffId),
    debtor: {
      firstName: args.member.first_name ?? '',
      lastName: args.member.last_name ?? '',
      email: args.member.email,
      phone: args.member.phone,
      dateOfBirth: args.member.date_of_birth,
      street: addr.street,
      postalCode: addr.zip,
      city: addr.city,
    },
    creditor: { gymName: gymName ?? 'Studio' },
    notes: args.notes,
    providerUserId: paywiseUserId,
    claim,
  }
}
