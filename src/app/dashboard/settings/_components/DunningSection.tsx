'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { SectionHeader, sectionCls, inputCls, saveBtnCls } from './SettingsUI'

type DunningSectionProps = {
  initialLateFeeCents: number | null | undefined
  initialDaysL2: number | null | undefined
  initialDaysL3: number | null | undefined
  initialAutoInkasso: boolean | null | undefined
  initialDaysToInkasso: number | null | undefined
}

export function DunningSection({
  initialLateFeeCents,
  initialDaysL2,
  initialDaysL3,
  initialAutoInkasso,
  initialDaysToInkasso,
}: DunningSectionProps) {
  const { t } = useLanguage()
  const [lateFee, setLateFee] = useState('10.00')
  const [daysL2, setDaysL2] = useState(14)
  const [daysL3, setDaysL3] = useState(28)
  const [autoInkasso, setAutoInkasso] = useState(false)
  const [daysToInkasso, setDaysToInkasso] = useState(14)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hydrate from gym data when it loads
  useEffect(() => {
    setLateFee(typeof initialLateFeeCents === 'number' ? (initialLateFeeCents / 100).toFixed(2) : '10.00')
    setDaysL2(typeof initialDaysL2 === 'number' ? initialDaysL2 : 14)
    setDaysL3(typeof initialDaysL3 === 'number' ? initialDaysL3 : 28)
    setAutoInkasso(initialAutoInkasso === true)
    setDaysToInkasso(typeof initialDaysToInkasso === 'number' ? initialDaysToInkasso : 14)
  }, [initialLateFeeCents, initialDaysL2, initialDaysL3, initialAutoInkasso, initialDaysToInkasso])

  async function handleSave() {
    setError(null)
    const feeEur = parseFloat(lateFee.replace(',', '.'))
    if (!Number.isFinite(feeEur) || feeEur < 0 || feeEur > 50) {
      setError('Mahngebühr muss zwischen 0 und 50 € liegen.')
      return
    }
    if (!Number.isInteger(daysL2) || daysL2 < 1 || daysL2 > 90) {
      setError('Tage bis 2. Mahnung müssen zwischen 1 und 90 liegen.')
      return
    }
    if (!Number.isInteger(daysL3) || daysL3 < 7 || daysL3 > 180) {
      setError('Tage bis Inkasso-Drohung müssen zwischen 7 und 180 liegen.')
      return
    }
    if (daysL3 <= daysL2) {
      setError('Inkasso-Drohung muss nach 2. Mahnung erfolgen.')
      return
    }
    if (autoInkasso && (!Number.isInteger(daysToInkasso) || daysToInkasso < 1 || daysToInkasso > 180)) {
      setError('Tage bis Auto-Übergabe müssen zwischen 1 und 180 liegen.')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); setError('Nicht angemeldet'); return }
    const lateFeeCents = Math.round(feeEur * 100)
    // Server-side update via /api/gym/settings (CORS-resistent gegen Browser-Extensions)
    const res = await fetch('/api/gym/update', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        dunning_late_fee_cents: lateFeeCents,
        dunning_days_to_level_2: daysL2,
        dunning_days_to_level_3: daysL3,
        dunning_auto_inkasso_enabled: autoInkasso,
        dunning_days_to_inkasso: daysToInkasso,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setError(err.error ?? 'Update fehlgeschlagen')
      return
    }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className={sectionCls}>
      <SectionHeader icon={<AlertCircle size={12} />} title="Inkasso & Mahnungen" />
      <div className="p-5 space-y-4">
        <p className="text-xs text-zinc-500">
          Diese Werte werden auf Mahn-PDFs und im Auto-Eskalations-Cron verwendet.
        </p>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1.5">
            Mahngebühr (in €)
          </label>
          <input
            type="number"
            step={0.5}
            min={0}
            max={50}
            value={lateFee}
            onChange={e => setLateFee(e.target.value)}
            placeholder="10.00"
            className={inputCls}
          />
          <p className="text-xs text-zinc-400 mt-1">
            Pauschal ab 2. Mahnung (1×) und letzter Mahnung (2× kumuliert).
            § 288 Abs. 4 BGB-konform, üblich 5–10 €.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1.5">
              Tage bis 2. Mahnung
            </label>
            <input
              type="number"
              min={1}
              max={90}
              value={daysL2}
              onChange={e => setDaysL2(parseInt(e.target.value, 10) || 0)}
              className={inputCls}
            />
            <p className="text-xs text-zinc-400 mt-1">
              Frist nach 1. Mahnung (Default 14).
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1.5">
              Tage bis Inkasso-Drohung
            </label>
            <input
              type="number"
              min={7}
              max={180}
              value={daysL3}
              onChange={e => setDaysL3(parseInt(e.target.value, 10) || 0)}
              className={inputCls}
            />
            <p className="text-xs text-zinc-400 mt-1">
              Frist seit Mahn-Beginn (Default 28).
            </p>
          </div>
        </div>
        <div className="border-t border-zinc-100 pt-4">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoInkasso}
              onChange={e => setAutoInkasso(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-amber-500 focus:ring-amber-400"
            />
            <span className="text-sm">
              <span className="font-medium text-zinc-700">Automatisch ans Inkasso übergeben</span>
              <span className="block text-xs text-zinc-400 mt-0.5">
                Nach der letzten Mahnung (Stufe 3) wird die offene Forderung automatisch
                an den Inkasso-Anbieter übergeben — ohne manuellen Klick.
              </span>
            </span>
          </label>
          {autoInkasso && (
            <div className="mt-3 pl-[26px]">
              <label className="block text-xs font-medium text-zinc-600 mb-1.5">
                Tage nach letzter Mahnung bis Übergabe
              </label>
              <input
                type="number"
                min={1}
                max={180}
                value={daysToInkasso}
                onChange={e => setDaysToInkasso(parseInt(e.target.value, 10) || 0)}
                className={inputCls}
              />
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                Übergabe erfolgt nur, wenn ein Inkasso-Anbieter verbunden ist. Stelle sicher,
                dass die Beauftragung rechtlich gedeckt ist (AVV/AGB).
              </p>
            </div>
          )}
        </div>
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={saveBtnCls}
        >
          <Save size={14} />
          {saved
            ? t('settings', 'saved')
            : saving
              ? t('settings', 'saving')
              : 'Inkasso-Einstellungen speichern'}
        </button>
      </div>
    </div>
  )
}
