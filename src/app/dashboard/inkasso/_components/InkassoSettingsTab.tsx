'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { DunningSection } from '../../settings/_components/DunningSection'
import { InkassoConnectSection } from '../../settings/_components/InkassoConnectSection'

/**
 * „Einstellungen"-Tab der Inkasso-Zentrale — bündelt alles, was vorher über die
 * Settings-Seite verstreut war: Mahnstufen/Gebühren + Auto-Übergabe (DunningSection)
 * und Paywise-Verbindung. Lädt das Gym EINMAL und rendert erst dann,
 * damit die Sektionen mit korrekten Initialwerten mounten.
 */
export function InkassoSettingsTab() {
  const [gym, setGym] = useState<Record<string, unknown> | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoaded(true); return }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from('gyms') as any)
        .select('dunning_late_fee_cents, dunning_days_to_level_2, dunning_days_to_level_3, dunning_auto_inkasso_enabled, dunning_days_to_inkasso, paywise_company_id, paywise_status')
        .eq('owner_id', user.id).maybeSingle()
      setGym(data ?? null)
      setLoaded(true)
    })()
  }, [])

  if (!loaded) {
    return <div className="p-8 text-center"><Loader2 className="animate-spin text-zinc-400 mx-auto" size={20} /></div>
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <DunningSection
        initialLateFeeCents={gym?.dunning_late_fee_cents as number | null | undefined}
        initialDaysL2={gym?.dunning_days_to_level_2 as number | null | undefined}
        initialDaysL3={gym?.dunning_days_to_level_3 as number | null | undefined}
        initialAutoInkasso={gym?.dunning_auto_inkasso_enabled as boolean | null | undefined}
        initialDaysToInkasso={gym?.dunning_days_to_inkasso as number | null | undefined}
      />
      <InkassoConnectSection
        initialConnected={Boolean(gym?.paywise_company_id)}
        initialStatus={(gym?.paywise_status as string | null) ?? null}
      />
    </div>
  )
}
