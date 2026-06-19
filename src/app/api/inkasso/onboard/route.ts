import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { getCachedUser } from '@/lib/auth/cached-user'
import { getCachedGymForOwner } from '@/lib/auth/cached-gym'
import { getIbanFromGym } from '@/lib/encryption'
import { PaywiseProvider } from '@/lib/inkasso'

// POST /api/inkasso/onboard
//
// API-only-Onboarding eines Gyms bei Paywise (Partner-API): legt die Company +
// einen User (Gym-Owner) an und speichert company_id/user_id/consent am Gym.
// Damit ist das Gym anschließend inkasso-fähig (Forderungen via Case-Mgmt-API).
//
// Voraussetzung: INKASSO_PAYWISE_PARTNER_TOKEN gesetzt + Key hat die Permission
// API_ONLY_ONBOARDING (sonst antwortet Paywise mit 400 beim User-Anlegen).
// Idempotent: bereits verbundene Gyms geben ihren bestehenden Stand zurück.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authSupabase(token: string) {
  return createAuthClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  )
}

export async function POST(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  const user = await getCachedUser(token)
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const gymCached = await getCachedGymForOwner(user.id)
  if (!gymCached) return NextResponse.json({ error: 'Kein Gym' }, { status: 404 })

  const service = createServiceClient()
  // Vollen Gym-Datensatz holen (CachedGym hat nicht alle KYC-Felder).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: gym } = await (service.from('gyms') as any)
    .select('id, name, legal_name, phone, address, legal_address, ustid, is_kleinunternehmer, bank_iban_enc, bank_bic, bank_name, paywise_company_id, paywise_user_id, paywise_status')
    .eq('id', gymCached.id)
    .maybeSingle()
  if (!gym) return NextResponse.json({ error: 'Gym nicht gefunden' }, { status: 404 })

  // Idempotenz: schon verbunden → bestehenden Stand zurückgeben.
  if (gym.paywise_company_id) {
    return NextResponse.json({
      ok: true,
      already_connected: true,
      company_id: gym.paywise_company_id,
      user_id: gym.paywise_user_id,
      status: gym.paywise_status,
    })
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const legalForm = str(body.legal_form)
  const legalRepName = str(body.legal_representative_name)
  const ownerFirstName = str(body.owner_first_name)
  const ownerLastName = str(body.owner_last_name)

  if (!ownerFirstName || !ownerLastName) {
    return NextResponse.json({ error: 'Vor- und Nachname des Inhabers sind erforderlich' }, { status: 400 })
  }
  if (!gym.phone) {
    return NextResponse.json({ error: 'Telefonnummer des Gyms fehlt (in den Einstellungen ergänzen)' }, { status: 400 })
  }

  const paywise = new PaywiseProvider()
  const result = await paywise.onboardCompany({
    gym: {
      name: gym.name ?? 'Studio',
      legalName: gym.legal_name ?? null,
      phone: gym.phone,
      // strukturierte Adresse erheben wir hier (noch) nicht zwingend — Paywise
      // kann sie im Web-Profil ergänzen; legal_address als Freitext mitgeben.
      vatNumber: gym.ustid ?? null,
      isKleinunternehmer: gym.is_kleinunternehmer === true,
      legalForm: legalForm || null,
      legalRepresentatives: legalRepName ? [{ name: legalRepName }] : undefined,
      iban: getIbanFromGym(gym) || null,
    },
    owner: { email: user.email ?? '', firstName: ownerFirstName, lastName: ownerLastName },
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Onboarding fehlgeschlagen', detail: result.raw }, { status: 502 })
  }

  const nowIso = new Date().toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updErr } = await (service.from('gyms') as any)
    .update({
      paywise_company_id: result.companyId,
      paywise_user_id: result.userId,
      paywise_status: result.dataSubmissionCompleted ? 'active' : 'pending',
      paywise_consent_at: nowIso,
      paywise_webhook_id: result.webhookId ?? null,
      paywise_webhook_secret: result.webhookSecret ?? null,
    })
    .eq('id', gym.id)
  if (updErr) {
    // Company ist bei Paywise angelegt, aber wir konnten sie nicht speichern —
    // klar melden, damit kein Doppel-Onboarding passiert.
    return NextResponse.json({
      error: 'Company angelegt, aber Speichern fehlgeschlagen — bitte Support kontaktieren',
      company_id: result.companyId,
      detail: updErr.message,
    }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    company_id: result.companyId,
    user_id: result.userId,
    status: result.dataSubmissionCompleted ? 'active' : 'pending',
    note: 'Der Inhaber erhält eine Einladungs-Mail von Paywise zum Setzen des Passworts.',
  })
}
