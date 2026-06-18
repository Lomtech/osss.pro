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

/**
 * Pure decision: is a member at the final dunning stage (3) due for automatic
 * hand-over to Inkasso now? Used by the dunning-escalation cron. Deterministic,
 * no I/O — the cron does the idempotency check (no open handoff) + the hand-over.
 */
export function isDueForInkassoHandoff(input: {
  /** gym.dunning_auto_inkasso_enabled — opt-in; false → never */
  enabled: boolean
  dunningLevel: number | null | undefined
  /** open arrears in cents; must be > 0 */
  amountCents: number | null | undefined
  /** when the last (final) dunning action happened — ISO string */
  lastActionAt: string | null | undefined
  /** gym.dunning_days_to_inkasso */
  daysToInkasso: number
  nowMs: number
}): boolean {
  if (!input.enabled) return false
  if ((input.dunningLevel ?? 0) < 3) return false
  if ((input.amountCents ?? 0) <= 0) return false
  if (!input.lastActionAt) return false
  const cutoffMs = input.nowMs - input.daysToInkasso * 86_400_000
  return new Date(input.lastActionAt).getTime() < cutoffMs
}
