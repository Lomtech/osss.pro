// Baut die Paywise-Claim-Pflichtfelder aus dem (ältesten offenen) Payment +
// den Mahn-Daten des Mitglieds. Robust: fehlt ein Payment, greifen Fallbacks auf
// dunning_started_at bzw. heute, damit der Claim NIE unvollständige Pflicht-
// Datumsfelder hat (sonst lehnt der Adapter-Guard ihn ab). Pure, unit-testbar:
// „heute" wird als nowIso reingereicht.

export interface ClaimSourcePayment {
  invoice_number: string | null
  issued_at: string | null
  due_date: string | null
  description: string | null
}

export interface BuiltClaimFields {
  invoiceNumber: string | null
  subjectMatter: string
  issuedAt: string
  dueDate: string
  reminderDate: string
  delayDate: string
  principalCents: number
}

function isoDate(value: string | null | undefined, fallback: string): string {
  return (value ?? fallback).slice(0, 10)
}

/** dueDate (yyyy-mm-dd) + n Tage, als yyyy-mm-dd. */
function addDays(isoYmd: string, days: number): string {
  const d = new Date(`${isoYmd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function buildClaimFields(input: {
  amountCents: number
  gymName: string
  payment: ClaimSourcePayment | null
  /** members.dunning_started_at — Datum der ersten Mahnung → reminder_date */
  dunningStartedAt: string | null
  nowIso: string
}): BuiltClaimFields {
  const issuedAt = isoDate(input.payment?.issued_at ?? input.dunningStartedAt, input.nowIso)
  const dueDate = isoDate(input.payment?.due_date ?? input.dunningStartedAt, input.nowIso)
  const reminderDate = isoDate(input.dunningStartedAt, input.nowIso)
  // §286 Abs. 3 BGB: Verbraucher kommen 30 Tage nach Fälligkeit (+ Hinweis) in Verzug.
  const delayDate = addDays(dueDate, 30)
  return {
    invoiceNumber: input.payment?.invoice_number ?? null,
    subjectMatter: input.payment?.description ?? `Mitgliedsbeitrag ${input.gymName}`,
    issuedAt,
    dueDate,
    reminderDate,
    delayDate,
    principalCents: input.amountCents,
  }
}
