// Inkasso provider registry bootstrap. Importing this module registers every
// provider whose credentials are present in the environment. Providers without
// credentials are simply not registered → the handoff flow falls back to the
// manual PDF dossier (unchanged behaviour, no error).
//
// To add a real provider once you've signed + received API credentials:
//   1. create src/lib/inkasso/<provider>.ts implementing InkassoProvider
//      (submitCase via their REST API, verify/parseWebhook for their callback)
//   2. register it below, gated on its env credentials
//   3. add its env vars to .env.example
// No other code changes — the handoff route + webhook receiver are agnostic.

import { registerProvider } from './provider'
import { SandboxProvider } from './sandbox'
import { PaywiseProvider } from './paywise'

export * from './provider'
export { PaywiseProvider } from './paywise'

let booted = false

export function initInkassoProviders(): void {
  if (booted) return
  booted = true

  // Sandbox (dev/test) — deterministic, no network. Maps to the 'other' slot.
  const sandbox = new SandboxProvider()
  if (sandbox.isConfigured()) registerProvider(sandbox)

  // Paywise (paywise.de) — registriert, sobald INKASSO_PAYWISE_API_TOKEN gesetzt ist.
  // Siehe docs/INKASSO_PAYWISE_MAPPING.md.
  const paywise = new PaywiseProvider()
  if (paywise.isConfigured()) registerProvider(paywise)

  // ── Real providers plug in here once under contract ──────────────────────
  // import { FinionFairPayProvider } from './fair-pay'
  // const fairPay = new FinionFairPayProvider()        // name: 'fair_pay'
  // if (fairPay.isConfigured()) registerProvider(fairPay)
  //
  // import { DebtistProvider } from './debtist'
  // const debtist = new DebtistProvider()              // name: 'other'/'eos'/…
  // if (debtist.isConfigured()) registerProvider(debtist)
}

// Register on first import.
initInkassoProviders()
