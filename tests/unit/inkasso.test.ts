/**
 * Unit tests for the provider-agnostic Inkasso scaffold (src/lib/inkasso).
 * Pure — no DB, no network. The SandboxProvider takes its config via the
 * constructor so tests are deterministic without env vars.
 */

import { describe, test, expect, vi, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  registerProvider,
  getProvider,
  getApiProvider,
  listConfiguredProviders,
  isHandoffStatus,
  buildReference,
  type InkassoProvider,
  type InkassoCase,
} from '@/lib/inkasso/provider'
import { SandboxProvider } from '@/lib/inkasso/sandbox'
import { PaywiseProvider } from '@/lib/inkasso/paywise'

const baseCase: InkassoCase = {
  handoffId: 'abcdef12-3456-7890-aaaa-bbbbbbbbbbbb',
  gymId: 'gym12345-6789-0000-1111-222222222222',
  memberId: 'mem00000-0000-0000-0000-000000000000',
  amountCents: 123_45,
  reference: 'OSSS-gym12345-abcdef12',
  debtor: { firstName: 'Max', lastName: 'Müller', email: 'max@example.com' },
  creditor: { gymName: 'CSC FFB' },
  notes: null,
}

describe('handoff status helpers', () => {
  test('isHandoffStatus accepts the live CHECK values, rejects others', () => {
    for (const s of ['initiated', 'pdf_exported', 'sent_to_provider', 'accepted', 'rejected', 'paid', 'written_off', 'closed']) {
      expect(isHandoffStatus(s)).toBe(true)
    }
    for (const s of ['submitted', 'open', 'done', '']) expect(isHandoffStatus(s)).toBe(false)
  })

  test('buildReference is stable + derived from gym+handoff', () => {
    expect(buildReference(baseCase.gymId, baseCase.handoffId)).toBe('OSSS-gym12345-abcdef12')
  })
})

describe('SandboxProvider — submitCase', () => {
  const sb = new SandboxProvider({ enabled: true, webhookSecret: 's3cret' })

  test('is configured only when enabled', () => {
    expect(sb.isConfigured()).toBe(true)
    expect(new SandboxProvider({ enabled: false, webhookSecret: '' }).isConfigured()).toBe(false)
  })

  test('submit returns sent_to_provider + deterministic reference', async () => {
    const r = await sb.submitCase(baseCase)
    expect(r.ok).toBe(true)
    expect(r.status).toBe('sent_to_provider')
    expect(r.referenceId).toBe('SBX-ABCDEF12')
    // same handoff → same provider reference (idempotent)
    const r2 = await sb.submitCase(baseCase)
    expect(r2.referenceId).toBe(r.referenceId)
  })
})

describe('SandboxProvider — webhook verify + parse', () => {
  const sb = new SandboxProvider({ enabled: true, webhookSecret: 's3cret' })

  test('verifyWebhook matches the shared secret (constant-time)', () => {
    expect(sb.verifyWebhook('body', { 'x-inkasso-secret': 's3cret' })).toBe(true)
    expect(sb.verifyWebhook('body', { 'x-inkasso-secret': 'wrong' })).toBe(false)
    expect(sb.verifyWebhook('body', {})).toBe(false)
  })

  test('verifyWebhook is false when no secret configured', () => {
    const noSecret = new SandboxProvider({ enabled: true, webhookSecret: '' })
    expect(noSecret.verifyWebhook('body', { 'x-inkasso-secret': '' })).toBe(false)
  })

  test('parseWebhook maps a valid payload to a StatusUpdate', () => {
    const out = sb.parseWebhook({ reference_id: 'SBX-ABCDEF12', status: 'paid' })
    expect(out).toEqual([{ referenceId: 'SBX-ABCDEF12', status: 'paid', raw: { reference_id: 'SBX-ABCDEF12', status: 'paid' } }])
  })

  test('parseWebhook rejects invalid status / missing fields', () => {
    expect(sb.parseWebhook({ reference_id: 'X', status: 'bogus' })).toBeNull()
    expect(sb.parseWebhook({ status: 'paid' })).toBeNull()
    expect(sb.parseWebhook(null)).toBeNull()
    expect(sb.parseWebhook('nope')).toBeNull()
  })
})

describe('provider registry', () => {
  test('register → getProvider; getApiProvider gates on isConfigured', () => {
    const configured = new SandboxProvider({ enabled: true, webhookSecret: 's' })
    registerProvider(configured)
    expect(getProvider('other')).toBeTruthy()
    expect(getApiProvider('other')).toBeTruthy()
    expect(listConfiguredProviders()).toContain('other')

    // an unconfigured provider is registered but NOT returned by getApiProvider
    const unconfigured: InkassoProvider = {
      name: 'eos',
      isConfigured: () => false,
      submitCase: async () => ({ ok: false, status: 'initiated', raw: {}, error: 'no creds' }),
    }
    registerProvider(unconfigured)
    expect(getProvider('eos')).toBeTruthy()
    expect(getApiProvider('eos')).toBeNull()
    expect(listConfiguredProviders()).not.toContain('eos')
  })

  test('unknown provider → null', () => {
    expect(getProvider('does-not-exist')).toBeNull()
    expect(getApiProvider('does-not-exist')).toBeNull()
  })
})

// ── PaywiseProvider — mocked fetch, no network ────────────────────────────────

const paywiseCase: InkassoCase = {
  ...baseCase,
  providerUserId: 'user_gym_1',
  debtor: {
    firstName: 'Max', lastName: 'Müller', email: 'max@example.com', phone: '+4915112345678',
    street: 'Hauptstr. 1', postalCode: '82276', city: 'Adelshofen', dateOfBirth: '1990-05-01',
  },
  creditor: { gymName: 'CSC FFB' },
  claim: {
    invoiceNumber: '2026-0001-PT', subjectMatter: 'Mitgliedsbeitrag Mai 2026',
    issuedAt: '2026-05-01', dueDate: '2026-05-15', reminderDate: '2026-06-01', delayDate: '2026-06-14',
    principalCents: 5900,
  },
}

const mkRes = (ok: boolean, status: number, json: unknown) =>
  ({ ok, status, json: async () => json }) as Response

function mockFetchSequence() {
  const calls: Array<{ url: string; method?: string; headers?: Record<string, string>; body?: string }> = []
  const fn = vi.fn(async (url: unknown, init?: { method?: string; headers?: Record<string, string>; body?: unknown }) => {
    const u = String(url)
    calls.push({ url: u, method: init?.method, headers: init?.headers, body: typeof init?.body === 'string' ? init.body : undefined })
    if (u.endsWith('/v1/debtors/')) return mkRes(true, 201, { id: 'deb_1' })
    if (u.endsWith('/v1/claims/') && init?.method === 'POST') return mkRes(true, 201, { id: 'clm_1' })
    if (u.includes('/v1/claims/clm_1/') && init?.method === 'PATCH') return mkRes(true, 200, { submission_state: 'released' })
    if (u.includes('/documents/')) return mkRes(true, 201, { id: 'doc_1' })
    return mkRes(false, 404, {})
  })
  global.fetch = fn as unknown as typeof fetch
  return { calls, fn }
}

afterEach(() => { vi.restoreAllMocks() })

describe('PaywiseProvider — config + submitCase', () => {
  test('isConfigured gates on the case-management token', () => {
    expect(new PaywiseProvider({ apiToken: 'tok' }).isConfigured()).toBe(true)
    expect(new PaywiseProvider({ apiToken: '' }).isConfigured()).toBe(false)
  })

  test('submitCase runs debtor → claim → release and returns the claim id', async () => {
    const { calls } = mockFetchSequence()
    const pw = new PaywiseProvider({ apiToken: 'tok', base: 'https://api.paywise.de' })
    const r = await pw.submitCase(paywiseCase)

    expect(r.ok).toBe(true)
    expect(r.status).toBe('sent_to_provider')
    expect(r.referenceId).toBe('clm_1')

    // sequence: debtor POST, claim POST, claim PATCH (release)
    expect(calls[0].url).toBe('https://api.paywise.de/v1/debtors/')
    expect(calls[1].url).toBe('https://api.paywise.de/v1/claims/')
    expect(calls[2].url).toBe('https://api.paywise.de/v1/claims/clm_1/')
    expect(calls[2].method).toBe('PATCH')

    // X-User-Id forwarded for acting-on-behalf-of-gym
    expect(calls[0].headers?.['X-User-Id']).toBe('user_gym_1')

    // amounts are decimal-euro strings, principal = 59.00
    const claimBody = JSON.parse(calls[1].body!)
    expect(claimBody.main_claim_amount).toEqual({ value: '59.00' })
    expect(claimBody.total_claim_amount).toEqual({ value: '59.00' })
    expect(claimBody.starting_approach).toBe('extrajudicial')
    expect(claimBody.document_reference).toBe('2026-0001-PT')
    expect(claimBody.due_date).toBe('2026-05-15')

    // debtor is a consumer with a structured address
    const debtorBody = JSON.parse(calls[0].body!)
    expect(debtorBody.acting_as).toBe('consumer')
    expect(debtorBody.addresses[0]).toEqual({ street: 'Hauptstr. 1', zip: '82276', city: 'Adelshofen' })
  })

  test('submitCase splits principal vs additional charges (Nebenforderungen)', async () => {
    const { calls } = mockFetchSequence()
    const pw = new PaywiseProvider({ apiToken: 'tok' })
    const r = await pw.submitCase({
      ...paywiseCase,
      claim: { ...paywiseCase.claim!, additionalCharges: [{ label: 'Mahngebühr', amountCents: 500 }] },
    })
    expect(r.ok).toBe(true)
    const claimBody = JSON.parse(calls[1].body!)
    expect(claimBody.main_claim_amount).toEqual({ value: '59.00' })
    expect(claimBody.total_claim_amount).toEqual({ value: '64.00' })
    expect(claimBody.additional_charges).toHaveLength(1)
    expect(claimBody.additional_charges[0].amount).toEqual({ value: '5.00' })
  })

  test('submitCase refuses to send when required claim dates are missing (no network)', async () => {
    const { fn } = mockFetchSequence()
    const pw = new PaywiseProvider({ apiToken: 'tok' })
    const { claim, ...rest } = paywiseCase
    void claim
    const r = await pw.submitCase({ ...rest, claim: { principalCents: 5900 } })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/reminder_date|delay_date|due_date|issuedAt/)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('PaywiseProvider — webhook verify + parse', () => {
  const secret = 'whsec_test'
  const pw = new PaywiseProvider({ apiToken: 'tok', webhookSecret: secret })

  test('verifyWebhook accepts a correct HMAC-SHA256, rejects tampering', () => {
    const body = '{"event":"mandate.closed","data":{}}'
    const sig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
    expect(pw.verifyWebhook(body, { 'x-paywise-signature': sig })).toBe(true)
    // tampered body
    expect(pw.verifyWebhook(body + ' ', { 'x-paywise-signature': sig })).toBe(false)
    // wrong hex
    expect(pw.verifyWebhook(body, { 'x-paywise-signature': 'sha256=deadbeef' })).toBe(false)
    // missing sha256= prefix
    expect(pw.verifyWebhook(body, { 'x-paywise-signature': createHmac('sha256', secret).update(body).digest('hex') })).toBe(false)
  })

  test('verifyWebhook is false without a configured secret', () => {
    const noSecret = new PaywiseProvider({ apiToken: 'tok', webhookSecret: '' })
    expect(noSecret.verifyWebhook('x', { 'x-paywise-signature': 'sha256=abc' })).toBe(false)
  })

  test('parseWebhook maps mandate.closed → paid / written_off', () => {
    expect(pw.parseWebhook({ event: 'mandate.closed', data: { your_reference: 'clm_1', reason: 'fully paid' } }))
      .toEqual([{ referenceId: 'clm_1', status: 'paid', raw: expect.anything() }])
    expect(pw.parseWebhook({ event: 'mandate.closed', data: { your_reference: 'clm_2', reason: 'written_off' } }))
      .toEqual([{ referenceId: 'clm_2', status: 'written_off', raw: expect.anything() }])
  })

  test('parseWebhook maps mandate.status_updated → accepted', () => {
    expect(pw.parseWebhook({ event: 'mandate.status_updated', data: { claim_id: 'clm_9' } }))
      .toEqual([{ referenceId: 'clm_9', status: 'accepted', raw: expect.anything() }])
  })

  test('parseWebhook ignores informational events', () => {
    expect(pw.parseWebhook({ event: 'claim.created', data: { id: 'clm_1' } })).toEqual([])
    expect(pw.parseWebhook({ event: 'mandate.balance_updated', data: { id: 'clm_1' } })).toEqual([])
    expect(pw.parseWebhook({ event: null })).toBeNull()
  })
})

describe('PaywiseProvider — reportPayment', () => {
  test('POSTs to /v1/payments/ with claim + decimal-euro amount + X-User-Id', async () => {
    const calls: Array<{ url: string; method?: string; headers?: Record<string, string>; body?: string }> = []
    global.fetch = vi.fn(async (url: unknown, init?: { method?: string; headers?: Record<string, string>; body?: unknown }) => {
      calls.push({ url: String(url), method: init?.method, headers: init?.headers, body: typeof init?.body === 'string' ? init.body : undefined })
      return mkRes(true, 201, { id: 'pay_1' })
    }) as unknown as typeof fetch

    const pw2 = new PaywiseProvider({ apiToken: 'tok' })
    const r = await pw2.reportPayment({ claimId: 'clm_1', amountCents: 5900, valueDate: '2026-06-18', userId: 'user_gym_1' })

    expect(r.ok).toBe(true)
    expect(calls[0].url).toBe('https://api.paywise.de/v1/payments/')
    expect(calls[0].method).toBe('POST')
    expect(calls[0].headers?.['X-User-Id']).toBe('user_gym_1')
    const body = JSON.parse(calls[0].body!)
    expect(body.claim).toBe('clm_1')
    expect(body.amount).toEqual({ value: '59.00' })
    expect(body.value_date).toBe('2026-06-18')
  })
})
