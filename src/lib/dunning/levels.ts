// Pure dunning level/action logic — no I/O, no 'server-only' imports, so it is
// unit-testable in isolation. escalateDunning() (escalate.ts) builds on these.

export type DunningActionType = 'first_reminder' | 'second_reminder' | 'final_warning' | 'note'

/** dunning_level after one more failed payment (capped at 3). */
export function nextDunningLevel(currentLevel: number | null | undefined): number {
  return Math.min((currentLevel ?? 0) + 1, 3)
}

/** action_type for the dunning_actions log given the level transition. */
export function dunningActionType(currentLevel: number, newLevel: number): DunningActionType {
  if (newLevel === 1) return 'first_reminder'
  if (newLevel === 2) return 'second_reminder'
  if (newLevel === 3) return currentLevel === 3 ? 'note' : 'final_warning'
  return 'note'
}
