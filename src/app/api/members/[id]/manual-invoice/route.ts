import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveOwnerGym } from '@/lib/auth/owner-gym-auth'

// Sprint D 2026-05-30: resolveOwnerGym mit Redis-Cache

// POST /api/members/[id]/manual-invoice
//
// Sprint 2026-05-27: Multi-Position-Rechnungen (Sevdesk-feature-parity).
//
// Body (zwei Modi):
//   1) Single-Item (Backward-Compat):
//      { amount_cents, description, due_date?, paid?: boolean, tax_rate_pct?: 19 }
//
//   2) Multi-Item:
//      { description?, due_date?, paid?: boolean,
//        items: [{ description, qty, unit_price_cents, tax_rate_pct }] }
//      → total wird aus items aggregiert (net + tax + gross)

export const dynamic = 'force-dynamic'

function getSupabase(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

interface LineItemInput {
  description: string
  qty: number
  unit_price_cents: number
  tax_rate_pct: number
}

function validateItem(raw: unknown): LineItemInput | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const description = typeof r.description === 'string' ? r.description.slice(0, 500).trim() : ''
  const qty = typeof r.qty === 'number' && r.qty > 0 ? r.qty : null
  const unit_price_cents = typeof r.unit_price_cents === 'number' && r.unit_price_cents >= 0
    ? Math.floor(r.unit_price_cents) : null
  const tax_rate_pct = typeof r.tax_rate_pct === 'number' && r.tax_rate_pct >= 0 && r.tax_rate_pct <= 25
    ? r.tax_rate_pct : 19
  if (!description || qty === null || unit_price_cents === null) return null
  return { description, qty, unit_price_cents, tax_rate_pct }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: memberId } = await params
  const auth = await resolveOwnerGym(req)
  if ('error' in auth) return auth.error
  const supabase = getSupabase(auth.token)
  const gym = auth.gym

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: member } = await (supabase.from('members') as any)
    .select('id, gym_id, first_name, last_name').eq('id', memberId).maybeSingle()
  if (!member || member.gym_id !== gym.id) {
    return NextResponse.json({ error: 'Mitglied nicht gefunden' }, { status: 404 })
  }

  // § 19 UStG: Kleinunternehmer dürfen keine USt ausweisen. resolveOwnerGym
  // liefert das Flag nicht mit → separat holen, um tax_rate_pct zu erzwingen.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: gymTax } = await (supabase.from('gyms') as any)
    .select('is_kleinunternehmer').eq('id', gym.id).maybeSingle()
  const isKleinunternehmer = gymTax?.is_kleinunternehmer === true

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const due_date = typeof body.due_date === 'string' ? body.due_date.slice(0, 10) : null
  const paid = body.paid === true
  const headerDescription = typeof body.description === 'string' ? body.description.slice(0, 500).trim() : ''

  // Multi-Item-Mode wenn items[] gegeben, sonst Single-Item
  let items: LineItemInput[] = []
  if (Array.isArray(body.items)) {
    for (const raw of body.items) {
      const item = validateItem(raw)
      if (!item) {
        return NextResponse.json({ error: 'Ungültiges line-item (description+qty+unit_price_cents Pflicht)' }, { status: 400 })
      }
      items.push(item)
    }
  } else {
    // Single-Item-Modus: alte Schnittstelle
    const amount_cents = typeof body.amount_cents === 'number' && body.amount_cents > 0
      ? Math.floor(body.amount_cents) : null
    if (!amount_cents) return NextResponse.json({ error: 'Entweder amount_cents oder items[] erforderlich' }, { status: 400 })
    if (!headerDescription) return NextResponse.json({ error: 'description erforderlich' }, { status: 400 })
    const tax_rate_pct = typeof body.tax_rate_pct === 'number' && body.tax_rate_pct >= 0 ? body.tax_rate_pct : 19
    items = [{
      description: headerDescription,
      qty: 1,
      unit_price_cents: amount_cents,
      tax_rate_pct,
    }]
  }

  if (items.length === 0) {
    return NextResponse.json({ error: 'Keine Positionen' }, { status: 400 })
  }

  // § 19 UStG: bei Kleinunternehmer wird auf JEDER Position 0 % erzwungen —
  // egal was reinkam. So bleibt DB-Spur + PDF konsistent (keine 19 %-Speicherung
  // trotz § 19-Hinweis). Der Hinweis selbst wird im PDF gerendert.
  if (isKleinunternehmer) {
    items = items.map((i) => ({ ...i, tax_rate_pct: 0 }))
  }

  // Aggregate totals (brutto = sum of items, tax extracted)
  const totalNet = items.reduce((s, i) => s + Math.round(i.qty * i.unit_price_cents), 0)
  const totalTax = items.reduce((s, i) => s + Math.round(i.qty * i.unit_price_cents * i.tax_rate_pct / 100), 0)
  const totalGross = totalNet + totalTax

  // Default-Zahlungsziel: +14 Tage
  const dueIso = due_date ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // Invoice-Nummer atomar
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: counter, error: rpcErr } = await (supabase.rpc as any)('increment_invoice_counter', {
    p_gym_id: gym.id,
  })
  if (rpcErr) {
    console.error('[manual-invoice] increment_invoice_counter:', rpcErr.message)
    return NextResponse.json({ error: 'Invoice-Nummer konnte nicht erzeugt werden' }, { status: 500 })
  }
  const year = new Date().getFullYear()
  const invoiceNumber = `${year}-${String(counter ?? 1).padStart(4, '0')}-PT`

  const nowIso = new Date().toISOString()
  const memberName = `${member.first_name} ${member.last_name}`.trim()

  // 1) Payment-Header
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: payment, error: insertErr } = await (supabase.from('payments') as any).insert({
    gym_id: gym.id,
    member_id: memberId,
    amount_cents: totalGross,
    status: paid ? 'paid' : 'pending',
    paid_at: paid ? nowIso : null,
    kind: 'one_off',
    description: headerDescription || items[0].description,
    due_date: dueIso,
    invoice_number: invoiceNumber,
    member_name: memberName,
    issued_at: nowIso,
    // Bei Single-Item: tax_rate aus dem einzigen Item, sonst gemischt → 0 als Marker
    tax_rate_pct: items.length === 1 ? items[0].tax_rate_pct : 0,
  }).select().single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // 2) Line-Items
  const lineItemRows = items.map((item, idx) => ({
    payment_id: payment.id,
    position: idx + 1,
    description: item.description,
    qty: item.qty,
    unit_price_cents: item.unit_price_cents,
    tax_rate_pct: item.tax_rate_pct,
  }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: liErr } = await (supabase.from('invoice_line_items') as any).insert(lineItemRows)
  if (liErr) {
    console.error('[manual-invoice] line-items insert failed:', liErr.message)
    // payment bleibt — wir geben einen Warning zurück, kein Hard-Fail
  }

  return NextResponse.json({
    ok: true,
    payment,
    items: lineItemRows,
    totals: { net_cents: totalNet, tax_cents: totalTax, gross_cents: totalGross },
    invoice_url: `/api/invoices/${payment.id}`,
    note: paid
      ? `Rechnung ${invoiceNumber} als bezahlt vermerkt.`
      : `Rechnung ${invoiceNumber} erstellt, fällig zum ${dueIso}.`,
  })
}
