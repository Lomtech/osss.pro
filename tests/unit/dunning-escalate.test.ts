/**
 * Unit tests for the pure dunning-escalation logic (src/lib/dunning/escalate).
 * The I/O part (escalateDunning) wraps these; here we lock the level/action
 * transitions so a regression in the Mahn-Eskalation fails in CI.
 */

import { describe, test, expect } from 'vitest'
import { nextDunningLevel, dunningActionType, isDueForInkassoHandoff } from '@/lib/dunning/levels'

describe('nextDunningLevel', () => {
  test('bumps by one, capped at 3', () => {
    expect(nextDunningLevel(0)).toBe(1)
    expect(nextDunningLevel(1)).toBe(2)
    expect(nextDunningLevel(2)).toBe(3)
    expect(nextDunningLevel(3)).toBe(3) // stays at max
  })
  test('treats null/undefined as level 0', () => {
    expect(nextDunningLevel(null)).toBe(1)
    expect(nextDunningLevel(undefined)).toBe(1)
  })
})

describe('dunningActionType', () => {
  test('maps the level transition to the right action', () => {
    expect(dunningActionType(0, 1)).toBe('first_reminder')
    expect(dunningActionType(1, 2)).toBe('second_reminder')
    expect(dunningActionType(2, 3)).toBe('final_warning')
  })
  test('already at level 3 → note (no further escalation, just logged)', () => {
    expect(dunningActionType(3, 3)).toBe('note')
  })
})

describe('isDueForInkassoHandoff', () => {
  const NOW = Date.UTC(2026, 5, 18) // fixed clock; pass nowMs explicitly (no Date.now())
  const day = 86_400_000
  const base = {
    enabled: true,
    dunningLevel: 3,
    amountCents: 5900,
    daysToInkasso: 14,
    nowMs: NOW,
  }

  test('due when L3, enabled, unpaid, and last action older than the window', () => {
    const lastAction = new Date(NOW - 15 * day).toISOString()
    expect(isDueForInkassoHandoff({ ...base, lastActionAt: lastAction })).toBe(true)
  })

  test('not due while still inside the window', () => {
    const lastAction = new Date(NOW - 13 * day).toISOString()
    expect(isDueForInkassoHandoff({ ...base, lastActionAt: lastAction })).toBe(false)
  })

  test('opt-out (disabled) is never due', () => {
    const lastAction = new Date(NOW - 60 * day).toISOString()
    expect(isDueForInkassoHandoff({ ...base, enabled: false, lastActionAt: lastAction })).toBe(false)
  })

  test('below level 3 is never due', () => {
    const lastAction = new Date(NOW - 60 * day).toISOString()
    expect(isDueForInkassoHandoff({ ...base, dunningLevel: 2, lastActionAt: lastAction })).toBe(false)
  })

  test('zero / missing arrears is never due', () => {
    const lastAction = new Date(NOW - 60 * day).toISOString()
    expect(isDueForInkassoHandoff({ ...base, amountCents: 0, lastActionAt: lastAction })).toBe(false)
    expect(isDueForInkassoHandoff({ ...base, amountCents: null, lastActionAt: lastAction })).toBe(false)
  })

  test('missing last action → not due (defensive)', () => {
    expect(isDueForInkassoHandoff({ ...base, lastActionAt: null })).toBe(false)
  })
})
