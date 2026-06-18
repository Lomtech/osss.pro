import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { cronGuard } from '@/lib/cron-guard'
import { withCronSentry } from '@/lib/cron/with-sentry'
import { sendDunningMail } from '@/lib/dunning-mail'
import { isDueForInkassoHandoff } from '@/lib/dunning/levels'
import { getApiProvider, buildReference, type InkassoCase } from '@/lib/inkasso'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/cron/dunning-escalation
 *
 * Auto-Eskaliert Mahnstufen nach Frist-Ablauf — Fristen pro Gym
 * konfigurierbar via `gyms.dunning_days_to_level_2/3`:
 *  - Level 1, last_action älter `gym.dunning_days_to_level_2` Tage → Level 2
 *  - Level 2, started_at  älter `gym.dunning_days_to_level_3` Tage → Level 3
 *  - Level 3, last_action älter `gym.dunning_days_to_inkasso` Tage → automatische
 *    Inkasso-Übergabe (dunning_handoff) — NUR wenn `gym.dunning_auto_inkasso_enabled`.
 *    Ohne Opt-in bleibt die Übergabe manuell (unverändert).
 *
 * Defaults: 14d / 28d (durch DB-Defaults gesetzt, hier nur als Fallback
 * gegen NULL-Werte aus älteren Rows, die theoretisch nicht existieren
 * sollten — wir sind defensiv).
 *
 * Vercel-Cron: täglich 08:00 UTC (= 09:00 Berlin im Winter, 10:00 im Sommer).
 * Auth: Bearer ${CRON_SECRET} (Vercel-Standard, via cronGuard).
 *
 * Idempotenz:
 *  - DB-Level via cron_runs(job_name, executed_at) UNIQUE → 2× Aufruf am gleichen Tag = early-return.
 *  - Logik-Level: nach Update ist dunning_last_action_at = now → Filter matcht nicht mehr.
 */
export const GET = withCronSentry('dunning-escalation', async (req: Request) => {
  const guard = cronGuard(req)
  if (guard) return guard

  const todayKey = new Date().toISOString().split('T')[0]
  const supabase = createServiceClient()

  // ── DB-Level Dedup: ein Run pro Kalendertag (gegen Race-Conditions bei parallelen Cron-Triggern)
  const { error: dedupErr } = await supabase
    .from('cron_runs')
    .insert({ job_name: 'dunning_escalation', executed_at: todayKey })
  if (dedupErr) {
    if (dedupErr.code === '23505') {
      return NextResponse.json({ skipped: true, reason: 'already ran today' })
    }
    return NextResponse.json({ error: dedupErr.message }, { status: 500 })
  }

  const now = new Date()
  const nowMs = now.getTime()

  // ── Gym-Config in Map laden — vermeidet N+1 SELECTs.
  // dunning_days_to_level_2/3 sind NOT NULL DEFAULT in der DB; defensive
  // Fallbacks (14/28) decken uns ab, falls eine Row diese Defaults verletzt.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: gymsRows, error: gymsErr } = await (supabase.from('gyms') as any)
    .select('id, name, dunning_days_to_level_2, dunning_days_to_level_3, dunning_auto_inkasso_enabled, dunning_days_to_inkasso, paywise_user_id')

  const errors: string[] = []
  if (gymsErr) {
    errors.push(`gyms query: ${gymsErr.message}`)
  }

  type GymCfg = {
    l2Days: number
    l3Days: number
    inkassoDays: number
    autoInkasso: boolean
    name: string | null
    paywiseUserId: string | null
  }
  const gymConfig = new Map<string, GymCfg>()
  for (const g of (gymsRows ?? []) as Array<{
    id: string
    name: string | null
    dunning_days_to_level_2: number | null
    dunning_days_to_level_3: number | null
    dunning_auto_inkasso_enabled: boolean | null
    dunning_days_to_inkasso: number | null
    paywise_user_id: string | null
  }>) {
    gymConfig.set(g.id, {
      l2Days: typeof g.dunning_days_to_level_2 === 'number' ? g.dunning_days_to_level_2 : 14,
      l3Days: typeof g.dunning_days_to_level_3 === 'number' ? g.dunning_days_to_level_3 : 28,
      inkassoDays: typeof g.dunning_days_to_inkasso === 'number' ? g.dunning_days_to_inkasso : 14,
      autoInkasso: g.dunning_auto_inkasso_enabled === true,
      name: g.name ?? null,
      paywiseUserId: g.paywise_user_id ?? null,
    })
  }

  // Default für Member, deren Gym (theoretisch) nicht in der Map ist —
  // sollte nicht passieren wegen FK, aber defensive Programmierung.
  const fallbackCfg: GymCfg = { l2Days: 14, l3Days: 28, inkassoDays: 14, autoInkasso: false, name: null, paywiseUserId: null }

  let escalatedToLevel2 = 0
  let escalatedToLevel3 = 0

  // ── Level 1 → 2: alle L1-Member laden, pro-Gym-Frist clientseitig prüfen
  // Wir laden ALLE L1-Member (kein date-Filter), weil die Frist pro Gym
  // unterschiedlich ist. Hard limit 2000, um runaway zu vermeiden.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: level1Members, error: l1Err } = await (supabase.from('members') as any)
    .select('id, gym_id, dunning_amount_cents, dunning_last_action_at')
    .eq('dunning_level', 1)
    .not('dunning_last_action_at', 'is', null)
    .limit(2000)

  if (l1Err) {
    errors.push(`L1 query: ${l1Err.message}`)
  }

  for (const m of (level1Members ?? []) as Array<{
    id: string
    gym_id: string
    dunning_amount_cents: number | null
    dunning_last_action_at: string | null
  }>) {
    try {
      if (!m.dunning_last_action_at) continue
      const cfg = gymConfig.get(m.gym_id) ?? fallbackCfg
      const cutoffMs = nowMs - cfg.l2Days * 86400000
      const lastActionMs = new Date(m.dunning_last_action_at).getTime()
      if (lastActionMs >= cutoffMs) continue // Frist noch nicht abgelaufen

      const amount = m.dunning_amount_cents ?? 0
      const { error: insErr } = await supabase.from('dunning_actions').insert({
        member_id: m.id,
        gym_id: m.gym_id,
        action_type: 'second_reminder',
        amount_cents: amount,
        notes: `Auto-Eskalation: ${cfg.l2Days} Tage seit 1. Mahnung ohne Reaktion`,
        performed_by: null,
      })
      if (insErr) throw new Error(`insert dunning_action: ${insErr.message}`)

      const { error: updErr } = await supabase
        .from('members')
        .update({
          dunning_level: 2,
          dunning_last_action_at: now.toISOString(),
        })
        .eq('id', m.id)
      if (updErr) throw new Error(`update member: ${updErr.message}`)

      escalatedToLevel2++

      // Audit 2026-05-11: dynamic import war defensive (sibling-agent-Era).
      // Modul existiert stabil → static import oben.
      await sendDunningMail(m.id, 2, amount).catch(err => {
        console.warn(`[cron/dunning-escalation] mail level=2 member=${m.id} failed:`, err)
      })
    } catch (err) {
      errors.push(`L1→L2 ${m.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Level 2 → 3: Frist relativ zu started_at, pro-Gym
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: level2Members, error: l2Err } = await (supabase.from('members') as any)
    .select('id, gym_id, dunning_amount_cents, dunning_started_at')
    .eq('dunning_level', 2)
    .not('dunning_started_at', 'is', null)
    .limit(2000)

  if (l2Err) {
    errors.push(`L2 query: ${l2Err.message}`)
  }

  for (const m of (level2Members ?? []) as Array<{
    id: string
    gym_id: string
    dunning_amount_cents: number | null
    dunning_started_at: string | null
  }>) {
    try {
      if (!m.dunning_started_at) continue
      const cfg = gymConfig.get(m.gym_id) ?? fallbackCfg
      const cutoffMs = nowMs - cfg.l3Days * 86400000
      const startedMs = new Date(m.dunning_started_at).getTime()
      if (startedMs >= cutoffMs) continue

      const amount = m.dunning_amount_cents ?? 0
      const { error: insErr } = await supabase.from('dunning_actions').insert({
        member_id: m.id,
        gym_id: m.gym_id,
        action_type: 'final_warning',
        amount_cents: amount,
        notes: `Auto-Eskalation: ${cfg.l3Days} Tage seit Mahn-Beginn — letzte Mahnung vor Inkasso`,
        performed_by: null,
      })
      if (insErr) throw new Error(`insert dunning_action: ${insErr.message}`)

      const { error: updErr } = await supabase
        .from('members')
        .update({
          dunning_level: 3,
          dunning_last_action_at: now.toISOString(),
        })
        .eq('id', m.id)
      if (updErr) throw new Error(`update member: ${updErr.message}`)

      escalatedToLevel3++

      await sendDunningMail(m.id, 3, amount).catch(err => {
        console.warn(`[cron/dunning-escalation] mail level=3 member=${m.id} failed:`, err)
      })
    } catch (err) {
      errors.push(`L2→L3 ${m.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Level 3 → Inkasso-Auto-Übergabe (opt-in pro Gym) ──
  // Für Gyms mit `dunning_auto_inkasso_enabled`: nach `dunning_days_to_inkasso`
  // Tagen seit der letzten Mahnung wird automatisch ein dunning_handoff angelegt
  // — und, falls ein API-Provider (Paywise) konfiguriert ist, direkt übergeben.
  // Idempotent: kein zweiter Handoff, solange ein offener (nicht
  // rejected/written_off/closed) existiert.
  let autoInkassoHandoffs = 0
  const hasAutoGym = [...gymConfig.values()].some(c => c.autoInkasso)
  if (hasAutoGym) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: level3Members, error: l3hErr } = await (supabase.from('members') as any)
      .select('id, gym_id, first_name, last_name, email, phone, date_of_birth, address, dunning_amount_cents, dunning_last_action_at')
      .eq('dunning_level', 3)
      .not('dunning_last_action_at', 'is', null)
      .limit(2000)
    if (l3hErr) errors.push(`L3 handoff query: ${l3hErr.message}`)

    for (const m of (level3Members ?? []) as Array<{
      id: string
      gym_id: string
      first_name: string | null
      last_name: string | null
      email: string | null
      phone: string | null
      date_of_birth: string | null
      address: string | null
      dunning_amount_cents: number | null
      dunning_last_action_at: string | null
    }>) {
      try {
        const cfg = gymConfig.get(m.gym_id) ?? fallbackCfg
        const amount = m.dunning_amount_cents ?? 0
        if (!isDueForInkassoHandoff({
          enabled: cfg.autoInkasso,
          dunningLevel: 3,
          amountCents: amount,
          lastActionAt: m.dunning_last_action_at,
          daysToInkasso: cfg.inkassoDays,
          nowMs,
        })) continue

        // Idempotenz: existiert schon ein offener Handoff?
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing } = await (supabase.from('dunning_handoffs') as any)
          .select('id')
          .eq('member_id', m.id)
          .not('status', 'in', '(rejected,written_off,closed)')
          .limit(1)
        if (existing && existing.length > 0) continue

        const nowIso = now.toISOString()
        const provider = 'paywise'

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const insertRes = await (supabase.from('dunning_handoffs') as any).insert({
          gym_id: m.gym_id,
          member_id: m.id,
          provider,
          status: 'initiated',
          amount_cents: amount,
          notes: `Auto-Übergabe: ${cfg.inkassoDays} Tage seit letzter Mahnung ohne Zahlung`,
          initiated_by: null,
          initiated_at: nowIso,
          last_status_change_at: nowIso,
        }).select().single()
        if (insertRes.error) throw new Error(`insert handoff: ${insertRes.error.message}`)
        const handoff = insertRes.data

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('dunning_actions') as any).insert({
          gym_id: m.gym_id,
          member_id: m.id,
          action_type: 'collection_handoff',
          amount_cents: amount,
          notes: `Automatische Übergabe an ${provider}. Handoff-ID: ${handoff.id}`,
          performed_by: null,
        })

        // Direkt übergeben, falls ein API-Provider konfiguriert ist. Sonst bleibt
        // der Handoff 'initiated' (PDF-Fallback / Submit über den angereicherten
        // Pfad, sobald Keys + Claim-Felder da sind — siehe INKASSO_PAYWISE_MAPPING §10).
        const apiProvider = getApiProvider(provider)
        if (apiProvider) {
          const inkassoCase: InkassoCase = {
            handoffId: handoff.id,
            gymId: m.gym_id,
            memberId: m.id,
            amountCents: amount,
            reference: buildReference(m.gym_id, handoff.id),
            debtor: {
              firstName: m.first_name ?? '',
              lastName: m.last_name ?? '',
              email: m.email,
              phone: m.phone,
              dateOfBirth: m.date_of_birth,
              street: m.address,
            },
            creditor: { gymName: cfg.name ?? 'Studio' },
            providerUserId: cfg.paywiseUserId,
          }
          const submit = await apiProvider.submitCase(inkassoCase).catch((e: unknown) => ({
            ok: false as const, status: 'initiated' as const, raw: { error: String(e) },
            error: e instanceof Error ? e.message : 'submit failed',
          }))
          const patch = submit.ok
            ? { status: submit.status, reference_id: submit.referenceId ?? null, provider_response: submit.raw, sent_at: nowIso, last_status_change_at: nowIso }
            : { provider_response: submit.raw, last_status_change_at: nowIso }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('dunning_handoffs') as any).update(patch).eq('id', handoff.id)
        }

        // last_action bumpen → re-qualifiziert nicht sofort wieder (belt + braces
        // neben dem Open-Handoff-Guard).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('members') as any).update({ dunning_last_action_at: nowIso }).eq('id', m.id)

        autoInkassoHandoffs++
      } catch (err) {
        errors.push(`L3→Inkasso ${m.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    date: todayKey,
    escalated_to_level_2: escalatedToLevel2,
    escalated_to_level_3: escalatedToLevel3,
    auto_inkasso_handoffs: autoInkassoHandoffs,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  })
})
