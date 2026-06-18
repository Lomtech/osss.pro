/**
 * Pure tests for the Paywise case-assembly helpers (address parsing + claim
 * field building). The DB-touching assembleInkassoCase() composes these; the
 * risky logic (German address parsing, required-date fallbacks, §286 delay) is
 * isolated here so a regression fails in CI.
 */

import { describe, test, expect } from 'vitest'
import { parseGermanAddress } from '@/lib/inkasso/address'
import { buildClaimFields } from '@/lib/inkasso/claim-fields'

describe('parseGermanAddress', () => {
  test('comma-separated "Straße, PLZ Ort"', () => {
    expect(parseGermanAddress('Musterstr. 1, 82276 Adelshofen'))
      .toEqual({ street: 'Musterstr. 1', zip: '82276', city: 'Adelshofen' })
  })
  test('space-separated', () => {
    expect(parseGermanAddress('Hauptstraße 12 10115 Berlin'))
      .toEqual({ street: 'Hauptstraße 12', zip: '10115', city: 'Berlin' })
  })
  test('newline between street and PLZ', () => {
    expect(parseGermanAddress('Lindenweg 5\n50667 Köln'))
      .toEqual({ street: 'Lindenweg 5', zip: '50667', city: 'Köln' })
  })
  test('multi-word city', () => {
    expect(parseGermanAddress('Am Markt 3, 82319 Starnberg am See'))
      .toEqual({ street: 'Am Markt 3', zip: '82319', city: 'Starnberg am See' })
  })
  test('no PLZ → everything in street, zip/city empty', () => {
    expect(parseGermanAddress('Nur eine Straße'))
      .toEqual({ street: 'Nur eine Straße', zip: '', city: '' })
  })
  test('null / empty → all empty', () => {
    expect(parseGermanAddress(null)).toEqual({ street: '', zip: '', city: '' })
    expect(parseGermanAddress('   ')).toEqual({ street: '', zip: '', city: '' })
  })
})

describe('buildClaimFields', () => {
  const NOW = '2026-06-18T09:00:00.000Z'

  test('anchors on the payment when present; §286 delay = due + 30d', () => {
    const out = buildClaimFields({
      amountCents: 5900,
      gymName: 'CSC FFB',
      payment: { invoice_number: '2026-0001-PT', issued_at: '2026-05-01', due_date: '2026-05-15', description: 'Mai-Beitrag' },
      dunningStartedAt: '2026-06-01',
      nowIso: NOW,
    })
    expect(out).toEqual({
      invoiceNumber: '2026-0001-PT',
      subjectMatter: 'Mai-Beitrag',
      issuedAt: '2026-05-01',
      dueDate: '2026-05-15',
      reminderDate: '2026-06-01',
      delayDate: '2026-06-14', // 15.05. + 30 Tage
      principalCents: 5900,
    })
  })

  test('falls back to dunning_started_at when no payment row', () => {
    const out = buildClaimFields({
      amountCents: 4200,
      gymName: 'CSC FFB',
      payment: null,
      dunningStartedAt: '2026-06-01',
      nowIso: NOW,
    })
    expect(out.invoiceNumber).toBeNull()
    expect(out.subjectMatter).toBe('Mitgliedsbeitrag CSC FFB')
    expect(out.issuedAt).toBe('2026-06-01')
    expect(out.dueDate).toBe('2026-06-01')
    expect(out.reminderDate).toBe('2026-06-01')
    expect(out.delayDate).toBe('2026-07-01') // 01.06. + 30 Tage
    expect(out.principalCents).toBe(4200)
  })

  test('falls back to today when neither payment nor dunning start exist', () => {
    const out = buildClaimFields({
      amountCents: 1000, gymName: 'X', payment: null, dunningStartedAt: null, nowIso: NOW,
    })
    expect(out.issuedAt).toBe('2026-06-18')
    expect(out.reminderDate).toBe('2026-06-18')
    expect(out.delayDate).toBe('2026-07-18')
  })
})
