/**
 * Unit tests for the pure dunning-escalation logic (src/lib/dunning/escalate).
 * The I/O part (escalateDunning) wraps these; here we lock the level/action
 * transitions so a regression in the Mahn-Eskalation fails in CI.
 */

import { describe, test, expect } from 'vitest'
import { nextDunningLevel, dunningActionType } from '@/lib/dunning/levels'

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
