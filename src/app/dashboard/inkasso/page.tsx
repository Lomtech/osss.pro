'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { FileWarning, ArrowRight, Loader2, AlertTriangle } from 'lucide-react'
import { DunningPanel } from '@/components/DunningPanel'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { InkassoSettingsTab } from './_components/InkassoSettingsTab'

interface DunningMember {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  dunning_level: number
  dunning_amount_cents: number | null
  dunning_started_at: string | null
  dunning_last_action_at: string | null
}

const LEVEL_LABEL_DE = ['OK', '1. Mahnung', '2. Mahnung', 'Inkasso']
const LEVEL_LABEL_EN = ['OK', 'Reminder 1', 'Reminder 2', 'Collections']
const LEVEL_TONE = ['emerald', 'amber', 'amber', 'rose'] as const

/**
 * Inkasso-Übersicht für Owner.
 * Listet alle Mitglieder mit dunning_level > 0.
 * Bei Klick → Detail-Panel rechts.
 */
export default function InkassoPage() {
  const { lang } = useLanguage()
  const [members, setMembers] = useState<DunningMember[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<DunningMember | null>(null)
  const [tab, setTab] = useState<'cases' | 'settings'>('cases')

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: gym } = await (supabase.from('gyms') as any)
        .select('id').eq('owner_id', user.id).maybeSingle()
      if (!gym) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: list } = await (supabase.from('members') as any)
        .select('id, first_name, last_name, email, phone, dunning_level, dunning_amount_cents, dunning_started_at, dunning_last_action_at')
        .eq('gym_id', gym.id)
        .gt('dunning_level', 0)
        .order('dunning_amount_cents', { ascending: false, nullsFirst: false })

      setMembers((list ?? []) as DunningMember[])
    } finally {
      setLoading(false)
    }
  }

  const totalOpen = members.reduce((s, m) => s + (m.dunning_amount_cents ?? 0), 0)
  const escalatedCount = members.filter(m => m.dunning_level >= 3).length

  const t = lang === 'en'
    ? {
        title: 'Collections',
        intro: 'Members with outstanding balances. Record reminders, document actions, and hand over to a collections agency when needed.',
        kpiOpenCases: 'Open Cases',
        kpiEscalated: 'Handed to Collections',
        kpiTotalOpen: 'Total Outstanding',
        listHeading: 'List',
        emptyTitle: 'No open cases.',
        emptySub: 'All members are paying on time.',
        sinceLabel: 'since',
        memberLabel: 'Member',
        openProfile: 'Open full profile',
        emptyDetail: 'Select a member from the list to record collections actions.',
      }
    : {
        title: 'Inkasso',
        intro: 'Mitglieder mit offenen Forderungen. Erfasse Mahnungen, dokumentiere Aktionen, übergib bei Bedarf an Inkasso-Dienstleister.',
        kpiOpenCases: 'Offene Fälle',
        kpiEscalated: 'Inkasso-Eskalation',
        kpiTotalOpen: 'Offen gesamt',
        listHeading: 'Liste',
        emptyTitle: 'Keine offenen Fälle.',
        emptySub: 'Alle Mitglieder zahlen pünktlich.',
        sinceLabel: 'seit',
        memberLabel: 'Mitglied',
        openProfile: 'Voll-Profil öffnen',
        emptyDetail: 'Wähle ein Mitglied in der Liste, um Inkasso-Aktionen zu erfassen.',
      }

  const levelLabels = lang === 'en' ? LEVEL_LABEL_EN : LEVEL_LABEL_DE
  const locale = lang === 'en' ? 'en-US' : 'de-DE'

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-zinc-950 tracking-tight mb-1 flex items-center gap-2">
          <FileWarning className="text-amber-500" size={22} />
          {t.title}
        </h1>
        <p className="text-sm text-zinc-500 leading-relaxed">
          {t.intro}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-zinc-200">
        <button onClick={() => setTab('cases')} className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === 'cases' ? 'border-amber-500 text-amber-600' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}>
          {lang === 'en' ? 'Cases' : 'Fälle'}
        </button>
        <button onClick={() => setTab('settings')} className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === 'settings' ? 'border-amber-500 text-amber-600' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}>
          {lang === 'en' ? 'Settings' : 'Einstellungen'}
        </button>
      </div>

      {tab === 'settings' && <InkassoSettingsTab />}

      {tab === 'cases' && (<>
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <KPI label={t.kpiOpenCases} value={String(members.length)} tone="amber" />
        <KPI label={t.kpiEscalated} value={String(escalatedCount)} tone={escalatedCount > 0 ? 'rose' : 'zinc'} />
        <KPI label={t.kpiTotalOpen} value={(totalOpen / 100).toLocaleString(locale, { style: 'currency', currency: 'EUR' })} tone="zinc" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Liste */}
        <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-100">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">{t.listHeading} ({members.length})</h2>
          </div>

          {loading && <div className="p-8 text-center"><Loader2 className="animate-spin text-zinc-400 mx-auto" size={20} /></div>}

          {!loading && members.length === 0 && (
            <div className="p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 mx-auto flex items-center justify-center mb-3">✅</div>
              <p className="font-bold text-emerald-700">{t.emptyTitle}</p>
              <p className="text-xs text-zinc-500 mt-1">{t.emptySub}</p>
            </div>
          )}

          <ul className="divide-y divide-zinc-100 max-h-[600px] overflow-y-auto">
            {members.map(m => {
              const tone = LEVEL_TONE[m.dunning_level] ?? 'amber'
              const isSelected = selected?.id === m.id
              return (
                <li key={m.id}>
                  <button
                    onClick={() => setSelected(m)}
                    className={`w-full px-5 py-4 text-left hover:bg-zinc-50 transition-colors ${isSelected ? 'bg-amber-50/60' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-zinc-900 truncate">{m.first_name} {m.last_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            tone === 'rose' ? 'bg-rose-100 text-rose-700' :
                            tone === 'amber' ? 'bg-amber-100 text-amber-700' :
                            'bg-emerald-100 text-emerald-700'
                          }`}>
                            {levelLabels[m.dunning_level]}
                          </span>
                          {m.dunning_started_at && (
                            <span className="text-[10px] text-zinc-400">
                              {t.sinceLabel} {new Date(m.dunning_started_at).toLocaleDateString(locale)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {m.dunning_amount_cents != null && (
                          <p className="text-sm font-black tabular-nums text-zinc-900">
                            {(m.dunning_amount_cents / 100).toLocaleString(locale, { style: 'currency', currency: 'EUR' })}
                          </p>
                        )}
                        <ArrowRight size={12} className="inline-block text-zinc-300 mt-1" />
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Detail */}
        <div>
          {selected ? (
            <div className="space-y-4">
              <div className="bg-white border border-zinc-200 rounded-2xl p-5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">{t.memberLabel}</p>
                <p className="text-xl font-black text-zinc-900">{selected.first_name} {selected.last_name}</p>
                <div className="flex flex-col text-xs text-zinc-500 mt-2 space-y-1">
                  {selected.email && <a href={`mailto:${selected.email}`} className="hover:text-amber-600">📧 {selected.email}</a>}
                  {selected.phone && <a href={`tel:${selected.phone}`} className="hover:text-amber-600">📞 {selected.phone}</a>}
                  <Link href={`/dashboard/members/${selected.id}`} className="text-amber-600 hover:text-amber-700 mt-2">
                    → {t.openProfile}
                  </Link>
                </div>
              </div>
              <DunningPanel member={selected} onUpdate={() => void load()} />
            </div>
          ) : (
            <div className="bg-zinc-50 rounded-2xl border border-zinc-200 p-12 text-center text-sm text-zinc-400">
              <AlertTriangle size={28} className="mx-auto mb-3 text-zinc-300" />
              <p>{t.emptyDetail}</p>
            </div>
          )}
        </div>
      </div>
      </>)}
    </div>
  )
}

function KPI({ label, value, tone }: { label: string; value: string; tone: 'amber' | 'rose' | 'emerald' | 'zinc' }) {
  const colors = {
    amber:   'bg-amber-50 border-amber-200 text-amber-900',
    rose:    'bg-rose-50 border-rose-200 text-rose-900',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    zinc:    'bg-white border-zinc-200 text-zinc-900',
  }[tone]
  return (
    <div className={`rounded-2xl border p-4 ${colors}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-2xl font-black tabular-nums mt-1">{value}</p>
    </div>
  )
}
