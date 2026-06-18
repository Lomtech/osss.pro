// Paywise (paywise.de) Inkasso-Adapter.
//
// Modell (siehe docs/INKASSO_PAYWISE_MAPPING.md): osss.pro = Integrationspartner,
// jedes Gym = Paywise "Company" (Gläubiger), Mitglied = Debtor, Rechnung = Claim.
// Forderungen werden im Namen eines Gyms gestellt → Header X-User-Id = paywise_user_id.
//
// Zwei APIs:
//   Partner API      (…/partner/v1/) — Companies + Users anlegen (Onboarding)
//   Case-Mgmt API    (…/v1/)         — Debtors, Claims, Documents, Payments
//
// Status kommt per Webhook (HMAC-SHA256, Header X-Paywise-Signature: sha256=<hex>,
// Events mandate.* / claim.* / payment.*). Verifiziert gegen die echte API-Doku
// (Stand 2026-06-18). Beträge sind Dezimal-Euro-Strings ({ value: "150.00" }),
// NICHT Cent.

import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  type InkassoProvider,
  type InkassoCase,
  type SubmitResult,
  type StatusUpdate,
} from './provider'

const DEFAULT_BASE = 'https://api.paywise.de'

/** cents → Paywise decimal-euro string, e.g. 15000 → "150.00" */
function euro(cents: number): string {
  return (cents / 100).toFixed(2)
}

function constantTimeEqualHex(a: string, b: string): boolean {
  // hex of equal-length HMACs → byte-compare; length guard avoids throw
  const ab = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  if (ab.length === 0 || ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export interface PaywiseOnboardInput {
  gym: {
    name: string
    legalName?: string | null
    phone: string
    address?: { street: string; zip: string; city: string; country?: string } | null
    /** USt-IdNr — nur wenn regelbesteuert (optional) */
    vatNumber?: string | null
    /** §19 → "N" (nicht vorsteuerabzugsberechtigt), sonst "J" */
    isKleinunternehmer: boolean
    legalForm?: string | null
    legalRepresentatives?: Array<{ name: string; type?: string }>
    /** Auszahlungskonto des Gyms (Klartext-IBAN) */
    iban?: string | null
  }
  owner: { email: string; firstName: string; lastName: string }
}

export interface PaywiseOnboardResult {
  ok: boolean
  companyId?: string
  userId?: string
  dataSubmissionCompleted?: boolean
  raw: unknown
  error?: string
}

export class PaywiseProvider implements InkassoProvider {
  readonly name = 'paywise' // muss im dunning_handoffs.provider-CHECK enthalten sein

  private readonly base: string
  private readonly apiToken: string
  private readonly partnerToken: string
  private readonly webhookSecret: string

  constructor(opts?: { base?: string; apiToken?: string; partnerToken?: string; webhookSecret?: string }) {
    this.base = (opts?.base ?? process.env.INKASSO_PAYWISE_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, '')
    this.apiToken = opts?.apiToken ?? process.env.INKASSO_PAYWISE_API_TOKEN ?? ''
    this.partnerToken = opts?.partnerToken ?? process.env.INKASSO_PAYWISE_PARTNER_TOKEN ?? ''
    this.webhookSecret = opts?.webhookSecret ?? process.env.INKASSO_PAYWISE_WEBHOOK_SECRET ?? ''
  }

  /** Registriert + nutzbar, sobald der Case-Mgmt-Token da ist. */
  isConfigured(): boolean {
    return Boolean(this.apiToken)
  }

  // ── Case-Management API ────────────────────────────────────────────────────

  private async cm(
    path: string,
    method: string,
    body: unknown,
    userId?: string | null,
  ): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    }
    if (userId) headers['X-User-Id'] = userId
    const res = await fetch(`${this.base}/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, status: res.status, json }
  }

  async submitCase(c: InkassoCase): Promise<SubmitResult> {
    const claim = c.claim ?? {}
    // Paywise verlangt diese Datumsfelder zwingend — fehlen sie, gar nicht erst senden.
    const missing = (['issuedAt', 'dueDate', 'reminderDate', 'delayDate'] as const).filter(
      (k) => !claim[k],
    )
    if (missing.length > 0) {
      return {
        ok: false,
        status: 'initiated',
        raw: { error: 'missing required claim fields', missing },
        error: `Pflicht-Claim-Felder fehlen: ${missing.join(', ')}`,
      }
    }

    try {
      // 1) Debtor anlegen (Mitglied = Verbraucher)
      const debtorRes = await this.cm('/debtors/', 'POST', {
        acting_as: 'consumer',
        your_reference: c.reference,
        person: {
          first_name: c.debtor.firstName,
          last_name: c.debtor.lastName,
          birth_date: c.debtor.dateOfBirth ?? undefined,
        },
        addresses: [{
          street: c.debtor.street ?? '',
          zip: c.debtor.postalCode ?? '',
          city: c.debtor.city ?? '',
        }],
        communication_channels: [
          c.debtor.email ? { value: c.debtor.email } : null,
          c.debtor.phone ? { value: c.debtor.phone } : null,
        ].filter(Boolean),
      }, c.providerUserId)
      if (!debtorRes.ok || typeof debtorRes.json.id !== 'string') {
        return { ok: false, status: 'initiated', raw: debtorRes.json, error: `Debtor-Anlage fehlgeschlagen (HTTP ${debtorRes.status})` }
      }
      const debtorId = debtorRes.json.id

      // 2) Claim anlegen. Hauptforderung = Prinzipal (unbezahlte Rechnung);
      //    Verzugskosten überlässt v1 dem Inkasso (kein double-charging).
      const principalCents = claim.principalCents ?? c.amountCents
      const additional = claim.additionalCharges ?? []
      const additionalSum = additional.reduce((s, a) => s + a.amountCents, 0)
      const claimRes = await this.cm('/claims/', 'POST', {
        debtor: debtorId,
        your_reference: c.reference,
        subject_matter: claim.subjectMatter ?? `Mitgliedsbeitrag ${c.creditor.gymName}`,
        occurence_date: claim.issuedAt,
        document_reference: claim.invoiceNumber ?? c.reference,
        document_date: claim.issuedAt,
        due_date: claim.dueDate,
        reminder_date: claim.reminderDate,
        delay_date: claim.delayDate,
        main_claim_amount: { value: euro(principalCents) },
        total_claim_amount: { value: euro(principalCents + additionalSum) },
        starting_approach: 'extrajudicial',
        claim_disputed: false,
        obligation_fulfilled: true,
        ...(additional.length > 0
          ? {
              additional_charges: additional.map((a) => ({
                subject_matter: a.label,
                your_reference: c.reference,
                occurence_date: claim.issuedAt,
                document_date: claim.issuedAt,
                due_date: claim.dueDate,
                amount: { value: euro(a.amountCents) },
              })),
            }
          : {}),
      }, c.providerUserId)
      if (!claimRes.ok || typeof claimRes.json.id !== 'string') {
        return { ok: false, status: 'initiated', raw: claimRes.json, error: `Claim-Anlage fehlgeschlagen (HTTP ${claimRes.status})` }
      }
      const claimId = claimRes.json.id

      // 3) Belege hochladen (optional, empfohlen). Fehler hier sind NICHT fatal —
      //    der Claim steht bereits, Belege können später nachgereicht werden.
      for (const doc of c.documents ?? []) {
        try {
          const form = new FormData()
          const blob = new Blob([Buffer.from(doc.contentBase64, 'base64')], { type: doc.mimeType })
          form.append('file', blob, doc.filename) // Feldname ggf. mit Paywise verifizieren
          const upHeaders: Record<string, string> = { Authorization: `Bearer ${this.apiToken}` }
          if (c.providerUserId) upHeaders['X-User-Id'] = c.providerUserId
          await fetch(`${this.base}/v1/claims/${claimId}/documents/`, { method: 'POST', headers: upHeaders, body: form })
        } catch (e) {
          console.error('[paywise] document upload failed (non-fatal):', e instanceof Error ? e.message : e)
        }
      }

      // 4) Freigeben → submission_state = released (danach unveränderlich)
      const relRes = await this.cm(`/claims/${claimId}/`, 'PATCH', { submission_state: 'released' }, c.providerUserId)
      if (!relRes.ok) {
        // Claim existiert, Release scheiterte → trotzdem referenceId zurückgeben,
        // damit der Fall nicht verloren geht; Status bleibt initiated zum Retry.
        return { ok: false, referenceId: claimId, status: 'initiated', raw: relRes.json, error: `Release fehlgeschlagen (HTTP ${relRes.status})` }
      }

      return { ok: true, referenceId: claimId, status: 'sent_to_provider', raw: { claim: claimRes.json, release: relRes.json } }
    } catch (e) {
      return { ok: false, status: 'initiated', raw: { error: String(e) }, error: e instanceof Error ? e.message : 'network error' }
    }
  }

  // ── Webhook (HMAC-SHA256, Header X-Paywise-Signature: sha256=<hex>) ──────────

  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    if (!this.webhookSecret) return false
    const sig = headers['x-paywise-signature'] ?? ''
    if (!sig.startsWith('sha256=')) return false
    const received = sig.slice('sha256='.length)
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex')
    return constantTimeEqualHex(received, expected)
  }

  parseWebhook(payload: unknown): StatusUpdate[] | null {
    if (!payload || typeof payload !== 'object') return null
    const p = payload as Record<string, unknown>
    const event = typeof p.event === 'string' ? p.event : null
    const data = (p.data && typeof p.data === 'object' ? p.data : {}) as Record<string, unknown>
    if (!event) return null

    // reference_id = unsere gespeicherte Paywise-Claim-ID (aus submitCase). Webhook-
    // data trägt sie als claim-id oder unsere your_reference. Defensiv extrahieren.
    // (Exakte per-Event-data-Shape gegen webhooks/event-types verifizieren — §9.)
    const ref =
      (typeof data.your_reference === 'string' && data.your_reference) ||
      (typeof data.claim === 'string' && data.claim) ||
      (typeof data.claim_id === 'string' && data.claim_id) ||
      (typeof data.id === 'string' && data.id) ||
      null

    const blob = JSON.stringify(data).toLowerCase()
    let status: StatusUpdate['status'] | null = null
    switch (event) {
      case 'mandate.closed':
        // paid vs. written_off aus dem Payload ableiten, sonst neutral closed
        status = /written.?off|niedergeschlagen|abgeschrieben|storn/.test(blob)
          ? 'written_off'
          : /paid|bezahlt|ausgeglichen/.test(blob)
            ? 'paid'
            : 'closed'
        break
      case 'mandate.status_updated':
        // Mandat ist in Bearbeitung/angenommen
        status = 'accepted'
        break
      default:
        // claim.created/updated, mandate.balance_updated/message_created, payment.* →
        // keine Status-Transition (informativ).
        return []
    }
    if (!ref) return []
    return [{ referenceId: ref, status, raw: p }]
  }

  // ── Partner API — API-only-Onboarding eines Gyms ────────────────────────────
  // Voraussetzung: der Partner-Key braucht die Permission API_ONLY_ONBOARDING.
  // Ablauf: Company anlegen → ≥1 User anlegen (bekommt Invite-Mail zum Passwort-
  // Setzen). Danach ist das Gym (sobald data_submission_completed) inkasso-fähig.

  async onboardCompany(input: PaywiseOnboardInput): Promise<PaywiseOnboardResult> {
    if (!this.partnerToken) {
      return { ok: false, raw: null, error: 'INKASSO_PAYWISE_PARTNER_TOKEN fehlt' }
    }
    const partnerHeaders = { Authorization: `Bearer ${this.partnerToken}`, 'Content-Type': 'application/json' }
    try {
      // 1) Company
      const companyBody: Record<string, unknown> = {
        name: input.gym.legalName ?? input.gym.name,
        phone: input.gym.phone,
        tax_deduction_eligibility: input.gym.isKleinunternehmer ? 'N' : 'J',
        default_claim_type: 'H22', // Mitgliedsbeitrag
      }
      if (input.gym.address) companyBody.address = { country: 'DE', ...input.gym.address }
      if (input.gym.vatNumber) companyBody.vat_number = input.gym.vatNumber
      if (input.gym.legalForm) companyBody.legal_form = input.gym.legalForm
      if (input.gym.legalRepresentatives?.length) companyBody.legal_representatives = input.gym.legalRepresentatives
      if (input.gym.iban) companyBody.iban = input.gym.iban

      const cRes = await fetch(`${this.base}/partner/v1/companies/`, {
        method: 'POST', headers: partnerHeaders, body: JSON.stringify(companyBody),
      })
      const cJson = (await cRes.json().catch(() => ({}))) as Record<string, unknown>
      if (!cRes.ok || typeof cJson.id !== 'string') {
        return { ok: false, raw: cJson, error: `Company-Anlage fehlgeschlagen (HTTP ${cRes.status})` }
      }
      const companyId = cJson.id

      // 2) User (braucht API_ONLY_ONBOARDING-Permission)
      const uRes = await fetch(`${this.base}/partner/v1/users/`, {
        method: 'POST', headers: partnerHeaders,
        body: JSON.stringify({
          email: input.owner.email,
          first_name: input.owner.firstName,
          last_name: input.owner.lastName,
          company: companyId,
        }),
      })
      const uJson = (await uRes.json().catch(() => ({}))) as Record<string, unknown>
      if (!uRes.ok || typeof uJson.id !== 'string') {
        return { ok: false, companyId, raw: uJson, error: `User-Anlage fehlgeschlagen (HTTP ${uRes.status})` }
      }

      return {
        ok: true,
        companyId,
        userId: uJson.id,
        dataSubmissionCompleted: cJson.data_submission_completed === true,
        raw: { company: cJson, user: uJson },
      }
    } catch (e) {
      return { ok: false, raw: { error: String(e) }, error: e instanceof Error ? e.message : 'network error' }
    }
  }
}
