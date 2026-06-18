import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { sendDunningMail } from '@/lib/dunning-mail'
import { nextDunningLevel, dunningActionType } from './levels'

// Shared dunning-escalation logic. Used by the Stripe webhook for BOTH
// invoice.payment_failed (subscription dues) AND payment_intent.payment_failed
// (one-time / manual SEPA charges) — so no failed payment slips past the
// dunning flow and silently turns into arrears.
//
// NOTE: charge.refunded is intentionally NOT escalated — a refund is usually a
// deliberate merchant action, not a non-payment.
// Pure level/action helpers live in ./levels (unit-tested without server-only).

/**
 * Escalate a member's dunning state after a failed payment: bump dunning_level,
 * accumulate the outstanding amount, log a dunning_actions row, send the dunning
 * mail. All I/O errors are swallowed + logged — the caller (Stripe webhook) MUST
 * still return 200 (stripe_events dedup prevents replays).
 */
export async function escalateDunning(
  supabase: SupabaseClient<Database>,
  memberId: string,
  failedAmountCents: number,
  sourceNote: string,
): Promise<void> {
  try {
    const { data: row } = await supabase
      .from('members')
      .select('dunning_level, dunning_amount_cents, dunning_started_at, gym_id')
      .eq('id', memberId)
      .maybeSingle()

    const currentLevel = (row as { dunning_level?: number | null } | null)?.dunning_level ?? 0
    const newLevel = nextDunningLevel(currentLevel)
    const actionType = dunningActionType(currentLevel, newLevel)
    const prevAmount = (row as { dunning_amount_cents?: number | null } | null)?.dunning_amount_cents ?? 0
    const gymId = (row as { gym_id?: string | null } | null)?.gym_id ?? null
    const nowIso = new Date().toISOString()

    const { error: actErr } = await supabase.from('dunning_actions').insert({
      member_id: memberId,
      gym_id: gymId,
      action_type: actionType,
      amount_cents: failedAmountCents,
      notes: `Auto-Trigger: ${sourceNote}`,
      performed_by: null,
    } as never)
    if (actErr) console.error('[escalateDunning] dunning_actions insert failed:', actErr)

    const updates: Record<string, unknown> = {
      dunning_level: newLevel,
      dunning_amount_cents: prevAmount + failedAmountCents,
      dunning_last_action_at: nowIso,
    }
    if (!(row as { dunning_started_at?: string | null } | null)?.dunning_started_at) {
      updates.dunning_started_at = nowIso
    }
    const { error: updErr } = await supabase.from('members').update(updates as never).eq('id', memberId)
    if (updErr) console.error('[escalateDunning] members update failed:', updErr)

    await sendDunningMail(memberId, newLevel, failedAmountCents).catch((e: unknown) =>
      console.error('[escalateDunning] dunning mail failed (non-critical):', e),
    )
  } catch (e) {
    console.error('[escalateDunning] failed (non-critical):', e)
  }
}
