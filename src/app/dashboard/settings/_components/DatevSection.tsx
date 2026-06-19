'use client'

import { useState, useEffect } from 'react'
import { FileSpreadsheet, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { SectionHeader, sectionCls, sectionHeaderCls, inputCls, saveBtnCls } from './SettingsUI'

type DatevSectionProps = {
  initialBeraternummer: string | null | undefined
  initialMandantennummer: string | null | undefined
}

export function DatevSection({ initialBeraternummer, initialMandantennummer }: DatevSectionProps) {
  const { t } = useLanguage()
  const [beraternummer, setBeraternummer] = useState('')
  const [mandantennummer, setMandantennummer] = useState('')
  const [debitor, setDebitor] = useState('10000')
  const [accountantEmail, setAccountantEmail] = useState('')
  const [dispatchEnabled, setDispatchEnabled] = useState(false)
  const [sendDay, setSendDay] = useState(1)
  const [lastDispatched, setLastDispatched] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setBeraternummer(initialBeraternummer ?? '')
    setMandantennummer(initialMandantennummer ?? '')
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from('gyms') as any)
        .select('datev_debitor_account, accountant_email, accountant_dispatch_enabled, accountant_send_day, accountant_last_dispatched_at')
        .eq('owner_id', user.id).maybeSingle()
      if (data) {
        setDebitor(data.datev_debitor_account ?? '10000')
        setAccountantEmail(data.accountant_email ?? '')
        setDispatchEnabled(Boolean(data.accountant_dispatch_enabled))
        setSendDay(data.accountant_send_day ?? 1)
        setLastDispatched(data.accountant_last_dispatched_at ?? null)
      }
    })()
  }, [initialBeraternummer, initialMandantennummer])

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSaving(false); return }
    // Server-side update via /api/gym/settings — umgeht CORS-Probleme die manche
    // Browser-Extensions auf direkten PATCH zu supabase.co triggern
    const res = await fetch('/api/gym/update', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        datev_beraternummer: beraternummer || null,
        datev_mandantennummer: mandantennummer || null,
        datev_debitor_account: debitor.trim() || '10000',
        accountant_email: accountantEmail.trim() || null,
        accountant_dispatch_enabled: dispatchEnabled && Boolean(accountantEmail.trim()),
        accountant_send_day: Math.max(1, Math.min(28, sendDay)),
      }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } else {
      console.error('[settings] save failed', await res.text())
    }
  }

  return (
    <div className={sectionCls}>
      <div className={sectionHeaderCls}>
        <SectionHeader icon={<FileSpreadsheet size={12} />} title={t('settings', 'datevExport')} />
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs text-zinc-500">
          {t('settings', 'datevDesc')}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1.5">{t('settings', 'advisorNumber')}</label>
            <input value={beraternummer} onChange={e => setBeraternummer(e.target.value)}
              placeholder="z. B. 1234567" className={inputCls} maxLength={7} />
            <p className="text-xs text-zinc-400 mt-1">{t('settings', 'advisorNumberDesc')}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1.5">{t('settings', 'clientNumber')}</label>
            <input value={mandantennummer} onChange={e => setMandantennummer(e.target.value)}
              placeholder="z. B. 1001" className={inputCls} maxLength={5} />
            <p className="text-xs text-zinc-400 mt-1">{t('settings', 'clientNumberDesc')}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1.5">Debitorenkonto</label>
            <input value={debitor} onChange={e => setDebitor(e.target.value)}
              placeholder="10000" className={inputCls} maxLength={8} />
            <p className="text-xs text-zinc-400 mt-1">SKR03 Standard 10000. Steuerberater kann eigenes setzen.</p>
          </div>
          <div />
        </div>

        <div className="border-t border-zinc-100 pt-4 mt-2">
          <h4 className="text-sm font-semibold text-zinc-900 mb-1">Steuerberater-Versand</h4>
          <p className="text-xs text-zinc-500 mb-3">
            Wenn aktiviert: jeden Monat am gewählten Tag werden alle Rechnungen + Gutschriften des Vormonats automatisch an die hinterlegte E-Mail-Adresse verschickt (als PDF-Anhänge).
          </p>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1.5">Steuerberater-E-Mail</label>
              <input type="email" value={accountantEmail} onChange={e => setAccountantEmail(e.target.value)}
                placeholder="steuerberater@kanzlei.de" className={inputCls} maxLength={320} />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1.5">Versand am Tag</label>
              <select value={sendDay} onChange={e => setSendDay(parseInt(e.target.value, 10))}
                className={inputCls}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d}.</option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={dispatchEnabled} onChange={e => setDispatchEnabled(e.target.checked)}
              className="mt-0.5" />
            <span className="text-sm text-zinc-700">
              Monatlich automatisch verschicken
              {dispatchEnabled && !accountantEmail.trim() && (
                <span className="block text-xs text-amber-700 mt-0.5">⚠️ E-Mail-Adresse erforderlich, sonst wird nicht versandt.</span>
              )}
            </span>
          </label>
          {lastDispatched && (
            <p className="text-xs text-zinc-500 mt-2">
              Zuletzt versandt: {new Date(lastDispatched).toLocaleString('de-DE')}
            </p>
          )}
        </div>

        <button type="button" onClick={handleSave} disabled={saving} className={saveBtnCls}>
          <Save size={14} />
          {saved ? t('settings', 'saved') : saving ? t('settings', 'saving') : t('settings', 'saveDatev')}
        </button>
      </div>
    </div>
  )
}
