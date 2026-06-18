import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveOwnerGym } from '@/lib/auth/owner-gym-auth'
import { isConvertibleQuoteStatus, formatInvoiceNumber, invoiceDueDateISO } from '@/lib/billing/checkout-math'

// Sprint D 2026-05-30: resolveOwnerGym mit Redis-Cache

// POST /api/quotes/[id]/convert
//
// Sprint 2026-05-27: Konvertiere Angebot zu Rechnung.
// Quote-Status muss draft|sent|accepted sein, sonst 400.
// Erzeugt payment + invoice_line_items aus quote_line_items.
// Setzt quote.status='converted' + quote.converted_payment_id.

export const dynamic = 'force-dynamic'

function getSupabase(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: quoteId } = await params
  const auth = await resolveOwnerGym(req)
  if ('error' in auth) return auth.error
  const supabase = getSupabase(auth.token)
  const gym = auth.gym

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: quote } = await (supabase.from('quotes') as any)
    .select('*').eq('id', quoteId).maybeSingle()
  if (!quote || quote.gym_id !== gym.id) {
    return NextResponse.json({ error: 'Angebot nicht gefunden' }, { status: 404 })
  }
  if (!isConvertibleQuoteStatus(quote.status)) {
    return NextResponse.json({ error: `Angebot mit Status ${quote.status} kann nicht konvertiert werden` }, { status: 400 })
  }
  if (quote.converted_payment_id) {
    return NextResponse.json({
      error: 'Angebot wurde bereits konvertiert',
      payment_id: quote.converted_payment_id,
    }, { status: 409 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: quoteItems } = await (supabase.from('quote_line_items') as any)
    .select('*').eq('quote_id', quoteId).order('position')
  if (!quoteItems || quoteItems.length === 0) {
    return NextResponse.json({ error: 'Angebot ohne Positionen kann nicht konvertiert werden' }, { status: 400 })
  }

  // § 19 UStG: Kleinunternehmer → keine USt. Flag separat holen (CachedGym hat es
  // nicht). Bei § 19 wird der Betrag auf die NETTO-Summe gesetzt (das Angebot-Brutto
  // enthielt ggf. USt) und alle Positions-Steuersätze auf 0 erzwungen.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: gymTax } = await (supabase.from('gyms') as any)
    .select('is_kleinunternehmer').eq('id', gym.id).maybeSingle()
  const isKleinunternehmer = gymTax?.is_kleinunternehmer === true
  const netTotal = (quoteItems as Array<{ qty: number; unit_price_cents: number }>)
    .reduce((s, qi) => s + Math.round(qi.qty * qi.unit_price_cents), 0)
  const invoiceAmountCents = isKleinunternehmer ? netTotal : quote.total_gross_cents

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: counter } = await (supabase.rpc as any)('increment_invoice_counter', { p_gym_id: gym.id })
  const invoiceNumber = formatInvoiceNumber(new Date().getFullYear(), counter)

  const nowIso = new Date().toISOString()
  const dueIso = invoiceDueDateISO(Date.now(), 14)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: payment, error: pErr } = await (supabase.from('payments') as any).insert({
    gym_id: gym.id,
    member_id: quote.member_id,
    amount_cents: invoiceAmountCents,
    status: 'pending',
    kind: 'one_off',
    description: `Konvertiert aus Angebot ${quote.quote_number}`,
    due_date: dueIso,
    invoice_number: invoiceNumber,
    member_name: quote.recipient_name,
    issued_at: nowIso,
    tax_rate_pct: isKleinunternehmer ? 0 : (quoteItems.length === 1 ? quoteItems[0].tax_rate_pct : 0),
  }).select().single()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  const lineRows = quoteItems.map((qi: { position: number; description: string; qty: number; unit_price_cents: number; tax_rate_pct: number }) => ({
    payment_id: payment.id,
    position: qi.position,
    description: qi.description,
    qty: qi.qty,
    unit_price_cents: qi.unit_price_cents,
    tax_rate_pct: isKleinunternehmer ? 0 : qi.tax_rate_pct,
  }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('invoice_line_items') as any).insert(lineRows)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('quotes') as any).update({
    status: 'converted',
    converted_payment_id: payment.id,
    updated_at: nowIso,
  }).eq('id', quoteId)

  return NextResponse.json({
    ok: true,
    payment,
    invoice_number: invoiceNumber,
    invoice_url: `/api/invoices/${payment.id}`,
  })
}
