'use client'

// Feature #2/#3 UI (Sprint 2026-05-27): Externe Inkasso-Übergabe.
//
// Liste aller bisherigen Übergaben + "An Inkasso übergeben"-Button mit Modal.
// Provider: sport_alliance, fair_pay, eos, creditreform, riverty, manual, other.
// Status-Übergänge via PATCH inline.
// PDF kann jederzeit über /api/members/[id]/dunning/handoff-pdf abgerufen werden.

import { useState, useEffect } from 'react'
import { Scale, Plus, X, FileDown, Check, AlertCircle } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { createClient } from '@/lib/supabase/client'

type Provider = 'sport_alliance' | 'fair_pay' | 'eos' | 'creditreform' | 'riverty' | 'manual' | 'other' | 'paywise'
type HandoffStatus = 'initiated' | 'pdf_exported' | 'sent_to_provider' | 'accepted' | 'rejected' | 'paid' | 'written_off' | 'closed'

interface Handoff {
  id: string
  provider: Provider
  status: HandoffStatus
  amount_cents: number
  reference_id: string | null
  notes: string | null
  initiated_at: string
  exported_at: string | null
  sent_at: string | null
  accepted_at: string | null
  closed_at: string | null
  last_status_change_at: string
}

interface Props {
  memberId: string
  dunningLevel: number
  dunningAmountCents: number | null
}

const PROVIDER_LABELS: Record<Provider, string> = {
  sport_alliance: 'Sport Alliance (Magicline-Pay)',
  fair_pay:       'Fair Pay',
  eos:            'EOS',
  creditreform:   'Creditreform',
  riverty:        'Riverty (ehem. AfterPay/Arvato)',
  manual:         'Manuell (PDF runterladen)',
  other:          'Sonstiger Anbieter',
  paywise:        'Paywise',
}

const STATUS_LABELS: Record<HandoffStatus, string> = {
  initiated:        'Angestoßen',
  pdf_exported:     'PDF erstellt',
  sent_to_provider: 'An Provider übergeben',
  accepted:         'Akzeptiert',
  rejected:         'Abgelehnt',
  paid:             'Beglichen',
  written_off:      'Abgeschrieben',
  closed:           'Geschlossen',
}

const STATUS_COLORS: Record<HandoffStatus, string> = {
  initiated:        'bg-zinc-100 text-zinc-700',
  pdf_exported:     'bg-zinc-200 text-zinc-700',
  sent_to_provider: 'bg-amber-100 text-amber-800',
  accepted:         'bg-emerald-100 text-emerald-800',
  rejected:         'bg-rose-100 text-rose-700',
  paid:             'bg-emerald-200 text-emerald-900',
  written_off:      'bg-zinc-200 text-zinc-500 line-through',
  closed:           'bg-zinc-100 text-zinc-400',
}

const NEXT_ACTIONS: Record<HandoffStatus, HandoffStatus[]> = {
  initiated:        ['pdf_exported', 'closed'],
  pdf_exported:     ['sent_to_provider', 'closed'],
  sent_to_provider: ['accepted', 'rejected', 'closed'],
  accepted:         ['paid', 'written_off', 'closed'],
  rejected:         ['closed'],
  paid:             ['closed'],
  written_off:      ['closed'],
  closed:           [],
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtEur(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

export function DunningHandoffSection({ memberId, dunningLevel, dunningAmountCents }: Props) {
  const toast = useToast()
  const [handoffs, setHandoffs] = useState<Handoff[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const [provider, setProvider] = useState<Provider>('manual')
  const [amountEur, setAmountEur] = useState<string>(
    dunningAmountCents ? (dunningAmountCents / 100).toFixed(2) : ''
  )
  const [notes, setNotes] = useState('')

  async function load() {
    const sb = createClient()
    const { data: { session } } = await sb.auth.getSession()
    const res = await fetch(`/api/members/${memberId}/dunning/handoffs`, {
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    })
    if (!res.ok) { setLoading(false); return }
    const json = await res.json()
    setHandoffs(json.handoffs ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [memberId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submitHandoff() {
    const amount = parseFloat(amountEur.replace(',', '.'))
    if (!isFinite(amount) || amount <= 0) {
      toast.error('Betrag in EUR muss > 0 sein.')
      return
    }
    setSaving(true)
    const sb2 = createClient()
    const { data: { session: sess2 } } = await sb2.auth.getSession()
    const res = await fetch(`/api/members/${memberId}/dunning/handoffs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sess2?.access_token ?? ''}`,
      },
      body: JSON.stringify({
        provider,
        amount_cents: Math.round(amount * 100),
        notes: notes.trim() || null,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Übergabe fehlgeschlagen')
      return
    }
    const json = await res.json()
    toast.success(`Übergabe an ${PROVIDER_LABELS[provider]} erfasst.`)
    setShowModal(false)
    setNotes('')
    setHandoffs(prev => [json.handoff, ...prev])
  }

  async function updateStatus(handoff: Handoff, newStatus: HandoffStatus) {
    const sb3 = createClient()
    const { data: { session: sess3 } } = await sb3.auth.getSession()
    const res = await fetch(`/api/dunning/handoffs/${handoff.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sess3?.access_token ?? ''}`,
      },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) {
      toast.error('Status-Update fehlgeschlagen')
      return
    }
    const json = await res.json()
    setHandoffs(prev => prev.map(h => h.id === handoff.id ? json.handoff : h))
    toast.success(`Status → ${STATUS_LABELS[newStatus]}`)
  }

  if (loading) return null

  return (
    <section className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 mb-4">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Scale size={18} className="text-rose-500" />
          <h2 className="text-base font-bold text-zinc-900">Inkasso-Übergabe</h2>
          {dunningLevel > 0 && (
            <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              Mahnstufe {dunningLevel}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5">
          <Plus size={12} /> Übergeben
        </button>
      </header>

      {dunningLevel < 3 && handoffs.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <div>
            Üblicherweise erst nach Mahnstufe 3 (final_warning). Aktuell:
            Mahnstufe {dunningLevel}. Übergabe trotzdem möglich.
          </div>
        </div>
      )}

      {handoffs.length === 0 ? (
        <p className="text-sm text-zinc-400 text-center py-6">
          Keine Übergabe bisher. Klick „Übergeben" wenn interne Mahnstufen ausgeschöpft sind.
        </p>
      ) : (
        <div className="space-y-2">
          {handoffs.map(h => (
            <div key={h.id} className="border border-zinc-100 rounded-lg p-3 bg-zinc-50">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm text-zinc-900">
                      {PROVIDER_LABELS[h.provider]}
                    </span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[h.status]}`}>
                      {STATUS_LABELS[h.status]}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500">
                    {fmtEur(h.amount_cents)} · angestoßen {fmtDate(h.initiated_at)}
                    {h.reference_id && <> · Aktenzeichen <span className="font-mono">{h.reference_id}</span></>}
                  </div>
                  {h.notes && <div className="text-xs text-zinc-600 italic mt-1">{h.notes}</div>}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <a href={`/api/members/${memberId}/dunning/handoff-pdf`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs px-2 py-1 rounded border border-zinc-200 hover:bg-white text-zinc-700 flex items-center gap-1">
                    <FileDown size={12} /> PDF
                  </a>
                  {NEXT_ACTIONS[h.status].map(next => (
                    <button key={next}
                      onClick={() => updateStatus(h, next)}
                      className="text-xs px-2 py-1 rounded border border-zinc-200 hover:bg-zinc-900 hover:text-white text-zinc-700">
                      → {STATUS_LABELS[next]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
             onClick={() => !saving && setShowModal(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6"
               onClick={e => e.stopPropagation()}>
            <header className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-zinc-900">An Inkasso übergeben</h3>
              <button onClick={() => !saving && setShowModal(false)}
                className="text-zinc-400 hover:text-zinc-700"><X size={18} /></button>
            </header>

            <div className="space-y-4">
              <label className="block">
                <span className="text-xs text-zinc-500 block mb-1">Inkasso-Anbieter</span>
                <select value={provider} onChange={e => setProvider(e.target.value as Provider)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm">
                  {(Object.keys(PROVIDER_LABELS) as Provider[]).map(p => (
                    <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                  ))}
                </select>
                <span className="text-xs text-zinc-400 block mt-1">
                  Aktuell nur PDF-Export für alle. Direkte API-Integration je Provider folgt.
                </span>
              </label>

              <label className="block">
                <span className="text-xs text-zinc-500 block mb-1">Offener Betrag (EUR)</span>
                <input type="text" value={amountEur} onChange={e => setAmountEur(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm"
                  placeholder="z.B. 147.50" />
              </label>

              <label className="block">
                <span className="text-xs text-zinc-500 block mb-1">Notizen (optional)</span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm resize-y"
                  placeholder="z.B. Letztes Kontaktversuch am ..., Mitglied antwortet nicht" />
              </label>

              <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-900">
                Diese Aktion wird im audit_log gespeichert und ist nicht rückgängig zu machen.
                Das Mitglied bleibt im System, aber die Forderung wird zur externen Bearbeitung übergeben.
              </div>
            </div>

            <footer className="flex justify-end gap-2 pt-5 mt-5 border-t border-zinc-100">
              <button onClick={() => setShowModal(false)} disabled={saving}
                className="px-4 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50">
                Abbrechen
              </button>
              <button onClick={submitHandoff} disabled={saving || !amountEur}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm flex items-center gap-1.5 disabled:opacity-50">
                <Check size={14} /> {saving ? 'Sende…' : 'Übergabe erfassen'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  )
}
