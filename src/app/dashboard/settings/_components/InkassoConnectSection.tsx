'use client'

import { useState } from 'react'
import { Scale, Link2, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SectionHeader, sectionCls, inputCls, saveBtnCls } from './SettingsUI'

type Props = {
  initialConnected: boolean
  initialStatus: string | null
}

export function InkassoConnectSection({ initialConnected, initialStatus }: Props) {
  const [connected, setConnected] = useState(initialConnected)
  const [status, setStatus] = useState(initialStatus)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [legalForm, setLegalForm] = useState('')
  const [repName, setRepName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  async function connect() {
    setError(null); setNote(null)
    if (!firstName.trim() || !lastName.trim()) {
      setError('Vor- und Nachname des Inhabers sind erforderlich.')
      return
    }
    setBusy(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setBusy(false); setError('Nicht angemeldet'); return }
    const res = await fetch('/api/inkasso/onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        owner_first_name: firstName,
        owner_last_name: lastName,
        legal_form: legalForm,
        legal_representative_name: repName,
      }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(json.error ?? 'Verbindung fehlgeschlagen'); return }
    setConnected(true)
    setStatus(json.status ?? 'pending')
    setNote(json.note ?? 'Mit Paywise verbunden.')
  }

  return (
    <div className={sectionCls}>
      <SectionHeader icon={<Scale size={12} />} title="Inkasso-Anbieter (Paywise)" />
      <div className="p-5 space-y-4">
        {connected ? (
          <div className="flex items-start gap-2 text-sm">
            <Check size={16} className="text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-zinc-700">Mit Paywise verbunden</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                Status: {status ?? 'pending'}. Offene Forderungen können (automatisch ab Stufe 3
                oder manuell) an Paywise übergeben werden.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-500">
              Verbinde dein Gym mit Paywise, um offene Forderungen ans Inkasso zu übergeben.
              Mit dem Verbinden beauftragst du Paywise im Namen deines Studios — eingezogene
              Beträge werden auf deine hinterlegte IBAN ausgezahlt.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5">Inhaber-Vorname</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5">Inhaber-Nachname</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5">Rechtsform (optional)</label>
                <input value={legalForm} onChange={e => setLegalForm(e.target.value)} placeholder="z. B. Einzelunternehmen, GmbH, e. V." className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5">Gesetzl. Vertreter (optional)</label>
                <input value={repName} onChange={e => setRepName(e.target.value)} placeholder="Name" className={inputCls} />
              </div>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Vorab in den Einstellungen hinterlegen: <strong>Telefon, Adresse und IBAN</strong> des Gyms.
            </p>
            <button type="button" onClick={connect} disabled={busy} className={saveBtnCls}>
              <Link2 size={14} />
              {busy ? 'Verbinde…' : 'Mit Paywise verbinden'}
            </button>
          </>
        )}
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
        {note && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{note}</p>
        )}
      </div>
    </div>
  )
}
