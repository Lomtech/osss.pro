/**
 * Sprint 2026-05-27: Buchhalter-Versand-PDF.
 *
 * Generiert kompakte Rechnungs-PDFs für den monatlichen Versand an den
 * Steuerberater. Eigenständig vom Member-Invoice-PDF in /api/invoices/[paymentId]
 * (das ist 280 LOC und tief mit der Route verflochten).
 *
 * Pflichtangaben § 14 UStG:
 *  - Vollständige Anschrift des leistenden Unternehmens
 *  - Anschrift des Leistungsempfängers
 *  - Steuernummer oder USt-IdNr.
 *  - Rechnungsdatum
 *  - Fortlaufende Rechnungsnummer
 *  - Liefer-/Leistungsdatum
 *  - Menge + Art der Leistung
 *  - Entgelt + Steuerbetrag, getrennt nach Steuersätzen
 *  - Bei Kleinunternehmer: Hinweis nach § 19 UStG
 */

import {
  renderToBuffer,
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer'
import React from 'react'
import { createServiceClient } from '@/lib/supabase/service'

interface PaymentData {
  id: string
  amount_cents: number
  status: string
  paid_at: string | null
  invoice_number: string | null
  kind: string
  description: string | null
  due_date: string | null
  issued_at: string | null
  tax_rate_pct: number | null
  credits_payment_id: string | null
  members: {
    first_name: string | null
    last_name: string | null
    email: string | null
    address: string | null
  } | null
  gyms: {
    name: string | null
    address: string | null
    phone: string | null
    email: string | null
    tax_number: string | null
    ustid: string | null
    is_kleinunternehmer: boolean | null
    legal_name: string | null
    legal_address: string | null
  } | null
}

interface LineItem {
  description: string
  qty: number
  unit_price_cents: number
  tax_rate_pct: number
  line_net_cents: number
  line_tax_cents: number
  line_gross_cents: number
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#0f172a', lineHeight: 1.5 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 12, borderBottom: '1pt solid #cbd5e1' },
  studioBlock: { width: '55%' },
  studioName: { fontSize: 13, fontWeight: 700 },
  small: { fontSize: 9, color: '#475569' },
  metaBlock: { width: '40%', alignItems: 'flex-end' },
  metaLabel: { fontSize: 9, color: '#64748b' },
  metaValue: { fontSize: 11, fontWeight: 700 },
  section: { marginTop: 14 },
  h2: { fontSize: 11, fontWeight: 700, marginBottom: 6, color: '#0f172a' },
  addressBlock: { padding: 10, backgroundColor: '#f8fafc', borderRadius: 4 },
  itemsTable: { marginTop: 12, borderTop: '1pt solid #cbd5e1' },
  itemRow: { flexDirection: 'row', paddingVertical: 6, borderBottom: '0.5pt solid #e2e8f0' },
  itemHeader: { backgroundColor: '#f1f5f9', fontWeight: 700, fontSize: 9 },
  colDesc: { width: '50%' },
  colQty:  { width: '10%', textAlign: 'right' },
  colPrice:{ width: '15%', textAlign: 'right' },
  colTax:  { width: '10%', textAlign: 'right' },
  colTotal:{ width: '15%', textAlign: 'right' },
  totalsBox: { marginTop: 12, padding: 10, backgroundColor: '#f8fafc', borderRadius: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, fontSize: 10 },
  totalRowGrand: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, fontWeight: 700, fontSize: 12, borderTop: '1pt solid #0f172a', marginTop: 4 },
  footer: { position: 'absolute', bottom: 20, left: 40, right: 40, fontSize: 8, color: '#64748b', borderTop: '0.5pt solid #cbd5e1', paddingTop: 8 },
})

function fmtEur(cents: number): string {
  const abs = Math.abs(cents)
  const eur = (abs / 100).toFixed(2).replace('.', ',')
  return cents < 0 ? `-${eur} €` : `${eur} €`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface InvoicePdfProps {
  payment: PaymentData
  items: LineItem[]
  totals: { net: number; tax: number; gross: number }
}

function InvoicePdf({ payment, items, totals }: InvoicePdfProps) {
  const gym = payment.gyms!
  const member = payment.members
  const isCredit = payment.kind === 'credit_note'
  const isKleinUnt = gym.is_kleinunternehmer === true

  const documentTitle = isCredit ? 'Gutschrift' : 'Rechnung'

  return (
    <Document title={`${documentTitle} ${payment.invoice_number ?? payment.id.slice(0, 8)}`}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <View style={styles.studioBlock}>
            <Text style={styles.studioName}>{gym.legal_name ?? gym.name ?? 'Studio'}</Text>
            <Text style={styles.small}>{gym.legal_address ?? gym.address ?? ''}</Text>
            {gym.phone && <Text style={styles.small}>Tel: {gym.phone}</Text>}
            {gym.email && <Text style={styles.small}>{gym.email}</Text>}
            {gym.tax_number && <Text style={styles.small}>St-Nr: {gym.tax_number}</Text>}
            {gym.ustid && <Text style={styles.small}>USt-IdNr: {gym.ustid}</Text>}
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>{documentTitle}</Text>
            <Text style={styles.metaValue}>{payment.invoice_number ?? payment.id.slice(0, 8)}</Text>
            <Text style={[styles.small, { marginTop: 8 }]}>Rechnungsdatum</Text>
            <Text style={styles.small}>{fmtDate(payment.issued_at ?? payment.paid_at)}</Text>
            {payment.paid_at && (
              <>
                <Text style={[styles.small, { marginTop: 4 }]}>Leistungsdatum</Text>
                <Text style={styles.small}>{fmtDate(payment.paid_at)}</Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>Empfänger</Text>
          <View style={styles.addressBlock}>
            <Text>{member ? `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() : 'Unbekannt'}</Text>
            {member?.address && <Text style={styles.small}>{member.address}</Text>}
            {member?.email && <Text style={styles.small}>{member.email}</Text>}
          </View>
        </View>

        {payment.description && (
          <View style={styles.section}>
            <Text style={styles.h2}>Beschreibung</Text>
            <Text style={styles.small}>{payment.description}</Text>
          </View>
        )}

        <View style={styles.itemsTable}>
          <View style={[styles.itemRow, styles.itemHeader]}>
            <Text style={styles.colDesc}>Bezeichnung</Text>
            <Text style={styles.colQty}>Menge</Text>
            <Text style={styles.colPrice}>Einzel netto</Text>
            <Text style={styles.colTax}>USt</Text>
            <Text style={styles.colTotal}>Gesamt netto</Text>
          </View>
          {items.length > 0 ? items.map((item, idx) => (
            <View key={idx} style={styles.itemRow}>
              <Text style={styles.colDesc}>{item.description}</Text>
              <Text style={styles.colQty}>{item.qty.toLocaleString('de-DE')}</Text>
              <Text style={styles.colPrice}>{fmtEur(item.unit_price_cents)}</Text>
              <Text style={styles.colTax}>{isKleinUnt ? '—' : `${item.tax_rate_pct}%`}</Text>
              <Text style={styles.colTotal}>{fmtEur(item.line_net_cents)}</Text>
            </View>
          )) : (
            <View style={styles.itemRow}>
              <Text style={styles.colDesc}>{payment.description ?? (isCredit ? 'Gutschrift' : 'Mitgliedsbeitrag')}</Text>
              <Text style={styles.colQty}>1</Text>
              <Text style={styles.colPrice}>{fmtEur(Math.round(payment.amount_cents / (1 + (payment.tax_rate_pct ?? 19) / 100)))}</Text>
              <Text style={styles.colTax}>{isKleinUnt ? '—' : `${payment.tax_rate_pct ?? 19}%`}</Text>
              <Text style={styles.colTotal}>{fmtEur(Math.round(payment.amount_cents / (1 + (payment.tax_rate_pct ?? 19) / 100)))}</Text>
            </View>
          )}
        </View>

        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text>Summe netto</Text>
            <Text>{fmtEur(totals.net)}</Text>
          </View>
          {!isKleinUnt && (
            <View style={styles.totalRow}>
              <Text>zzgl. USt</Text>
              <Text>{fmtEur(totals.tax)}</Text>
            </View>
          )}
          <View style={styles.totalRowGrand}>
            <Text>{isCredit ? 'Gesamt Gutschrift' : 'Gesamt brutto'}</Text>
            <Text>{fmtEur(totals.gross)}</Text>
          </View>
        </View>

        {isKleinUnt && (
          <View style={[styles.section, { marginTop: 16 }]}>
            <Text style={styles.small}>
              Gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen (Kleinunternehmerregelung).
            </Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>{gym.legal_name ?? gym.name} · {gym.legal_address ?? gym.address ?? ''}</Text>
          <Text>Buchhalter-Versand · Erstellt {fmtDate(new Date().toISOString())}</Text>
        </View>
      </Page>
    </Document>
  )
}

/**
 * Lädt payment + line_items, rendert PDF, gibt Buffer zurück.
 * Idempotent — kann beliebig oft aufgerufen werden.
 */
export async function renderDispatchInvoicePdf(paymentId: string): Promise<Buffer | null> {
  const supabase = createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: payment } = await (supabase.from('payments') as any)
    .select(`
      id, amount_cents, status, paid_at, invoice_number, kind, description,
      due_date, issued_at, tax_rate_pct, credits_payment_id,
      members (first_name, last_name, email, address),
      gyms (name, address, phone, email, tax_number, ustid, is_kleinunternehmer, legal_name, legal_address)
    `)
    .eq('id', paymentId)
    .maybeSingle()

  if (!payment) return null

  // Line-items wenn Multi-Position
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawItems } = await (supabase.from('invoice_line_items') as any)
    .select('description, qty, unit_price_cents, tax_rate_pct, line_net_cents, line_tax_cents, line_gross_cents')
    .eq('payment_id', paymentId)
    .order('position')

  const items: LineItem[] = (rawItems ?? []).map((it: Record<string, unknown>) => ({
    description: String(it.description ?? ''),
    qty: Number(it.qty ?? 1),
    unit_price_cents: Number(it.unit_price_cents ?? 0),
    tax_rate_pct: Number(it.tax_rate_pct ?? 19),
    line_net_cents: Number(it.line_net_cents ?? 0),
    line_tax_cents: Number(it.line_tax_cents ?? 0),
    line_gross_cents: Number(it.line_gross_cents ?? 0),
  }))

  // Totals aggregieren
  let totals: { net: number; tax: number; gross: number }
  if (items.length > 0) {
    totals = items.reduce((acc, i) => ({
      net:   acc.net   + i.line_net_cents,
      tax:   acc.tax   + i.line_tax_cents,
      gross: acc.gross + i.line_gross_cents,
    }), { net: 0, tax: 0, gross: 0 })
  } else {
    // Single-Item-Fallback aus payment-Header
    const rate = (payment as PaymentData).tax_rate_pct ?? 19
    const gross = (payment as PaymentData).amount_cents
    const net = Math.round(gross / (1 + rate / 100))
    const tax = gross - net
    totals = { net, tax, gross }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(React.createElement(InvoicePdf, { payment: payment as PaymentData, items, totals }) as any)
    return buffer as Buffer
  } catch (err) {
    console.error('[dispatch-invoice-pdf] render failed:', err instanceof Error ? err.message : err)
    return null
  }
}
