import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { applyRateLimit } from '@/lib/rate-limit-handler'
import { getCachedUser } from '@/lib/auth/cached-user'
import { invalidateGym } from '@/lib/auth/cached-gym'
import type { Database } from '@/types/database'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * PATCH /api/gym/update
 *
 * Same-Origin-Endpoint für Gym-Profil-Updates aus dem Settings-Dashboard.
 * Ersetzt direkten Browser-PATCH auf supabase.co/rest/v1/gyms — der wurde
 * in Production durch eine Browser-Preflight-Cache-Inkonsistenz blockiert
 * ("Method PATCH is not allowed by Access-Control-Allow-Methods", obwohl
 * Supabase server-side PATCH erlaubt). Same-Origin = kein CORS.
 *
 * Auth: Bearer Access-Token (gleicher Pfad wie /api/avv/* — siehe
 * settings-page.tsx getSession()).
 *
 * Body: JSON-Object mit einem oder mehreren erlaubten Feldern (Whitelist).
 * Felder ausserhalb der Whitelist werden ignoriert (kein 400) — damit
 * der Caller keine konditionelle Filterlogik braucht.
 */
const ALLOWED_FIELDS = new Set<string>([
  // Grundprofil
  'name', 'address', 'phone', 'email',
  // Pricing-default (Legacy — eigentlich pro Plan in membership_plans)
  'monthly_fee_cents',
  // Public-Page
  'slug', 'logo_url', 'website_url', 'hero_title', 'hero_subtitle',
  'hero_image_url', 'hero_image_position', 'accent_color',
  'about_blocks', 'video_urls', 'public_email', 'public_phone',
  'public_address', 'social_instagram', 'social_facebook', 'social_youtube',
  // Class-/Belt-Konfig
  'class_types', 'sport_type',
  'belt_system', 'belt_system_enabled', 'stripes_enabled',
  // Signup-Workflow
  'signup_enabled',
  'contract_template', 'wellpass_agreement_template', 'trial_rules_template',
  // GPS-Check-in
  'latitude', 'longitude', 'gps_radius_meters',
  // Invoicing (NON-IBAN — IBAN läuft über /api/gym/iban)
  'tax_number', 'ustid', 'is_kleinunternehmer',
  'invoice_prefix', 'bank_bic', 'bank_name',
  // Dunning-Config
  'dunning_late_fee_cents', 'dunning_days_to_level_2', 'dunning_days_to_level_3',
  'dunning_auto_inkasso_enabled', 'dunning_days_to_inkasso',
  // Misc
  'whatsapp_group_url', 'callmebot_api_key',
])

export async function PATCH(req: Request) {
  // Rate-Limit: 30 Saves / Minute pro IP — generös für Settings-Page
  // (User klickt mehrere Save-Buttons in kurzer Folge), aber blockiert Floods.
  const rl = await applyRateLimit(req, { kind: 'gym-update', limit: 30, windowSec: 60 })
  if (rl) return rl

  // Bearer-Auth (Redis-cached, Sprint A 2026-05-30)
  const authHeader = req.headers.get('Authorization')
  const accessToken = authHeader?.replace('Bearer ', '')
  if (!accessToken) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }
  const user = await getCachedUser(accessToken)
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }
  const sb = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  )

  // Body parsen + Whitelist-Filter
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const updates: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k)) updates[k] = v
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Keine erlaubten Felder zum Update' }, { status: 400 })
  }

  // Service-Role-Update mit explizitem owner_id-Guard (Defense-in-Depth zusätzlich
  // zur "owners manage their gym" RLS-Policy). Service-Role bypasst RLS, deshalb
  // ist der Eq-Filter hier die einzige Sicherung gegen Cross-Tenant-Update.
  const service = createServiceClient()
  const { data, error } = await service
    .from('gyms')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(updates as any)
    .eq('owner_id', user.id)
    .select('id')

  if (error) {
    console.error('[api/gym/update] update failed:', error)
    return NextResponse.json({ error: 'Update fehlgeschlagen' }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Kein Gym für diesen User gefunden' }, { status: 404 })
  }

  // Sprint B 2026-05-30: Cache-Invalidation nach Schreibvorgang
  await invalidateGym({ ownerId: user.id, gymId: data[0]?.id })

  return NextResponse.json({ ok: true, updated_fields: Object.keys(updates) })
}
