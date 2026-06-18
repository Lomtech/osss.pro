// Inkasso provider abstraction — provider-agnostic scaffold.
//
// Reality check (recherchiert 2026-06-03): every serious German Inkasso
// provider (Finion FairPay, debtist, Collectia, …) gates its API behind a
// signed contract + provisioned credentials. There is no self-serve REST
// signup. So this layer is built provider-agnostic: a real provider is added
// as a small adapter implementing `InkassoProvider`, registered only when its
// credentials are present in the environment. Until then, the handoff flow
// falls back to the manual PDF dossier (unchanged behaviour).
//
// dunning_handoffs lifecycle (live CHECK constraint, verified via MCP):
//   initiated → pdf_exported → sent_to_provider → accepted | rejected
//             → paid | written_off → closed
// `reference_id` (text)      = the provider's external case id
// `provider_response` (jsonb)= raw provider payload (audit)
// `sent_at` (timestamptz)    = when the case was submitted via API

export const HANDOFF_STATUSES = [
  'initiated',
  'pdf_exported',
  'sent_to_provider',
  'accepted',
  'rejected',
  'paid',
  'written_off',
  'closed',
] as const

export type HandoffStatus = (typeof HANDOFF_STATUSES)[number]

export function isHandoffStatus(s: string): s is HandoffStatus {
  return (HANDOFF_STATUSES as readonly string[]).includes(s)
}

/** Everything a provider needs to open a collection case. Assembled by the
 *  caller from member + gym + claim data (the same data the dossier PDF uses). */
export interface InkassoCase {
  /** our dunning_handoffs.id — round-tripped so webhooks can map back */
  handoffId: string
  gymId: string
  memberId: string
  /** total claim in cents (principal + dunning fees + interest) */
  amountCents: number
  /** stable human reference we control, e.g. "OSSS-<gym>-<handoff>" */
  reference: string
  debtor: {
    firstName: string
    lastName: string
    email?: string | null
    phone?: string | null
    street?: string | null
    postalCode?: string | null
    city?: string | null
    dateOfBirth?: string | null
  }
  creditor: {
    gymName: string
    legalName?: string | null
    address?: string | null
    email?: string | null
  }
  notes?: string | null
  /** Provider-side user/account on whose behalf the case is filed (e.g. Paywise
   *  X-User-Id = the gym's Paywise user). Ignored by providers that don't need it. */
  providerUserId?: string | null
  /** Rich claim detail some providers need (Paywise: dates + principal/fees split).
   *  Optional + provider-specific; the manual/sandbox path ignores it. */
  claim?: {
    /** invoice number → document_reference */
    invoiceNumber?: string | null
    /** human description of the service → subject_matter */
    subjectMatter?: string | null
    /** invoice/service date (ISO yyyy-mm-dd) → document_date & occurence_date */
    issuedAt?: string | null
    /** payment due date (ISO yyyy-mm-dd) → due_date */
    dueDate?: string | null
    /** date of the first *real* Mahnung (NOT a Zahlungserinnerung) → reminder_date */
    reminderDate?: string | null
    /** date the debtor entered default per §286 BGB → delay_date */
    delayDate?: string | null
    /** principal claim (the unpaid invoice gross) in cents → main_claim_amount */
    principalCents?: number
    /** optional extra charges (Mahngebühren/Zinsen) → additional_charges */
    additionalCharges?: Array<{ label: string; amountCents: number }>
  }
  /** Supporting documents (e.g. the invoice/dossier PDF) to attach to the case. */
  documents?: Array<{ filename: string; mimeType: string; contentBase64: string }>
}

export interface SubmitResult {
  ok: boolean
  /** provider's case id → dunning_handoffs.reference_id (on success) */
  referenceId?: string
  /** status to persist after submit (usually 'sent_to_provider') */
  status: HandoffStatus
  /** raw provider response → provider_response jsonb (audit) */
  raw: unknown
  /** populated when ok=false; the handoff stays 'initiated' */
  error?: string
}

/** A status transition derived from an inbound provider webhook. */
export interface StatusUpdate {
  /** provider's case id — matches dunning_handoffs.reference_id */
  referenceId: string
  status: HandoffStatus
  raw: unknown
}

export interface InkassoProvider {
  /** must equal a value in dunning_handoffs.provider CHECK */
  readonly name: string
  /** true only when env credentials are present (else handoff falls back to PDF) */
  isConfigured(): boolean
  /** open a collection case via the provider API */
  submitCase(c: InkassoCase): Promise<SubmitResult>
  /** verify an inbound webhook (signature / shared secret). Default: reject. */
  verifyWebhook?(rawBody: string, headers: Record<string, string>): boolean
  /** parse an inbound webhook into status updates; null if unrecognised */
  parseWebhook?(payload: unknown, headers: Record<string, string>): StatusUpdate[] | null
}

const registry = new Map<string, InkassoProvider>()

export function registerProvider(p: InkassoProvider): void {
  registry.set(p.name, p)
}

export function getProvider(name: string): InkassoProvider | null {
  return registry.get(name) ?? null
}

/** A provider usable via API right now = registered AND configured. */
export function getApiProvider(name: string): InkassoProvider | null {
  const p = registry.get(name)
  return p && p.isConfigured() ? p : null
}

export function listConfiguredProviders(): string[] {
  return [...registry.values()].filter((p) => p.isConfigured()).map((p) => p.name)
}

/** Stable external reference we control (idempotency + webhook mapping). */
export function buildReference(gymId: string, handoffId: string): string {
  return `OSSS-${gymId.slice(0, 8)}-${handoffId.slice(0, 8)}`
}
