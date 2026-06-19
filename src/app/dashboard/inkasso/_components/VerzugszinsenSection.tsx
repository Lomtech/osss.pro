'use client'

import { useState, useEffect } from 'react'
import { Percent, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { SectionHeader, sectionCls, sectionHeaderCls, inputCls, saveBtnCls } from '../../settings/_components/SettingsUI'

/**
 * Verzugszinsen-Sätze (§§ 247, 288 BGB) — aus der DATEV-Sektion extrahiert, weil
 * sie inhaltlich zum Inkasso gehören (PDF-Berechnung im Übergabe-Dossier).
 * Speichert nur dunning_interest_basisrate_pct / _surcharge_pct.
 */
export function VerzugszinsenSection() {
  const { t } = useLanguage()
  const [basisRate, setBasisRate] = useState('2.27')
  const [surcharge, setSurcharge] = useState('5.00')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from('gyms') as any)
        .select('dunning_interest_basisrate_pct, dunning_interest_surcharge_pct')
        .eq('owner_id', user.id).maybeSingle()
      if (data) {
        setBasisRate(String(data.dunning_interest_basisrate_pct ?? '2.27'))
        setSurcharge(String(data.dunning_interest_surcharge_pct ?? '5.00'))
      }
    })()
  }, [])

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }
    const basis = parseFloat(basisRate.replace(',', '.'))
    const sur = parseFloat(surcharge.replace(',', '.'))
    const res = await fetch('/api/gym/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        dunning_interest_basisrate_pct: isFinite(basis) ? basis : 2.27,
        dunning_interest_surcharge_pct: isFinite(sur) ? sur : 5.00,
      }),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
    else console.error('[inkasso] Verzugszinsen save failed', await res.text())
  }

  return (
    <div className={sectionCls}>
      <div className={sectionHeaderCls}>
        <SectionHeader icon={<Percent size={12} />} title="Verzugszinsen-Sätze (§§ 247, 288 BGB)" />
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs text-zinc-500">
          Für die PDF-Berechnung im Inkasso-Übergabe-Dossier. Der Basiszinssatz wird halbjährlich
          von der Bundesbank festgelegt (1.1. und 1.7.).
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1.5">Basiszinssatz (%)</label>
            <input value={basisRate} onChange={e => setBasisRate(e.target.value)} placeholder="2.27" className={inputCls} />
            <p className="text-xs text-zinc-400 mt-1">Stand 2025-07: 2,27 %</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1.5">Aufschlag (%)</label>
            <input value={surcharge} onChange={e => setSurcharge(e.target.value)} placeholder="5.00" className={inputCls} />
            <p className="text-xs text-zinc-400 mt-1">5 % Verbraucher / 9 % B2B</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1.5">Effektiv (errechnet)</label>
            <div className="px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-sm font-mono text-zinc-700">
              {(() => {
                const b = parseFloat(basisRate.replace(',', '.'))
                const s = parseFloat(surcharge.replace(',', '.'))
                return isFinite(b) && isFinite(s) ? `${(b + s).toFixed(2)} %` : '—'
              })()}
            </div>
          </div>
        </div>
        <button type="button" onClick={handleSave} disabled={saving} className={saveBtnCls}>
          <Save size={14} />
          {saved ? t('settings', 'saved') : saving ? t('settings', 'saving') : 'Verzugszinsen speichern'}
        </button>
      </div>
    </div>
  )
}
