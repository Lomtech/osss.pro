import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getApiProvider, type HandoffStatus } from '@/lib/inkasso'

// Inbound Inkasso provider webhook — provider-agnostic.
//   POST /api/inkasso/webhook/<provider>
// The provider posts status updates for cases it received. We dispatch to the
// matching adapter's verifyWebhook() (signature/secret) + parseWebhook()
// (payload → StatusUpdate[]), then patch the dunning_handoffs rows by their
// reference_id. No user auth — authenticity comes from the provider signature.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// status → which timestamp column to stamp on transition
function timestampPatch(status: HandoffStatus, nowIso: string): Record<string, string> {
  switch (status) {
    case 'accepted':
      return { accepted_at: nowIso }
    case 'paid':
    case 'written_off':
    case 'closed':
      return { closed_at: nowIso }
    default:
      return {}
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerName } = await params

  const adapter = getApiProvider(providerName)
  if (!adapter) {
    return NextResponse.json({ error: 'Unbekannter oder nicht konfigurierter Provider' }, { status: 404 })
  }

  const rawBody = await req.text()
  const headers: Record<string, string> = {}
  req.headers.forEach((v, k) => { headers[k.toLowerCase()] = v })

  const service = createServiceClient()

  // 1. Authenticity. Provider mit PER-TENANT-Secret (Paywise: ein Webhook + Secret
  //    pro Gym/Company): tenant-id (company_id) aus dem Body ziehen → das pro-Gym
  //    gespeicherte Secret nachschlagen → damit HMAC verifizieren. Eine gefälschte
  //    company_id matcht kein gültiges Secret. Sonst: globaler verifyWebhook
  //    (Env-Secret / Sandbox-Shared-Secret).
  let verified = false
  if (adapter.getWebhookTenantId && adapter.verifyWebhookWithSecret) {
    const tenantId = adapter.getWebhookTenantId(rawBody)
    if (tenantId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: gym } = await (service.from('gyms') as any)
        .select('paywise_webhook_secret')
        .eq('paywise_company_id', tenantId)
        .maybeSingle()
      const secret = gym?.paywise_webhook_secret
      if (secret) verified = adapter.verifyWebhookWithSecret(rawBody, headers, secret)
    }
    // Fallback aufs Env-Secret, falls (noch) kein pro-Gym-Secret hinterlegt ist
    if (!verified && adapter.verifyWebhook) verified = adapter.verifyWebhook(rawBody, headers)
  } else {
    verified = adapter.verifyWebhook?.(rawBody, headers) ?? false
  }
  if (!verified) {
    return NextResponse.json({ error: 'Signatur ungültig' }, { status: 401 })
  }

  // 2. Parse payload → status updates
  let payload: unknown
  try {
    payload = rawBody ? JSON.parse(rawBody) : null
  } catch {
    return NextResponse.json({ error: 'Body ist kein gültiges JSON' }, { status: 400 })
  }
  const updates = adapter.parseWebhook?.(payload, headers) ?? null
  if (updates === null) {
    return NextResponse.json({ error: 'Body ist kein verwertbares Event' }, { status: 400 })
  }
  // Erkanntes Event ohne Status-Transition → ACK (200), damit der Provider nicht
  // unnötig retryt (statt früherem 400).
  if (updates.length === 0) {
    return NextResponse.json({ ok: true, applied: 0, note: 'acknowledged (no status transition)' })
  }

  // 3. Apply each update to the matching handoff (by provider + reference_id)
  const nowIso = new Date().toISOString()
  let applied = 0
  const misses: string[] = []

  for (const u of updates) {
    const patch = {
      status: u.status,
      provider_response: u.raw,
      last_status_change_at: nowIso,
      ...timestampPatch(u.status, nowIso),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (service.from('dunning_handoffs') as any)
      .update(patch)
      .eq('provider', providerName)
      .eq('reference_id', u.referenceId)
      .select('id')
    if (res.error) {
      console.error('[inkasso/webhook] update failed:', res.error.message)
      misses.push(u.referenceId)
    } else if (!res.data || res.data.length === 0) {
      misses.push(u.referenceId)
    } else {
      applied += res.data.length
    }
  }

  return NextResponse.json({ ok: true, applied, unmatched: misses })
}
