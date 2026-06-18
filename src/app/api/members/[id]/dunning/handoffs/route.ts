import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { getCachedUser } from '@/lib/auth/cached-user'
import { getCachedGymForOwner } from '@/lib/auth/cached-gym'
import { getApiProvider } from '@/lib/inkasso'
import { assembleInkassoCase } from '@/lib/inkasso/assemble'

// Bearer-Auth statt Cookie-Auth (CORS-resistent gegen Browser-Extensions).
function authSupabase(token: string) {
  return createAuthClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

// API für externe Inkasso-Übergabe (Feature #2/#3, Sprint 2026-05-27).
// Stufe-4 nach 3-Stufen-internem-Mahnwesen. Erzeugt eine handoffs-Row mit
// Lifecycle-Tracking + zusätzliche dunning_actions Audit-Zeile.
//
// Pattern: Cookie-Auth (consistent mit /api/members/[id]/dunning) + Service-Role
// für Schreibops nach Owner-Verify.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_PROVIDERS = new Set([
  'sport_alliance', 'fair_pay', 'eos', 'creditreform',
  'riverty', 'manual', 'other', 'paywise',
])

/**
 * GET /api/members/[id]/dunning/handoffs
 * → Alle Inkasso-Übergaben dieses Mitglieds (chronologisch).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: memberId } = await params
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  // Redis-cached, Sprint A 2026-05-30
  const user = await getCachedUser(token)
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  const supabase = authSupabase(token)

  const gym = await getCachedGymForOwner(user.id)
  if (!gym) return NextResponse.json({ error: 'Kein Gym' }, { status: 404 })

  const service = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (service.from('dunning_handoffs') as any)
    .select('*')
    .eq('member_id', memberId)
    .eq('gym_id', gym.id)
    .order('last_status_change_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ handoffs: data ?? [] })
}

/**
 * POST /api/members/[id]/dunning/handoffs
 * Body: { provider, amount_cents, notes? }
 * → Erzeugt handoffs-Row (status='initiated') + dunning_actions Audit-Eintrag.
 * → PDF kann separat über /api/members/[id]/dunning/handoff-pdf abgerufen werden.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: memberId } = await params
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  // Redis-cached, Sprint A 2026-05-30
  const user = await getCachedUser(token)
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  const supabase = authSupabase(token)

  const gym = await getCachedGymForOwner(user.id)
  if (!gym) return NextResponse.json({ error: 'Kein Gym' }, { status: 404 })

  // Verify member belongs to gym
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: member } = await (supabase.from('members') as any)
    .select('id, gym_id, first_name, last_name, email, phone, date_of_birth, address, dunning_started_at')
    .eq('id', memberId).maybeSingle()
  if (!member || member.gym_id !== gym.id) {
    return NextResponse.json({ error: 'Mitglied nicht gefunden' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const provider = typeof body.provider === 'string' ? body.provider : ''
  const amountCentsRaw = body.amount_cents
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 5000) : null

  if (!VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({
      error: `provider muss einer von: ${Array.from(VALID_PROVIDERS).join(', ')}`,
    }, { status: 400 })
  }
  const amount_cents = typeof amountCentsRaw === 'number' && amountCentsRaw > 0
    ? Math.floor(amountCentsRaw)
    : null
  if (!amount_cents) {
    return NextResponse.json({ error: 'amount_cents > 0 erforderlich' }, { status: 400 })
  }

  const service = createServiceClient()
  const nowIso = new Date().toISOString()

  // 1. handoffs-Row anlegen
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertRes = await (service.from('dunning_handoffs') as any).insert({
    gym_id: gym.id,
    member_id: memberId,
    provider,
    status: 'initiated',
    amount_cents,
    notes,
    initiated_by: user.id,
    initiated_at: nowIso,
    last_status_change_at: nowIso,
  }).select().single()

  if (insertRes.error) {
    return NextResponse.json({ error: insertRes.error.message }, { status: 500 })
  }
  const handoff = insertRes.data

  // 2. Audit-Eintrag in dunning_actions (für History-Sicht im Dunning-Tab)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actionRes = await (service.from('dunning_actions') as any).insert({
    gym_id: gym.id,
    member_id: memberId,
    action_type: 'collection_handoff',
    amount_cents,
    notes: `Übergeben an ${provider}. Handoff-ID: ${handoff.id}${notes ? ` · ${notes}` : ''}`,
    performed_by: user.id,
    performed_at: nowIso,
  })
  if (actionRes.error) {
    console.error('[dunning/handoffs] dunning_actions audit insert failed:', actionRes.error.message)
    // Best-effort — handoff selbst ist drin, lass nicht den ganzen Request scheitern
  }

  // 3. API-Übergabe — NUR wenn für diesen Anbieter ein Provider-Adapter mit
  //    Credentials registriert ist. Sonst (manual / kein Vertrag): PDF-Fallback,
  //    Verhalten unverändert. Fehler hier sind nicht-fatal (handoff bleibt drin).
  let current = handoff
  let nextStep =
    provider === 'manual'
      ? 'PDF herunterladen und manuell an Inkasso-Anbieter senden.'
      : `Kein API-Vertrag für ${provider} konfiguriert — PDF herunterladen + manuell ans Provider-System übermitteln.`

  const apiProvider = getApiProvider(provider)
  if (apiProvider) {
    const inkassoCase = await assembleInkassoCase(service, {
      handoffId: handoff.id,
      gymId: gym.id,
      amountCents: amount_cents,
      notes,
      member,
      gymName: gym.name ?? null,
    })
    const submitRes = await apiProvider.submitCase(inkassoCase).catch((e: unknown) => ({
      ok: false as const,
      status: 'initiated' as const,
      raw: { error: String(e) },
      error: e instanceof Error ? e.message : 'submit failed',
    }))

    const patch = submitRes.ok
      ? {
          status: submitRes.status,
          reference_id: submitRes.referenceId ?? null,
          provider_response: submitRes.raw,
          sent_at: nowIso,
          last_status_change_at: nowIso,
        }
      : { provider_response: submitRes.raw, last_status_change_at: nowIso }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upd = await (service.from('dunning_handoffs') as any)
      .update(patch).eq('id', handoff.id).select().single()
    if (!upd.error && upd.data) current = upd.data

    nextStep = submitRes.ok
      ? `Fall an ${provider} übergeben (Referenz ${submitRes.referenceId}). Status-Updates kommen per Webhook.`
      : `Übergabe an ${provider} fehlgeschlagen: ${submitRes.error}. PDF-Fallback verfügbar.`
  }

  // 4. PDF bleibt unter /api/members/[id]/dunning/handoff-pdf abrufbar
  return NextResponse.json({
    ok: true,
    handoff: current,
    pdf_url: `/api/members/${memberId}/dunning/handoff-pdf?handoff_id=${handoff.id}`,
    next_step: nextStep,
  })
}
