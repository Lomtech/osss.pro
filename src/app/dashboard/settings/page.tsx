'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Audit 2026-05-11: alle Gym-Profil-Updates laufen ab jetzt über
 * /api/gym/update (Same-Origin, Bearer-Auth) statt direkt aus dem
 * Browser auf supabase.co. Hintergrund: Browser-Preflight-Cache
 * blockierte PATCH gegen die Supabase-REST-API auch wenn der Server
 * PATCH offiziell erlaubt — Same-Origin-Route umgeht das Problem.
 */
async function patchGym(updates: Record<string, unknown>): Promise<{ ok: true } | { error: string }> {
  const { data: { session } } = await createClient().auth.getSession()
  const accessToken = session?.access_token
  if (!accessToken) return { error: 'Nicht eingeloggt' }
  const res = await fetch('/api/gym/update', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(updates),
  })
  const json = await res.json().catch(() => ({})) as { error?: string }
  if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` }
  return { ok: true }
}
import Image from 'next/image'
import {
  Building2, CreditCard, Save, ExternalLink, CheckCircle2, AlertCircle,
  Unlink, Zap, Copy, Check, Shield, UserPlus, Link2, Trash2, FileText,
  Users, ReceiptEuro, Tag, Award, Globe, Plus, Minus, ImagePlus, X,
  Package, Megaphone, Edit2,
} from 'lucide-react'
import { DEFAULT_BELT_SYSTEM, SPORT_PRESETS, resolveBeltSystem, isBeltFreeSport, type BeltSystem, type SportType } from '@/lib/belt-system'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useToast } from '@/components/Toast'
import { UpgradeModal } from './_components/UpgradeModal'
import { SectionHeader, CopyRow, inputCls, saveBtnCls, sectionCls, sectionHeaderCls } from './_components/SettingsUI'
import { DunningSection } from './_components/DunningSection'
import { InkassoConnectSection } from './_components/InkassoConnectSection'
import { DatevSection } from './_components/DatevSection'
import { GpsSection } from './_components/GpsSection'
import { AccountDeleteSection } from './_components/AccountDeleteSection'
import { ImportExportSection } from './_components/ImportExportSection'
import { LegalSection } from './_components/LegalSection'

type Tab = 'allgemein' | 'zahlungen' | 'training' | 'zugaenge' | 'vertraege'

function SettingsPageInner() {
  const { t, lang } = useLanguage()
  const toast = useToast()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<Tab>('allgemein')

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'allgemein',  label: t('settings', 'general'),   icon: <Building2 size={14} /> },
    { id: 'zahlungen',  label: t('settings', 'payments'),  icon: <CreditCard size={14} /> },
    { id: 'training',   label: t('settings', 'training'),  icon: <Award size={14} /> },
    { id: 'zugaenge',   label: t('settings', 'access'),    icon: <Globe size={14} /> },
    { id: 'vertraege',  label: t('settings', 'contracts'), icon: <Package size={14} /> },
  ]

  // Gym profile
  const [name, setName]             = useState('')
  const [address, setAddress]       = useState('')
  const [phone, setPhone]           = useState('')
  const [email, setEmail]           = useState('')
  const [monthlyFee, setMonthlyFee] = useState('')
  const [loading, setLoading]       = useState(false)
  const [saved, setSaved]           = useState(false)

  // Logo
  const [logoUrl, setLogoUrl]         = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const logoInputRef                  = useRef<HTMLInputElement>(null)

  // Stripe
  const [stripeConfigured, setStripeConfigured] = useState(false)
  const [stripeAccountId, setStripeAccountId]   = useState<string | null>(null)
  const [connectLoading, setConnectLoading]     = useState(false)
  const [stripeChargesEnabled, setStripeChargesEnabled] = useState<boolean | null>(null)
  const [syncLoading, setSyncLoading]           = useState(false)

  // Initial values loaded from gym row — passed down to sub-sections
  // which manage their own form state. Updated once on initial load.
  const [initialLegalName, setInitialLegalName]       = useState<string | null | undefined>(undefined)
  const [initialLegalAddress, setInitialLegalAddress] = useState<string | null | undefined>(undefined)
  const [initialLegalEmail, setInitialLegalEmail]     = useState<string | null | undefined>(undefined)
  const [initialDatevBerater, setInitialDatevBerater] = useState<string | null | undefined>(undefined)
  const [initialDatevMandant, setInitialDatevMandant] = useState<string | null | undefined>(undefined)
  const [initialDunningLateFeeCents, setInitialDunningLateFeeCents] = useState<number | null | undefined>(undefined)
  const [initialDunningDaysL2, setInitialDunningDaysL2] = useState<number | null | undefined>(undefined)
  const [initialDunningDaysL3, setInitialDunningDaysL3] = useState<number | null | undefined>(undefined)
  const [initialDunningAutoInkasso, setInitialDunningAutoInkasso] = useState<boolean | null | undefined>(undefined)
  const [initialDunningDaysToInkasso, setInitialDunningDaysToInkasso] = useState<number | null | undefined>(undefined)
  const [initialPaywiseConnected, setInitialPaywiseConnected] = useState(false)
  const [initialPaywiseStatus, setInitialPaywiseStatus] = useState<string | null>(null)
  const [initialGpsLat, setInitialGpsLat]   = useState<number | null>(null)
  const [initialGpsLng, setInitialGpsLng]   = useState<number | null>(null)
  const [initialGpsRadius, setInitialGpsRadius] = useState<number | null | undefined>(undefined)
  // Mirror of LegalSection's legalName, just for Produktiv-Checkliste preview.
  const [legalNameMirror, setLegalNameMirror] = useState('')

  // Staff
  type StaffMember = { id: string; name: string; email: string; role: string; accepted_at: string | null; invite_token: string }
  const [staffList, setStaffList]           = useState<StaffMember[]>([])
  const [staffEmail, setStaffEmail]         = useState('')
  const [staffName, setStaffName]           = useState('')
  const [staffInviting, setStaffInviting]   = useState(false)
  const [staffInviteUrl, setStaffInviteUrl] = useState<string | null>(null)
  const [staffEmailSent, setStaffEmailSent] = useState(false)
  const [copiedStaff, setCopiedStaff]       = useState(false)

  // Gym ID & public links
  const [gymId, setGymId]                     = useState<string | null>(null)
  const [gymSlug, setGymSlug]                 = useState('')
  const [slugSaving, setSlugSaving]           = useState(false)
  const [slugSaved, setSlugSaved]             = useState(false)
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [copiedGymPage, setCopiedGymPage]     = useState(false)
  const [copiedScheduleLink, setCopiedScheduleLink] = useState(false)
  const [copiedEmbedCode, setCopiedEmbedCode]       = useState(false)

  // Signup
  const [signupEnabled, setSignupEnabled]       = useState(false)
  const [signupToken, setSignupToken]           = useState<string | null>(null)
  const [whatsappGroupUrl, setWhatsappGroupUrl] = useState('')
  const [whatsappGroupSaving, setWhatsappGroupSaving] = useState(false)
  const [whatsappGroupSaved, setWhatsappGroupSaved]   = useState(false)
  const [whatsappGroupError, setWhatsappGroupError]   = useState<string | null>(null)
  const [contractTemplate, setContractTemplate] = useState('')
  const [wellpassTemplate, setWellpassTemplate] = useState('')
  const [trialTemplate, setTrialTemplate] = useState('')
  const [contractTab, setContractTab] = useState<'membership' | 'wellpass' | 'trial'>('membership')
  const [signupSaving, setSignupSaving]         = useState(false)
  const [signupSaved, setSignupSaved]           = useState(false)
  const [copiedSignup, setCopiedSignup]         = useState(false)
  const [copiedWellpass, setCopiedWellpass]     = useState(false)
  const [copiedTrial, setCopiedTrial]           = useState(false)

  // Class Types
  const [classTypesInput, setClassTypesInput]   = useState('gi, no-gi, open mat, kids, competition')
  const [classTypesSaving, setClassTypesSaving] = useState(false)
  const [classTypesSaved, setClassTypesSaved]   = useState(false)

  // Belt System
  const [beltSlots, setBeltSlots]         = useState<BeltSystem>(DEFAULT_BELT_SYSTEM)
  const [beltSaving, setBeltSaving]       = useState(false)
  const [beltSaved, setBeltSaved]         = useState(false)
  const [sportType, setSportType]         = useState<SportType>('bjj')
  const [beltEnabled, setBeltEnabled]     = useState(true)
  const [stripesEnabled, setStripesEnabled] = useState(true)

  // Membership plans
  type Plan = { id: string; name: string; description: string | null; price_cents: number; billing_interval: string; contract_months: number; is_active: boolean; sort_order: number }
  const [plans, setPlans]               = useState<Plan[]>([])
  const [planForm, setPlanForm]         = useState({ name: '', description: '', price: '', billingInterval: 'monthly', contractMonths: '0' })
  const [planFormOpen, setPlanFormOpen] = useState(false)
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [planSaving, setPlanSaving]     = useState(false)


  // Invoice & Tax
  const [taxNumber, setTaxNumber]                   = useState('')
  const [ustid, setUstid]                           = useState('')
  const [isKleinunternehmer, setIsKleinunternehmer] = useState(true)
  const [invoicePrefix, setInvoicePrefix]           = useState('RE')
  const [bankIban, setBankIban]                     = useState('')
  // Tracks whether the IBAN already lives in the encrypted column.
  // We cannot decrypt client-side (key is server-only), so we only show
  // a masked placeholder until the user types a new value.
  const [bankIbanEncrypted, setBankIbanEncrypted]   = useState(false)
  const [bankIbanDirty, setBankIbanDirty]           = useState(false)
  const [bankBic, setBankBic]                       = useState('')
  const [bankName, setBankName]                     = useState('')
  const [invoiceSaving, setInvoiceSaving]           = useState(false)
  const [invoiceSaved, setInvoiceSaved]             = useState(false)

  // (DATEV/Dunning/Import-Export/Account-Deletion live in their own sub-components.)
  // userAuthEmail is shared (Account deletion needs it; sourced from session).
  const [userAuthEmail, setUserAuthEmail] = useState('')

  // Confirm modal
  const [confirmState, setConfirmState] = useState<{
    open: boolean; title: string; description?: string; danger?: boolean; icon?: React.ReactNode; onConfirm: () => void
  }>({ open: false, title: '', onConfirm: () => {} })
  function askConfirm(opts: { title: string; description?: string; danger?: boolean; icon?: React.ReactNode; onConfirm: () => void }) {
    setConfirmState({ ...opts, open: true })
  }
  function closeConfirm() { setConfirmState(s => ({ ...s, open: false })) }

  // (GPS Check-in lives in its own sub-component.)

  // Plan
  const [gymPlan, setGymPlan]           = useState<string>('free')
  const [memberCount, setMemberCount]   = useState(0)
  const [planLimit, setPlanLimit]       = useState(30)
  const [loadingPlan, setLoadingPlan]   = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [upgradedBanner, setUpgradedBanner] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)



  const signupUrl = typeof window !== 'undefined' && signupToken
    ? `${window.location.origin}/signup/${signupToken}`
    : null

  // Public Onboarding-URLs für Wellpass + Probetraining nutzen den Slug
  // (nicht den Signup-Token — sind öffentlich, kein Geheimnis nötig).
  const wellpassUrl = typeof window !== 'undefined' && gymSlug
    ? `${window.location.origin}/wellpass/${gymSlug}`
    : null
  const trialUrl = typeof window !== 'undefined' && gymSlug
    ? `${window.location.origin}/trial/${gymSlug}`
    : null

  const stripeConnected = searchParams.get('stripe_connected') === '1'
  const stripeError     = searchParams.get('stripe_error')

  useEffect(() => {
    if (searchParams.get('upgraded') === '1') {
      setUpgradedBanner(true)
      const t = setTimeout(() => setUpgradedBanner(false), 5000)
      return () => clearTimeout(t)
    }
    if (searchParams.get('stripe_connected') === '1' || searchParams.get('stripe_error')) {
      setActiveTab('zahlungen')
    }
  }, [searchParams])

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('gyms')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle()
      if (data) {
        setGymId(data.id ?? null)
        const existingSlug = data.slug ?? ''
        const existingName = data.name ?? ''
        setName(existingName)
        if (existingSlug) {
          setGymSlug(existingSlug)
          setSlugManuallyEdited(true) // treat saved slug as intentional
        } else if (existingName) {
          // Auto-generate slug from existing name if none saved yet
          const auto = existingName.trim().toLowerCase()
            .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          setGymSlug(auto)
        }
        setAddress(data.address ?? '')
        setPhone(data.phone ?? '')
        setEmail(data.email ?? '')
        setLogoUrl(data.logo_url ?? null)
        setMonthlyFee(data.monthly_fee_cents ? ((data.monthly_fee_cents as number) / 100).toFixed(2) : '')
        setStripeAccountId(data.stripe_account_id)
        if (data.stripe_account_id && data.stripe_charges_enabled !== undefined) {
          setStripeChargesEnabled(data.stripe_charges_enabled ?? null)
        }
        setSignupEnabled(data.signup_enabled ?? true)
        setSignupToken(data.signup_token ?? null)
        setWhatsappGroupUrl(((data as { whatsapp_group_url?: string | null }).whatsapp_group_url) ?? '')
        setContractTemplate(data.contract_template ?? '')
        setWellpassTemplate((data as { wellpass_agreement_template?: string | null }).wellpass_agreement_template ?? '')
        setTrialTemplate((data as { trial_rules_template?: string | null }).trial_rules_template ?? '')

        setInitialLegalName(data.legal_name ?? '')
        setInitialLegalAddress(data.legal_address ?? '')
        setInitialLegalEmail(data.legal_email ?? '')
        setLegalNameMirror(data.legal_name ?? '')
        setTaxNumber(data.tax_number ?? '')
        setUstid(data.ustid ?? '')
        setIsKleinunternehmer(data.is_kleinunternehmer ?? true)
        setInvoicePrefix(data.invoice_prefix ?? 'RE')
        // IBAN: nur noch encrypted-Spalte (Plaintext wurde mit migration 0010 gedroppt).
        // Wenn gesetzt: Masked-Placeholder anzeigen — der Browser bekommt nie Plaintext zu sehen.
        const encrypted = (data as { bank_iban_enc?: string | null }).bank_iban_enc
        if (encrypted) {
          setBankIban('') // Input bleibt leer, wir zeigen Masked-Placeholder
          setBankIbanEncrypted(true)
        } else {
          setBankIban('')
          setBankIbanEncrypted(false)
        }
        setBankIbanDirty(false)
        setBankBic(data.bank_bic ?? '')
        setBankName(data.bank_name ?? '')
        setInitialDatevBerater(data.datev_beraternummer ?? '')
        setInitialDatevMandant(data.datev_mandantennummer ?? '')
        // Inkasso-Defaults werden in DunningSection selbst auf 10 €/14d/28d gefallen.
        const lateFeeCents = (data as { dunning_late_fee_cents?: number | null }).dunning_late_fee_cents
        setInitialDunningLateFeeCents(lateFeeCents ?? null)
        const daysL2 = (data as { dunning_days_to_level_2?: number | null }).dunning_days_to_level_2
        setInitialDunningDaysL2(daysL2 ?? null)
        const daysL3 = (data as { dunning_days_to_level_3?: number | null }).dunning_days_to_level_3
        setInitialDunningDaysL3(daysL3 ?? null)
        const autoInk = (data as { dunning_auto_inkasso_enabled?: boolean | null }).dunning_auto_inkasso_enabled
        setInitialDunningAutoInkasso(autoInk ?? null)
        const daysInk = (data as { dunning_days_to_inkasso?: number | null }).dunning_days_to_inkasso
        setInitialDunningDaysToInkasso(daysInk ?? null)
        const pwCompany = (data as { paywise_company_id?: string | null }).paywise_company_id
        setInitialPaywiseConnected(Boolean(pwCompany))
        const pwStatus = (data as { paywise_status?: string | null }).paywise_status
        setInitialPaywiseStatus(pwStatus ?? null)
        const rawClassTypes = data.class_types
        if (Array.isArray(rawClassTypes)) setClassTypesInput(rawClassTypes.join(', '))
        const savedSport = data.sport_type as SportType | undefined
        if (savedSport) setSportType(savedSport)
        setBeltEnabled(data.belt_system_enabled ?? true)
        setStripesEnabled(data.stripes_enabled ?? true)
        setBeltSlots(resolveBeltSystem(data.belt_system))
        setInitialGpsLat(data.latitude ?? null)
        setInitialGpsLng(data.longitude ?? null)
        setInitialGpsRadius(data.gps_radius_meters ?? 300)
        setGymPlan(data.plan ?? 'free')
        setPlanLimit(data.plan_member_limit ?? 30)
        const { count } = await supabase.from('members').select('*', { count: 'exact', head: true }).eq('gym_id', data.id).eq('is_active', true)
        setMemberCount(count ?? 0)
        // Load plans
        const { data: plansData } = await supabase.from('membership_plans').select('*').eq('gym_id', data.id).order('sort_order')
        if (plansData) setPlans(plansData)
      }
    })()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      setUserAuthEmail(session.user.email ?? '')
      const res = await fetch('/api/staff', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (res.ok) setStaffList(await res.json())
      // Platform Stripe key status (auth required since security hardening)
      const stripeStatusRes = await fetch('/api/stripe/status', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (stripeStatusRes.ok) {
        const sd = await stripeStatusRes.json()
        setStripeConfigured(sd.configured ?? false)
      }
      // Check Stripe Connect account completion status
      const statusRes = await fetch('/api/stripe/connect', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        if (statusData.connected) {
          setStripeChargesEnabled(statusData.charges_enabled ?? false)
        } else {
          setStripeChargesEnabled(null)
        }
      }
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true)
    const feeCents = monthlyFee ? Math.round(parseFloat(monthlyFee.replace(',', '.')) * 100) : 0
    // Clean and save slug together with gym name so it's never empty after first save
    const cleanSlug = gymSlug.trim().toLowerCase()
      .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    if (cleanSlug) setGymSlug(cleanSlug)
    await patchGym({
      name,
      address: address || null,
      phone: phone || null,
      email: email || null,
      monthly_fee_cents: feeCents,
      ...(cleanSlug ? { slug: cleanSlug } : {}),
    })
    setLoading(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  async function handleLogoUpload(file: File) {
    if (!file.type.startsWith('image/')) return
    setLogoUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLogoUploading(false); return }
    const ext = file.name.split('.').pop() ?? 'png'
    const path = `${user.id}/logo-${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage
      .from('gym-logos')
      .upload(path, file, { contentType: file.type })
    if (uploadErr) { toast.error((lang === 'en' ? 'Upload failed: ' : 'Upload fehlgeschlagen: ') + uploadErr.message); setLogoUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('gym-logos').getPublicUrl(path)
    await patchGym({ logo_url: publicUrl })
    setLogoUrl(publicUrl)
    window.dispatchEvent(new CustomEvent('gym-logo-updated', { detail: { url: publicUrl } }))
    setLogoUploading(false)
  }

  async function handleLogoRemove() {
    await patchGym({ logo_url: null })
    setLogoUrl(null)
    window.dispatchEvent(new CustomEvent('gym-logo-updated', { detail: { url: null } }))
  }

  async function handleConnect() {
    setConnectLoading(true)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      const res = await fetch('/api/stripe/connect', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else if (data.error) toast.error(data.error, { retry: handleConnect })
    } catch { /* ignore */ }
    setConnectLoading(false)
  }


  function handleDisconnect() {
    askConfirm({
      title: lang === 'en' ? 'Disconnect Stripe?' : 'Stripe-Verbindung trennen?',
      description: lang === 'en' ? 'Payments will stop working until reconnected.' : 'Zahlungen funktionieren nicht mehr bis zur Neuverbindung.',
      danger: true, icon: '⚠️',
      onConfirm: async () => { closeConfirm(); const { data: { session } } = await createClient().auth.getSession(); await fetch('/api/stripe/connect', { method: 'DELETE', headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } }); setStripeAccountId(null) },
    })
  }

  async function handleSyncPayments() {
    setSyncLoading(true)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      const res = await fetch('/api/stripe/sync-payments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      const data = await res.json()
      if (res.ok) {
        const parts = [
          `${data.inserted} neue Zahlung(en) hinzugefügt`,
          data.alreadyHad > 0 ? `${data.alreadyHad} bereits vorhanden` : '',
          data.noMemberId > 0 ? `${data.noMemberId} ohne Mitglieds-Zuordnung` : '',
          data.insertErrors?.length > 0 ? `⚠️ ${data.insertErrors.length} Fehler: ${data.insertErrors[0]}` : '',
        ].filter(Boolean).join('\n')
        const hasErrors = data.insertErrors?.length > 0
        if (hasErrors) {
          toast.warning(`Sync abgeschlossen:\n${parts}`)
        } else {
          toast.success(`Sync abgeschlossen:\n${parts}`)
        }
      } else {
        toast.error(data.error ?? 'Fehler beim Synchronisieren', { retry: handleSyncPayments })
      }
    } catch {
      toast.error('Netzwerkfehler', { retry: handleSyncPayments })
    } finally {
      setSyncLoading(false)
    }
  }

  async function handleUpgrade(plan: string, annual: boolean = false) {
    // 2026-05 single-tier model: loadingPlan-Tag enthält Billing-Intervall
    // damit das Modal die richtige Loading-State anzeigt (monthly vs annual).
    const loadingTag = `${plan}-${annual ? 'annual' : 'monthly'}`
    setLoadingPlan(loadingTag)
    const { data: { session } } = await createClient().auth.getSession()
    if (!session) { window.location.href = `/register?plan=${plan}&annual=${annual ? '1' : '0'}`; return }
    const res = await fetch('/api/stripe/owner-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ plan, annual }),
    })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    setLoadingPlan(null)
  }

  async function handlePortal() {
    setPortalLoading(true)
    const { data: { session } } = await createClient().auth.getSession()
    const res = await fetch('/api/stripe/owner-portal', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    setPortalLoading(false)
  }

  async function handleSlugSave() {
    if (!gymSlug.trim()) return
    setSlugSaving(true)
    const clean = gymSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    setGymSlug(clean)
    await patchGym({ slug: clean })
    setSlugSaving(false); setSlugSaved(true); setTimeout(() => setSlugSaved(false), 2000)
  }

  async function handleSignupSave() {
    setSignupSaving(true)
    await patchGym({
      signup_enabled:              signupEnabled,
      contract_template:           contractTemplate || null,
      wellpass_agreement_template: wellpassTemplate || null,
      trial_rules_template:        trialTemplate || null,
    })
    setSignupSaving(false); setSignupSaved(true); setTimeout(() => setSignupSaved(false), 2000)
  }


  async function handleWhatsappGroupSave() {
    setWhatsappGroupError(null)
    const trimmed = whatsappGroupUrl.trim()
    if (trimmed && !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+$/.test(trimmed)) {
      setWhatsappGroupError(lang === 'en'
        ? 'Invalid format. Must look like https://chat.whatsapp.com/XXX'
        : 'Ungültiges Format. Muss wie https://chat.whatsapp.com/XXX aussehen.')
      return
    }
    setWhatsappGroupSaving(true)
    const result = await patchGym({ whatsapp_group_url: trimmed || null })
    setWhatsappGroupSaving(false)
    if ('error' in result) {
      setWhatsappGroupError(result.error)
      return
    }
    setWhatsappGroupSaved(true)
    setTimeout(() => setWhatsappGroupSaved(false), 2000)
  }

  async function handleInvoiceSave() {
    setInvoiceSaving(true)
    const supabase = createClient()
    // Non-IBAN-Felder über /api/gym/update — gleicher Pfad wie restliche Saves.
    await patchGym({
      tax_number: taxNumber || null,
      ustid: ustid || null,
      is_kleinunternehmer: isKleinunternehmer,
      invoice_prefix: invoicePrefix || 'RE',
      bank_bic: bankBic || null,
      bank_name: bankName || null,
    })

    // IBAN nur dann ans /api/gym/iban schicken, wenn der User den Wert
    // tatsächlich verändert hat — sonst würden wir bei jedem Save den
    // Masked-Placeholder als leeren String interpretieren und die IBAN
    // versehentlich löschen.
    if (bankIbanDirty) {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const res = await fetch('/api/gym/iban', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ iban: bankIban || null }),
        })
        if (res.ok) {
          // Nach erfolgreichem Update: lokalen State neu setzen.
          // Falls IBAN gesetzt → ist jetzt verschlüsselt; Input leeren.
          if (bankIban) {
            setBankIbanEncrypted(true)
            setBankIban('')
          } else {
            setBankIbanEncrypted(false)
          }
          setBankIbanDirty(false)
        } else {
          const err = await res.json().catch(() => ({ error: 'Fehler' }))
          toast.error(`IBAN-Speicher fehlgeschlagen: ${err.error ?? 'Unbekannt'}`)
        }
      }
    }
    setInvoiceSaving(false); setInvoiceSaved(true); setTimeout(() => setInvoiceSaved(false), 2000)
  }

  async function handleClassTypesSave() {
    setClassTypesSaving(true)
    const types = classTypesInput.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    await patchGym({ class_types: types })
    setClassTypesSaving(false); setClassTypesSaved(true); setTimeout(() => setClassTypesSaved(false), 2000)
  }

  async function handleBeltSave() {
    setBeltSaving(true)
    await patchGym({
      belt_system: JSON.stringify(beltSlots),
      sport_type: sportType,
      belt_system_enabled: beltEnabled,
      stripes_enabled: stripesEnabled,
    })
    setBeltSaving(false); setBeltSaved(true); setTimeout(() => setBeltSaved(false), 2000)
  }

  async function handleStaffInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!staffEmail || !staffName) return
    setStaffInviting(true)
    const { data: { session } } = await createClient().auth.getSession()
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ email: staffEmail, name: staffName, role: 'trainer' }),
    })
    if (res.ok) {
      const newStaff = await res.json()
      setStaffList(prev => [newStaff, ...prev])
      setStaffInviteUrl(`${window.location.origin}/staff/accept?token=${newStaff.invite_token}`)
      setStaffEmailSent(newStaff.emailSent === true)
      setStaffEmail('')
      setStaffName('')
    }
    setStaffInviting(false)
  }

  function handleStaffDelete(id: string) {
    askConfirm({
      title: lang === 'en' ? 'Remove this trainer?' : 'Trainer entfernen?',
      danger: true, icon: '👤',
      onConfirm: async () => { closeConfirm(); const { data: { session } } = await createClient().auth.getSession(); await fetch(`/api/staff/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } }); setStaffList(prev => prev.filter(s => s.id !== id)) },
    })
  }

  async function handlePlanSave() {
    if (!planForm.name || !planForm.price) return
    setPlanSaving(true)
    const priceCents = Math.round(parseFloat(planForm.price.replace(',', '.')) * 100)
    const { data: { session } } = await createClient().auth.getSession()
    const token = session?.access_token ?? ''

    if (editingPlanId) {
      // For edits, just update DB directly (Stripe price can't be changed, would need new price)
      const payload = {
        name: planForm.name, description: planForm.description || null,
        price_cents: priceCents, billing_interval: planForm.billingInterval,
        contract_months: parseInt(planForm.contractMonths) || 0,
      }
      const supabase = createClient()
      const { data } = await supabase.from('membership_plans').update(payload).eq('id', editingPlanId).select().single()
      if (data) setPlans(ps => ps.map(p => p.id === editingPlanId ? { ...p, ...payload } : p))
      setEditingPlanId(null)
    } else {
      // New plan — call API to also create Stripe product+price
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: planForm.name,
          description: planForm.description || null,
          price_cents: priceCents,
          billing_interval: planForm.billingInterval,
          contract_months: parseInt(planForm.contractMonths) || 0,
        }),
      })
      const json = await res.json()
      if (res.ok && json.plan) setPlans(ps => [...ps, json.plan])
    }
    setPlanFormOpen(false)
    setPlanForm({ name: '', description: '', price: '', billingInterval: 'monthly', contractMonths: '0' })
    setPlanSaving(false)
  }

  function handlePlanDelete(planId: string) {
    askConfirm({
      title: lang === 'en' ? 'Delete this plan?' : 'Tarif löschen?',
      description: lang === 'en' ? 'Members assigned to this plan will keep it until changed.' : 'Mitglieder mit diesem Tarif behalten ihn bis zur Änderung.',
      danger: true, icon: '🗑️',
      onConfirm: async () => { closeConfirm(); const { data: { session } } = await createClient().auth.getSession(); const res = await fetch(`/api/plans/${planId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } }); if (res.ok) setPlans(ps => ps.filter(p => p.id !== planId)) },
    })
  }

  function handlePlanEdit(plan: Plan) {
    setPlanForm({
      name: plan.name, description: plan.description ?? '',
      price: (plan.price_cents / 100).toFixed(2).replace('.', ','),
      billingInterval: plan.billing_interval,
      contractMonths: String(plan.contract_months),
    })
    setEditingPlanId(plan.id); setPlanFormOpen(true)
  }

  function copyWithFeedback(text: string, setter: (v: boolean) => void) {
    navigator.clipboard.writeText(text)
    setter(true)
    setTimeout(() => setter(false), 2000)
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 max-w-lg">
      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmLabel={confirmState.danger ? (lang === 'en' ? 'Confirm' : 'Bestätigen') : 'OK'}
        cancelLabel={lang === 'en' ? 'Cancel' : 'Abbrechen'}
        danger={confirmState.danger}
        icon={confirmState.icon}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />
      <div className="mb-5">
        <h1 className="text-xl font-bold text-zinc-900">{t('settings', 'title')}</h1>
        <p className="text-zinc-400 text-xs mt-0.5">{t('nav', 'settings')}</p>
      </div>

      {/* Banners */}
      {upgradedBanner && (
        <div className="mb-4 p-3 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-zinc-500 flex-shrink-0" />
          <p className="text-zinc-800 text-sm font-medium">{t('settings', 'planUpdated')}</p>
        </div>
      )}
      {stripeConnected && (
        <div className="mb-4 p-3 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-zinc-500 flex-shrink-0" />
          <p className="text-zinc-800 text-sm font-medium">{t('settings', 'stripeConnectedBanner')}</p>
        </div>
      )}
      {stripeError && (
        <div className="mb-4 p-3 rounded-lg bg-zinc-50 border border-zinc-200 flex items-center gap-2">
          <AlertCircle size={15} className="text-zinc-500 flex-shrink-0" />
          <p className="text-zinc-700 text-sm">{t('settings', 'connectionFailed')}{stripeError}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 rounded-xl p-1 mb-6">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab.id
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── TAB: ALLGEMEIN ─────────────────────────────────────────────────── */}
      {activeTab === 'allgemein' && (
        <div className="space-y-4">
          {/* Plan-Card — Audit 2026-05-11: pricing.ts ist auf single-tier
              umgestellt (49€/Unlimited + 14-Tage-Trial statt Free-Tier).
              Diese Card spiegelt jetzt nur zwei Zustände:
                - 'pro'   = aktive Stripe-Subscription → ∞ Mitglieder, Portal-Btn
                - sonst   = Trial oder noch-nicht-bezahlt → Upgrade-Btn,
                            KEIN Member-Limit anzeigen (matched /pricing-Versprechen) */}
          <div className={`rounded-2xl p-5 border ${
            (gymPlan === 'standard' || gymPlan === 'pro') ? 'bg-zinc-900 border-slate-700' : 'bg-white border-zinc-200'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    (gymPlan === 'standard' || gymPlan === 'pro') ? 'bg-amber-500 text-white' : 'bg-zinc-200 text-zinc-600'
                  }`}>
                    {/* Audit 2026-05-13: PlanKey aus pricing.ts ist 'standard'.
                        Webhook setzt gyms.plan='standard' nach erfolgreichem Checkout.
                        UI matcht beide ('standard' = neuer single-tier, 'pro' = legacy). */}
                    {(gymPlan === 'standard' || gymPlan === 'pro') ? 'PRO' : 'TRIAL'}
                  </span>
                  <span className={`text-sm font-semibold ${(gymPlan === 'standard' || gymPlan === 'pro') ? 'text-white' : 'text-zinc-900'}`}>{t('settings', 'currentPlan')}</span>
                </div>
                <p className={`text-sm ${(gymPlan === 'standard' || gymPlan === 'pro') ? 'text-zinc-300' : 'text-zinc-500'}`}>
                  {memberCount} {t('members', 'activeMembers')}
                  {(gymPlan === 'standard' || gymPlan === 'pro') && <span className="ml-1">· ∞</span>}
                </p>
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0">
                {(gymPlan === 'standard' || gymPlan === 'pro') ? (
                  <button onClick={handlePortal} disabled={portalLoading}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-500 text-white hover:bg-amber-400 disabled:opacity-50 transition-colors">
                    {portalLoading ? t('settings', 'loading') : t('settings', 'manageSubscription')}
                  </button>
                ) : (
                  <button onClick={() => setShowUpgradeModal(true)} disabled={loadingPlan !== null}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-zinc-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors">
                    {t('settings', 'upgradeBtn')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Gym Profile */}
          <div className={sectionCls}>
            <SectionHeader icon={<Building2 size={12} />} title={t('settings', 'gymProfile')} />
            <form onSubmit={handleSubmit} className="p-5 space-y-4">

              {/* Logo upload */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">{t('settings', 'gymLogo')}</label>
                <div className="flex items-center gap-4">
                  {/* Preview */}
                  <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-100 border border-zinc-200 flex items-center justify-center">
                    {logoUrl ? (
                      <Image src={logoUrl} alt="Logo" width={64} height={64} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-0.5 w-full h-full bg-[#111827]">
                        <span className="text-[11px] font-black text-amber-400 italic leading-none">oss</span>
                        <div className="flex gap-0.5">
                          {[0,1,2].map(i => <div key={i} className="w-1 h-1 rounded-full bg-amber-500 opacity-70" />)}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f) }}
                    />
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={logoUploading}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                    >
                      <ImagePlus size={13} />
                      {logoUploading ? t('settings', 'uploadLogoUploading') : logoUrl ? t('settings', 'changeLogo') : t('settings', 'uploadLogo')}
                    </button>
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={handleLogoRemove}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-500 hover:text-red-500 hover:border-red-200 text-xs font-medium transition-colors"
                      >
                        <X size={12} /> {t('settings', 'remove')}
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-zinc-400 mt-2">{t('settings', 'logoHint')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">{t('settings', 'gymName')} *</label>
                <input
                  value={name}
                  onChange={e => {
                    const newName = e.target.value
                    setName(newName)
                    // Auto-generate slug from name unless user has manually edited it
                    if (!slugManuallyEdited) {
                      const auto = newName.trim().toLowerCase()
                        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
                        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
                      setGymSlug(auto)
                    }
                  }}
                  required
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">{t('settings', 'address')}</label>
                <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Musterstraße 1, 80331 München" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">{t('settings', 'phone')}</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+49 89 123456" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">{t('settings', 'email')}</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="info@gym.de" className={inputCls} />
                </div>
              </div>
              <button type="submit" disabled={loading} className={saveBtnCls}>
                <Save size={15} />
                {saved ? t('settings', 'saved') : loading ? t('settings', 'saving') : t('settings', 'saveProfile')}
              </button>
            </form>
          </div>

          {/* Produktiv-Checkliste */}
          <div className={sectionCls}>
            <SectionHeader icon={<Shield size={12} />} title={t('settings', 'productionChecklist')} />
            <div className="divide-y divide-gray-100">
              {[
                {
                  ok: !window.location.hostname.includes('localhost'),
                  title: t('settings', 'productionUrl'),
                  desc: window.location.hostname.includes('localhost')
                    ? <span className="text-amber-600">{t('settings', 'productionUrlDesc').replace('NEXT_PUBLIC_APP_URL', '')} <code className="font-mono bg-amber-50 px-1 rounded">NEXT_PUBLIC_APP_URL</code> in Vercel auf deine Domain.</span>
                    : <span className="text-zinc-400">{window.location.origin}</span>,
                },
                {
                  ok: !!stripeAccountId,
                  title: t('settings', 'stripeConnectCheck'),
                  desc: stripeAccountId
                    ? <span className="text-zinc-400">{t('settings', 'stripeConnectOk')}</span>
                    : <span className="text-amber-600">{t('settings', 'stripeConnectMissing')}</span>,
                },
                {
                  ok: !!legalNameMirror,
                  title: t('settings', 'privacyCheck'),
                  desc: legalNameMirror
                    ? <span className="text-zinc-400">{t('settings', 'privacyResponsible')}<strong className="text-zinc-600">{legalNameMirror}</strong> · <a href="/datenschutz" target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline inline-flex items-center gap-1">{t('settings', 'preview')} <ExternalLink size={10} /></a></span>
                    : <span className="text-amber-600">{t('settings', 'privacyMissing')}</span>,
                },
              ].map(item => (
                <div key={item.title} className="px-5 py-3 flex items-start gap-3">
                  <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${item.ok ? 'bg-zinc-200' : 'bg-amber-100'}`}>
                    {item.ok ? <Check size={10} className="text-zinc-600" /> : <span className="w-1.5 h-1.5 rounded-full bg-amber-500 block" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800">{item.title}</p>
                    <p className="text-xs mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <GpsSection
            initialLat={initialGpsLat}
            initialLng={initialGpsLng}
            initialRadius={initialGpsRadius}
          />
          <ImportExportSection />
          <AccountDeleteSection userAuthEmail={userAuthEmail} />
        </div>
      )}

      {/* ── TAB: ZAHLUNGEN ────────────────────────────────────────────────── */}
      {activeTab === 'zahlungen' && (
        <div className="space-y-4">

          {/* Stripe */}
          <div className={sectionCls}>
            <SectionHeader icon={<CreditCard size={12} />} title="Stripe" />
            <div className="p-5 space-y-4">
              {/* Connect */}
              <div className="rounded-lg border border-zinc-200 overflow-hidden">
                <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
                  <p className="text-sm font-semibold text-zinc-800">Stripe Connect</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stripeAccountId ? 'bg-zinc-200 text-zinc-700 border border-zinc-300' : 'bg-zinc-100 text-zinc-500 border border-zinc-200'}`}>
                    {stripeAccountId ? t('settings', 'connected') : t('settings', 'notConnected')}
                  </span>
                </div>
                <div className="p-4">
                  {stripeAccountId ? (
                    <div className="space-y-3">
                      {stripeChargesEnabled === false && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                          <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-semibold text-amber-800">{t('settings', 'onboardingIncomplete')}</p>
                            <p className="text-xs text-amber-700 mt-0.5">{t('settings', 'onboardingIncompleteDesc')}</p>
                          </div>
                        </div>
                      )}
                      {stripeChargesEnabled === true && (
                        <div className="flex items-center gap-2 text-zinc-600 text-sm">
                          <CheckCircle2 size={14} className="text-zinc-400 flex-shrink-0" />
                          {t('settings', 'stripeDirectFee')}
                        </div>
                      )}
                      {stripeChargesEnabled === null && (
                        <div className="flex items-center gap-2 text-zinc-600 text-sm">
                          <CheckCircle2 size={14} className="text-zinc-400 flex-shrink-0" />
                          {t('settings', 'stripeDirectFee')}
                        </div>
                      )}
                      <p className="font-mono text-xs bg-zinc-100 px-2 py-1 rounded text-zinc-500 truncate">{stripeAccountId}</p>
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        {lang === 'en'
                          ? 'Payments go directly to your Stripe account. Stripe automatically offers card, Apple Pay, Google Pay and SEPA based on your account status.'
                          : 'Zahlungen gehen direkt auf dein Stripe-Konto. Stripe bietet automatisch Karte, Apple Pay, Google Pay und SEPA an – je nach Freischaltungsstatus deines Kontos.'}
                      </p>

                      <div className="flex gap-2 flex-wrap">
                        {stripeChargesEnabled === false ? (
                          <button type="button" onClick={handleConnect} disabled={connectLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-xs font-semibold transition-colors">
                            <Zap size={11} /> {connectLoading ? t('settings', 'stripeOpening') : t('settings', 'continueSetup')}
                          </button>
                        ) : (
                          <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium transition-colors">
                            <ExternalLink size={11} /> Stripe Dashboard
                          </a>
                        )}
                        <button type="button" onClick={handleSyncPayments} disabled={syncLoading}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium transition-colors border border-zinc-200 disabled:opacity-50">
                          {syncLoading ? '⏳ Sync…' : '🔄 Zahlungen synchronisieren'}
                        </button>
                        <button type="button" onClick={handleDisconnect}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium transition-colors border border-red-200">
                          <Unlink size={11} /> {t('settings', 'disconnect')}
                        </button>
                      </div>

                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-zinc-600 text-sm">{t('settings', 'platformFeeDesc')}</p>
                      <div className="text-xs text-zinc-500 bg-zinc-50 rounded-lg p-3 space-y-1">
                        <p>{t('settings', 'feeExample')}</p>
                        <p>→ <strong className="text-zinc-700">~78,63 €</strong> {t('settings', 'feeYourAccount')}</p>
                        <p>→ <strong className="text-zinc-700">~1,37 €</strong> {t('settings', 'feePlatform')}</p>
                      </div>
                      <button type="button" onClick={handleConnect} disabled={connectLoading}
                        className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                        <Zap size={14} />
                        {connectLoading ? t('settings', 'stripeOpening') : t('settings', 'connectWithStripe')}
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* Rechnungen & Steuer */}
          <div className={sectionCls}>
            <SectionHeader icon={<ReceiptEuro size={12} />} title={t('settings', 'invoiceTax')} />
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-700">{t('settings', 'kleinunternehmer')}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{t('settings', 'kleinunternehmerDesc')}</p>
                </div>
                <button type="button" onClick={() => setIsKleinunternehmer(v => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${isKleinunternehmer ? 'bg-amber-500' : 'bg-zinc-200'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isKleinunternehmer ? 'translate-x-4' : ''}`} />
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5">{t('settings', 'taxNumber')}</label>
                <input value={taxNumber} onChange={e => setTaxNumber(e.target.value)} placeholder="12/345/67890" className={inputCls} />
              </div>
              {!isKleinunternehmer && (
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1.5">{t('settings', 'ustid')}</label>
                  <input value={ustid} onChange={e => setUstid(e.target.value)} placeholder="DE123456789" className={inputCls} />
                  <p className="text-xs text-zinc-400 mt-1">{t('settings', 'ustidDesc')}</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5">{t('settings', 'invoicePrefix')}</label>
                <input value={invoicePrefix} onChange={e => setInvoicePrefix(e.target.value)} placeholder="RE" className={inputCls} />
                <p className="text-xs text-zinc-400 mt-1">{t('settings', 'invoicePrefixExample')}</p>
              </div>
              <div className="pt-2 border-t border-zinc-100">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">{t('settings', 'bankDetails')}</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 mb-1.5">{t('settings', 'bank')}</label>
                    <input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Sparkasse München" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 mb-1.5">IBAN</label>
                    <input
                      value={bankIban}
                      onChange={e => { setBankIban(e.target.value); setBankIbanDirty(true) }}
                      placeholder={bankIbanEncrypted ? '•••• •••• •••• •••• (verschlüsselt gespeichert)' : 'DE89 3704 0044 0532 0130 00'}
                      className={`${inputCls} font-mono`}
                    />
                    {bankIbanEncrypted && !bankIbanDirty && (
                      <p className="text-xs text-zinc-500 mt-1">
                        IBAN ist verschlüsselt gespeichert. Zum Ändern eine neue eingeben.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 mb-1.5">BIC</label>
                    <input value={bankBic} onChange={e => setBankBic(e.target.value)} placeholder="COBADEFFXXX" className={`${inputCls} font-mono`} />
                  </div>
                </div>
              </div>
              <button type="button" onClick={handleInvoiceSave} disabled={invoiceSaving} className={saveBtnCls}>
                <Save size={14} />
                {invoiceSaved ? t('settings', 'saved') : invoiceSaving ? t('settings', 'saving') : t('settings', 'saveInvoiceSettings')}
              </button>
            </div>
          </div>

          <DatevSection
            initialBeraternummer={initialDatevBerater}
            initialMandantennummer={initialDatevMandant}
          />

          <DunningSection
            initialLateFeeCents={initialDunningLateFeeCents}
            initialDaysL2={initialDunningDaysL2}
            initialDaysL3={initialDunningDaysL3}
            initialAutoInkasso={initialDunningAutoInkasso}
            initialDaysToInkasso={initialDunningDaysToInkasso}
          />
          <InkassoConnectSection
            initialConnected={initialPaywiseConnected}
            initialStatus={initialPaywiseStatus}
          />

          <LegalSection
            initialLegalName={initialLegalName}
            initialLegalAddress={initialLegalAddress}
            initialLegalEmail={initialLegalEmail}
            onLegalNameChange={setLegalNameMirror}
          />
        </div>
      )}

      {/* ── TAB: TRAINING ─────────────────────────────────────────────────── */}
      {activeTab === 'training' && (
        <div className="space-y-4">

          {/* Trainings-Typen */}
          <div className={sectionCls}>
            <SectionHeader icon={<Tag size={12} />} title={t('settings', 'trainingTypes')} />
            <div className="p-5 space-y-4">
              <p className="text-zinc-500 text-sm">
                {t('settings', 'trainingTypesDesc')}
              </p>
              <input
                type="text"
                value={classTypesInput}
                onChange={e => setClassTypesInput(e.target.value)}
                placeholder="gi, no-gi, open mat, kids, competition"
                className={inputCls}
              />
              <div className="flex flex-wrap gap-2">
                {classTypesInput.split(',').map(s => s.trim()).filter(Boolean).map((ct, i) => (
                  <span key={i} className="px-2 py-1 rounded-full bg-zinc-100 text-zinc-700 text-xs font-medium">{ct}</span>
                ))}
              </div>
              <button onClick={handleClassTypesSave} disabled={classTypesSaving} className={saveBtnCls}>
                <Save size={14} />
                {classTypesSaved ? t('settings', 'saved') : classTypesSaving ? t('settings', 'saving') : t('common', 'save')}
              </button>
            </div>
          </div>

          {/* Belt System */}
          <div className={sectionCls}>
            <SectionHeader icon={<Award size={12} />} title={t('settings', 'beltSystem')} />
            <div className="p-5 space-y-4">
              {/* Sport type selector */}
              <div>
                <p className="text-xs font-medium text-zinc-600 mb-2">{t('settings', 'sportType')}</p>
                <div className="grid grid-cols-4 gap-1.5 mb-1.5">
                  {([
                    { id: 'bjj',       label: 'BJJ',       belt: true  },
                    { id: 'judo',      label: 'Judo',      belt: true  },
                    { id: 'karate',    label: 'Karate',    belt: true  },
                    { id: 'taekwondo', label: 'Taekwondo', belt: true  },
                    { id: 'wingtsun',  label: 'Wing Tsun', belt: true  },
                    { id: 'kungfu',    label: 'Kung Fu',   belt: true  },
                    { id: 'mma',       label: 'MMA',       belt: false },
                    { id: 'muaythai',  label: 'Muay Thai', belt: false },
                    { id: 'boxing',    label: lang === 'en' ? 'Boxing'   : 'Boxen',   belt: false },
                    { id: 'wrestling', label: lang === 'en' ? 'Wrestling' : 'Ringen',  belt: false },
                    { id: 'custom',    label: lang === 'en' ? 'Custom'    : 'Eigene',  belt: null  },
                  ] as { id: SportType; label: string; belt: boolean | null }[]).map(sport => (
                    <button
                      key={sport.id}
                      type="button"
                      onClick={() => {
                        setSportType(sport.id)
                        if (sport.belt === false) {
                          setBeltEnabled(false)
                        } else if (sport.belt === true) {
                          setBeltEnabled(true)
                          if (sport.id !== 'custom' && sport.id in SPORT_PRESETS) {
                            setBeltSlots(SPORT_PRESETS[sport.id as keyof typeof SPORT_PRESETS])
                          }
                        }
                      }}
                      className={`py-2 rounded-lg text-xs font-semibold transition-all border ${
                        sportType === sport.id
                          ? 'bg-zinc-900 text-white border-slate-900'
                          : 'bg-white text-zinc-600 border-zinc-200 hover:border-slate-300'
                      }`}
                    >
                      {sport.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  {isBeltFreeSport(sportType)
                    ? t('settings', 'beltFreeHint')
                    : sportType === 'custom'
                      ? t('settings', 'beltCustomHint')
                      : t('settings', 'beltPresetHint')}
                </p>
              </div>

              {/* Belt enabled toggle */}
              <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                <div>
                  <p className="text-sm font-medium text-zinc-700">{t('settings', 'beltSystemActive')}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {beltEnabled ? t('settings', 'beltSystemActiveDesc') : t('settings', 'beltSystemInactiveDesc')}
                  </p>
                </div>
                <button type="button" onClick={() => setBeltEnabled(v => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${beltEnabled ? 'bg-amber-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${beltEnabled ? 'translate-x-4' : ''}`} />
                </button>
              </div>

              {/* Stripes toggle */}
              <div className={`flex items-center justify-between gap-4 ${!beltEnabled ? 'opacity-30 pointer-events-none' : ''}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-800">{t('settings', 'showStripes')}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {stripesEnabled ? t('settings', 'showStripesDesc') : t('settings', 'noStripesDesc')}
                  </p>
                </div>
                <button type="button" onClick={() => setStripesEnabled(v => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${stripesEnabled ? 'bg-amber-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${stripesEnabled ? 'translate-x-4' : ''}`} />
                </button>
              </div>

              {/* Belt slot rows — only when enabled */}
              {!beltEnabled && (
                <div className="text-center py-6 text-zinc-400 text-sm">
                  {t('settings', 'beltSystemDisabledHint')}
                </div>
              )}
              <div className={`space-y-2 ${!beltEnabled ? 'opacity-30 pointer-events-none' : ''}`}>
                {beltSlots.map((slot, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400 w-4 text-right flex-shrink-0">{i + 1}.</span>
                    <input
                      type="text"
                      value={slot.label}
                      maxLength={20}
                      onChange={e => setBeltSlots(prev => prev.map((s, j) => j === i ? { ...s, label: e.target.value } : s))}
                      className="flex-1 border border-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 min-w-0"
                      placeholder={lang === 'en' ? 'e.g. Yellow' : 'z.B. Gelb'}
                    />
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <input type="color" value={slot.bg} title={lang === 'en' ? 'Background colour' : 'Hintergrundfarbe'}
                        onChange={e => setBeltSlots(prev => prev.map((s, j) => j === i ? { ...s, bg: e.target.value } : s))}
                        className="w-7 h-7 rounded cursor-pointer border border-zinc-200" />
                      <input type="color" value={slot.text} title={lang === 'en' ? 'Text colour' : 'Textfarbe'}
                        onChange={e => setBeltSlots(prev => prev.map((s, j) => j === i ? { ...s, text: e.target.value } : s))}
                        className="w-7 h-7 rounded cursor-pointer border border-zinc-200" />
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold w-16 text-center flex-shrink-0"
                      style={{ backgroundColor: slot.bg, color: slot.text }}>
                      {slot.label || '…'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setBeltSlots(prev => prev.filter((_, j) => j !== i))}
                      disabled={beltSlots.length <= 1}
                      className="flex-shrink-0 text-zinc-300 hover:text-red-400 disabled:opacity-20 transition-colors"
                      title={lang === 'en' ? 'Remove level' : 'Stufe entfernen'}
                    >
                      <Minus size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setBeltSlots(prev => [...prev, { key: `slot_${prev.length + 1}`, label: '', bg: '#e2e8f0', text: '#1e293b' }])}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-amber-600 transition-colors"
              >
                <Plus size={13} /> {t('settings', 'addLevel')}
              </button>

              <button onClick={handleBeltSave} disabled={beltSaving} className={saveBtnCls}>
                <Save size={14} />
                {beltSaved ? t('settings', 'saved') : beltSaving ? t('settings', 'saving') : t('settings', 'saveBeltSystem')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: ZUGÄNGE ──────────────────────────────────────────────────── */}
      {activeTab === 'zugaenge' && (
        <div className="space-y-4">

          {/* Mitglieder-Anmeldung */}
          <div className={sectionCls}>
            <div className={`${sectionHeaderCls} flex items-center justify-between`}>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <UserPlus size={12} /> {t('settings', 'memberSignup')}
              </p>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-xs text-zinc-500">{signupEnabled ? t('settings', 'activeLabel') : t('settings', 'inactiveLabel')}</span>
                <button type="button" onClick={() => setSignupEnabled(v => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${signupEnabled ? 'bg-amber-500' : 'bg-zinc-200'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${signupEnabled ? 'translate-x-4' : ''}`} />
                </button>
              </label>
            </div>
            <div className="p-5 space-y-4">
              {signupToken && (
                <div>
                  <CopyRow
                    label={t('settings', 'signupLinkLabel')}
                    value={signupUrl ?? ''}
                    copied={copiedSignup}
                    onCopy={() => copyWithFeedback(signupUrl ?? '', setCopiedSignup)}
                  />
                  {signupUrl && (
                    <a href={signupUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-amber-600 hover:underline mt-1">
                      <ExternalLink size={11} /> {t('settings', 'preview')}
                    </a>
                  )}
                  <p className="text-xs text-zinc-400 mt-1">
                    {signupEnabled ? t('settings', 'signupActiveHint') : t('settings', 'signupInactiveHint')}
                  </p>
                </div>
              )}

              {/* Wellpass-Onboarding-Link — nur sichtbar wenn Slug gesetzt */}
              {wellpassUrl && (
                <div>
                  <CopyRow
                    label="Wellpass-Anmeldelink"
                    value={wellpassUrl}
                    copied={copiedWellpass}
                    onCopy={() => copyWithFeedback(wellpassUrl, setCopiedWellpass)}
                  />
                  <a href={wellpassUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-amber-600 hover:underline mt-1">
                    <ExternalLink size={11} /> Vorschau
                  </a>
                  <p className="text-xs text-zinc-400 mt-1">
                    Für Wellpass / Hansefit / EGYM / Urban-Sports-Mitglieder. Kein SEPA — der Anbieter zahlt.
                  </p>
                </div>
              )}

              {/* Trial-Onboarding-Link */}
              {trialUrl && (
                <div>
                  <CopyRow
                    label="Probetraining-Link"
                    value={trialUrl}
                    copied={copiedTrial}
                    onCopy={() => copyWithFeedback(trialUrl, setCopiedTrial)}
                  />
                  <a href={trialUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-amber-600 hover:underline mt-1">
                    <ExternalLink size={11} /> Vorschau
                  </a>
                  <p className="text-xs text-zinc-400 mt-1">
                    Public-Page für Probestunden mit Hausordnung-Akzeptanz und Conversion-Tracking.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-2">Vertrags-Vorlagen</label>

                {/* Tab-Buttons: Mitglied / Wellpass / Probetraining */}
                <div className="flex items-center gap-1 mb-2 border-b border-zinc-200">
                  {([
                    { key: 'membership', label: 'Mitgliedschaft',  hint: 'Voll-Vertrag mit Tarif + SEPA' },
                    { key: 'wellpass',   label: 'Wellpass / Anbieter', hint: 'Kurz-Vereinbarung · kein SEPA' },
                    { key: 'trial',      label: 'Probetraining',  hint: 'Schnupperstunde · Haftung + Verhalten' },
                  ] as const).map(tab => {
                    const isActive = contractTab === tab.key
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setContractTab(tab.key)}
                        className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                          isActive
                            ? 'border-amber-400 text-zinc-900'
                            : 'border-transparent text-zinc-500 hover:text-zinc-700'
                        }`}
                      >
                        {tab.label}
                      </button>
                    )
                  })}
                </div>

                {contractTab === 'membership' && (
                  <>
                    <textarea
                      value={contractTemplate}
                      onChange={e => setContractTemplate(e.target.value)}
                      rows={10}
                      placeholder="Mitgliedschaftsvertrag (volle Bedingungen, SEPA, Tarife) — leer lassen für System-Default"
                      className="w-full px-3 py-2.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-sm font-mono placeholder-slate-400 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 resize-y"
                    />
                    <p className="text-xs text-zinc-400 mt-1">
                      Voller Mitgliedsvertrag für Direkt-Mitglieder. Leer = System-Default mit Hausordnung,
                      Haftungsausschluss, Kündigung, Datenschutz. Platzhalter:
                      <code className="bg-zinc-100 px-1 rounded mx-1">{'{{gym_name}}'}</code>
                      <code className="bg-zinc-100 px-1 rounded mx-1">{'{{gym_address}}'}</code>
                      <code className="bg-zinc-100 px-1 rounded mx-1">{'{{gym_url}}'}</code>
                    </p>
                  </>
                )}

                {contractTab === 'wellpass' && (
                  <>
                    <textarea
                      value={wellpassTemplate}
                      onChange={e => setWellpassTemplate(e.target.value)}
                      rows={10}
                      placeholder="Vereinbarung für Anbieter-Mitglieder (Wellpass / Hansefit / EGYM / Urban Sports) — leer lassen für System-Default"
                      className="w-full px-3 py-2.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-sm font-mono placeholder-slate-400 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 resize-y"
                    />
                    <p className="text-xs text-zinc-400 mt-1">
                      Kurze 4-Punkte-Vereinbarung für Anbieter-Mitglieder (kein SEPA — der Anbieter zahlt).
                      Leer = System-Default mit Verhalten, §823 BGB, Haftungsausschluss, Hausordnung.
                    </p>
                  </>
                )}

                {contractTab === 'trial' && (
                  <>
                    <textarea
                      value={trialTemplate}
                      onChange={e => setTrialTemplate(e.target.value)}
                      rows={10}
                      placeholder="Regelungen für Probestunden — leer lassen für System-Default"
                      className="w-full px-3 py-2.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 text-sm font-mono placeholder-slate-400 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 resize-y"
                    />
                    <p className="text-xs text-zinc-400 mt-1">
                      Kurz-Regelungen für Probetraining / Schnupperstunde. Leer = System-Default mit
                      Verhalten, Haftung, Hausordnung — angepasst an „Interessent&ldquo; statt „Mitglied&ldquo;.
                    </p>
                  </>
                )}
              </div>
              <button type="button" onClick={handleSignupSave} disabled={signupSaving} className={saveBtnCls}>
                <Save size={14} />
                {signupSaved ? t('settings', 'saved') : signupSaving ? t('settings', 'saving') : t('settings', 'saveSignup')}
              </button>
            </div>
          </div>

          {/* Benachrichtigungen */}
          <div className={sectionCls}>
            <SectionHeader icon={<Megaphone size={12} />} title={t('settings', 'notifications')} />
            <div className="p-5 space-y-3">
              <p className="text-zinc-500 text-sm leading-relaxed">
                {lang === 'en'
                  ? <>Notifications are sent automatically via <strong>email</strong> (to your gym email) and <strong>SMS</strong> (to your phone number) for every relevant event — new signups, cancellations, plan changes.</>
                  : <>Benachrichtigungen werden automatisch per <strong>E-Mail</strong> (an deine Gym-E-Mail) und <strong>SMS</strong> (an deine Telefonnummer) gesendet — bei Anmeldungen, Kündigungen und Planwechseln.</>
                }
              </p>
              <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-xs text-zinc-600 leading-relaxed">
                {lang === 'en'
                  ? <>SMS notifications use your phone number from <strong>General → Phone</strong>. Make sure it is set correctly.</>
                  : <>SMS-Benachrichtigungen nutzen deine Telefonnummer unter <strong>Allgemein → Telefon</strong>. Stelle sicher, dass sie eingetragen ist.</>
                }
              </div>
            </div>
          </div>

          {/* WhatsApp-Gruppe */}
          <div className={sectionCls}>
            <SectionHeader
              icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>}
              title={lang === 'en' ? 'WhatsApp Group' : 'WhatsApp-Gruppe'}
            />
            <div className="p-5 space-y-4">
              <p className="text-zinc-500 text-sm leading-relaxed">
                {lang === 'en'
                  ? <>If you run a WhatsApp group for your members, paste the invite link here. New members will see it in their welcome email and in their portal — they can voluntarily join.</>
                  : <>Wenn du eine WhatsApp-Gruppe für deine Mitglieder hast, hinterlege hier den Einladungslink. Neue Mitglieder sehen ihn in der Willkommens-Mail und im Portal — sie können freiwillig beitreten.</>
                }
              </p>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5">
                  {lang === 'en' ? 'WhatsApp invite link' : 'WhatsApp-Einladungslink'}
                </label>
                <input
                  type="url"
                  value={whatsappGroupUrl}
                  onChange={e => { setWhatsappGroupUrl(e.target.value); setWhatsappGroupSaved(false); setWhatsappGroupError(null) }}
                  placeholder="https://chat.whatsapp.com/XXX..."
                  className={inputCls}
                />
                <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
                  {lang === 'en'
                    ? <>Get this from WhatsApp: open your group → tap group name → <strong>Invite via link</strong> → Copy.</>
                    : <>Findest du in WhatsApp: Gruppe öffnen → auf Gruppen-Name tippen → <strong>Einladungslink</strong> → Kopieren.</>}
                </p>
              </div>
              {whatsappGroupError && (
                <div className="text-xs p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">{whatsappGroupError}</div>
              )}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-900 leading-relaxed">
                {lang === 'en'
                  ? <>DSGVO-Note: WhatsApp = Meta (USA). Mention this in your privacy policy. Members join voluntarily — no PII is shared from our system; only the link is forwarded.</>
                  : <>DSGVO-Hinweis: WhatsApp = Meta (USA). Bitte in deiner Datenschutzerklärung erwähnen. Mitglieder treten freiwillig bei — wir teilen keine personenbezogenen Daten, nur der Link wird weitergegeben.</>}
              </div>
              <button type="button" onClick={handleWhatsappGroupSave} disabled={whatsappGroupSaving} className={saveBtnCls}>
                <Save size={14} />
                {whatsappGroupSaved
                  ? t('settings', 'saved')
                  : whatsappGroupSaving
                    ? t('settings', 'saving')
                    : (lang === 'en' ? 'Save invite link' : 'Einladungslink speichern')}
              </button>
            </div>
          </div>

          {/* Öffentliche Gym-Seite */}
          <div className={sectionCls}>
            <SectionHeader icon={<Globe size={12} />} title={t('settings', 'publicGymPage')} />
            <div className="p-5 space-y-4">
              <p className="text-zinc-500 text-sm">
                {t('settings', 'publicGymPageDesc')}
              </p>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5">{t('settings', 'gymSlugLabel')}</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 shrink-0">osss.pro/gym/</span>
                  <input
                    value={gymSlug}
                    onChange={e => { setGymSlug(e.target.value); setSlugManuallyEdited(true) }}
                    placeholder={lang === 'en' ? 'my-gym' : 'mein-gym'}
                    className={inputCls + ' flex-1'}
                  />
                </div>
                <p className="text-xs text-zinc-400 mt-1">{t('settings', 'slugHint')}</p>
              </div>
              {gymSlug && (
                <CopyRow
                  label={t('settings', 'gymPageLabel')}
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/gym/${gymSlug}`}
                  copied={copiedGymPage}
                  onCopy={() => copyWithFeedback(`${window.location.origin}/gym/${gymSlug}`, setCopiedGymPage)}
                />
              )}
              {gymSlug && (
                <a href={`/gym/${gymSlug}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-amber-600 hover:underline">
                  <ExternalLink size={11} /> {t('settings', 'openPreview')}
                </a>
              )}
              <button type="button" onClick={handleSlugSave} disabled={slugSaving || !gymSlug.trim()} className={saveBtnCls}>
                <Save size={14} />
                {slugSaved ? t('settings', 'saved') : slugSaving ? t('settings', 'saving') : t('settings', 'saveUrl')}
              </button>
            </div>
          </div>

          {/* Öffentlicher Stundenplan */}
          {gymId && (
            <div className={sectionCls}>
              <SectionHeader icon={<Globe size={12} />} title={t('settings', 'publicSchedule')} />
              <div className="p-5 space-y-4">
                <p className="text-zinc-500 text-sm">{t('settings', 'publicScheduleDesc')}</p>
                <CopyRow
                  label={t('settings', 'directLink')}
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/schedule/${gymId}`}
                  copied={copiedScheduleLink}
                  onCopy={() => copyWithFeedback(`${window.location.origin}/schedule/${gymId}`, setCopiedScheduleLink)}
                />
                <CopyRow
                  label={t('settings', 'iframeEmbed')}
                  value={`<iframe src="${typeof window !== 'undefined' ? window.location.origin : ''}/schedule/${gymId}?embed=1" width="100%" height="600" frameborder="0" style="border-radius:12px"></iframe>`}
                  copied={copiedEmbedCode}
                  onCopy={() => copyWithFeedback(`<iframe src="${window.location.origin}/schedule/${gymId}?embed=1" width="100%" height="600" frameborder="0" style="border-radius:12px"></iframe>`, setCopiedEmbedCode)}
                />
              </div>
            </div>
          )}

          {/* Trainer & Personal */}
          <div className={sectionCls}>
            <SectionHeader icon={<Users size={12} />} title={t('settings', 'staffSection')} />
            <div className="p-5 space-y-4">
              <form onSubmit={handleStaffInvite} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 mb-1">{lang === 'en' ? 'Name' : 'Name'}</label>
                    <input value={staffName} onChange={e => setStaffName(e.target.value)} required placeholder="Max Mustermann" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 mb-1">Email</label>
                    <input type="email" value={staffEmail} onChange={e => setStaffEmail(e.target.value)} required placeholder="trainer@gym.de" className={inputCls} />
                  </div>
                </div>
                <button type="submit" disabled={staffInviting} className={saveBtnCls}>
                  <UserPlus size={14} />
                  {staffInviting ? t('settings', 'inviting') : t('settings', 'inviteStaffBtn')}
                </button>
              </form>

              {staffInviteUrl && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
                    <Link2 size={11} /> {t('settings', 'inviteLinkNote')}
                  </p>
                  <CopyRow label="" value={staffInviteUrl} copied={copiedStaff} onCopy={() => copyWithFeedback(staffInviteUrl, setCopiedStaff)} />
                  {staffEmailSent
                    ? <p className="text-xs text-zinc-500">{t('settings', 'emailSent')}</p>
                    : <p className="text-xs text-amber-700">{t('settings', 'noResend')}</p>
                  }
                </div>
              )}

              {staffList.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-zinc-500">{t('settings', 'currentStaff')} ({staffList.length})</p>
                  <div className="divide-y divide-gray-100 rounded-lg border border-zinc-200 overflow-hidden">
                    {staffList.map(s => {
                      const inviteLink = s.invite_token ? `${typeof window !== 'undefined' ? window.location.origin : ''}/staff/accept?token=${s.invite_token}` : null
                      return (
                        <div key={s.id} className="flex items-center gap-3 px-4 py-3 bg-white">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-800 truncate">{s.name}</p>
                            <p className="text-xs text-zinc-400 truncate">{s.email}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.accepted_at ? 'bg-zinc-200 text-zinc-700 border border-zinc-300' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                              {s.accepted_at ? t('settings', 'staffActive') : t('settings', 'staffInvited')}
                            </span>
                            {!s.accepted_at && inviteLink && (
                              <button type="button"
                                onClick={() => copyWithFeedback(inviteLink, setCopiedStaff)}
                                className="text-zinc-300 hover:text-amber-500 transition-colors" title="Link kopieren">
                                <Copy size={13} />
                              </button>
                            )}
                            <button type="button" onClick={() => handleStaffDelete(s.id)} className="text-zinc-300 hover:text-red-500 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: VERTRÄGE ─────────────────────────────────────────────────── */}
      {activeTab === 'vertraege' && (
        <div className="space-y-4">

          {/* AVV — Auftragsverarbeitungsvertrag (DSGVO Art. 28) */}
          <div className={sectionCls}>
            <div className={sectionHeaderCls}>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <Shield size={12} /> Auftragsverarbeitungsvertrag (AVV)
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs text-zinc-500 leading-relaxed mb-4">
                Pflicht nach Art. 28 DSGVO. Regelt, wie Osss die personenbezogenen Daten deiner Mitglieder
                in deinem Auftrag verarbeitet. Elektronische Unterzeichnung &mdash; rechtsverbindlich nach
                eIDAS Art. 25(1).
              </p>
              <a
                href="/dashboard/settings/avv"
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 transition-colors"
              >
                <FileText size={14} /> AVV ansehen &amp; unterzeichnen
              </a>
            </div>
          </div>

          {/* IBAN-Check Tool */}
          <div className={sectionCls}>
            <div className={sectionHeaderCls}>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <CreditCard size={12} /> IBAN-Check (CSV-Upload)
              </p>
            </div>
            <div className="p-5">
              <p className="text-xs text-zinc-500 leading-relaxed mb-4">
                Lade eine CSV mit Mitglieder-IBANs hoch — wir pr&uuml;fen offline jede Bankverbindung
                auf Format und Pr&uuml;fziffer. Nutze das vor SEPA-Migration, um Tippfehler zu finden.
                Daten verlassen deinen Browser nicht.
              </p>
              <a
                href="/dashboard/iban-check"
                className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold px-4 py-2 transition-colors"
              >
                <CreditCard size={14} /> IBAN-Check &ouml;ffnen
              </a>
            </div>
          </div>

          {/* Membership plans */}
          <div className={sectionCls}>
            <div className={`${sectionHeaderCls} flex items-center justify-between`}>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <Package size={12} /> {t('settings', 'membershipPlansSection')}
              </p>
              {!planFormOpen && (
                <button type="button" onClick={() => { setPlanFormOpen(true); setEditingPlanId(null); setPlanForm({ name: '', description: '', price: '', billingInterval: 'monthly', contractMonths: '0' }) }}
                  className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-500 font-medium">
                  <Plus size={12} /> {t('settings', 'addPlanBtn')}
                </button>
              )}
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-zinc-500">
                {t('settings', 'membershipPlansDesc')}
              </p>

              {/* Plan form */}
              {planFormOpen && (
                <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 space-y-3">
                  <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                    {editingPlanId ? t('settings', 'editPlan') : t('settings', 'newPlan')}
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 mb-1">{lang === 'en' ? 'Name *' : 'Name *'}</label>
                    <input value={planForm.name} onChange={e => setPlanForm(p => ({ ...p, name: e.target.value }))}
                      placeholder={lang === 'en' ? 'e.g. Annual plan' : 'z.B. Jahresvertrag'} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 mb-1">{t('settings', 'description')}</label>
                    <input value={planForm.description} onChange={e => setPlanForm(p => ({ ...p, description: e.target.value }))}
                      placeholder={lang === 'en' ? 'e.g. Best price, full flexibility' : 'z.B. Günstigster Preis, volle Flexibilität'} className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 mb-1">{lang === 'en' ? 'Price (€) *' : 'Preis (€) *'}</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">€</span>
                        <input value={planForm.price} onChange={e => setPlanForm(p => ({ ...p, price: e.target.value }))}
                          placeholder="89,00" className="w-full pl-7 pr-3 py-2.5 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-sm placeholder-slate-400 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 mb-1">{t('settings', 'billingInterval')}</label>
                      <select value={planForm.billingInterval} onChange={e => setPlanForm(p => ({ ...p, billingInterval: e.target.value }))} className={inputCls}>
                        <option value="monthly">{t('settings', 'monthly')}</option>
                        <option value="biannual">{t('settings', 'biannual')}</option>
                        <option value="annual">{t('settings', 'annual')}</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 mb-1">{t('settings', 'minTerm')}</label>
                    <select value={planForm.contractMonths} onChange={e => setPlanForm(p => ({ ...p, contractMonths: e.target.value }))} className={inputCls}>
                      <option value="0">{t('settings', 'cancelAnytimeOpt')}</option>
                      <option value="1">{lang === 'en' ? '1 month' : '1 Monat'}</option>
                      <option value="3">{lang === 'en' ? '3 months' : '3 Monate'}</option>
                      <option value="6">{lang === 'en' ? '6 months' : '6 Monate'}</option>
                      <option value="12">{lang === 'en' ? '12 months' : '12 Monate'}</option>
                      <option value="18">{lang === 'en' ? '18 months' : '18 Monate'}</option>
                      <option value="24">{lang === 'en' ? '24 months' : '24 Monate'}</option>
                    </select>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => { setPlanFormOpen(false); setEditingPlanId(null) }}
                      className="flex-1 py-2.5 rounded-lg border border-zinc-200 text-zinc-600 text-sm font-medium hover:bg-white transition-colors">
                      {t('common', 'cancel')}
                    </button>
                    <button type="button" onClick={handlePlanSave} disabled={planSaving || !planForm.name || !planForm.price}
                      className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white font-semibold text-sm transition-colors">
                      {planSaving ? t('settings', 'saving') : editingPlanId ? t('settings', 'savePlan') : t('settings', 'createPlan')}
                    </button>
                  </div>
                </div>
              )}

              {/* Plans list */}
              {plans.length === 0 && !planFormOpen ? (
                <div className="text-center py-6 text-zinc-400 text-sm">
                  {t('settings', 'noPlans')}
                </div>
              ) : (
                <div className="space-y-2">
                  {plans.map(plan => {
                    const months = plan.billing_interval === 'annual' ? 12 : plan.billing_interval === 'biannual' ? 6 : 1
                    const perMonth = months > 1 ? ` (≈ €${(plan.price_cents / 100 / months).toFixed(2).replace('.', ',')}/${lang === 'en' ? 'mo' : 'Mo'})` : ''
                    return (
                      <div key={plan.id} className="flex items-start gap-3 p-3 rounded-xl border border-zinc-200 bg-zinc-50">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-zinc-800">{plan.name}</p>
                            {!plan.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-zinc-500">{t('settings', 'inactive')}</span>}
                          </div>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            €{(plan.price_cents / 100).toFixed(2).replace('.', ',')}
                            {plan.billing_interval === 'monthly' ? t('settings', 'perMonth') : plan.billing_interval === 'biannual' ? t('settings', 'per6Months') : t('settings', 'perYear')}
                            {perMonth}
                            {' · '}
                            {plan.contract_months === 0 ? t('settings', 'cancelAnytimeLabel') : `${plan.contract_months}${t('settings', 'monthsTerm')}`}
                          </p>
                          {plan.description && <p className="text-xs text-zinc-400 mt-0.5">{plan.description}</p>}
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button type="button" onClick={() => handlePlanEdit(plan)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                            <Edit2 size={13} />
                          </button>
                          <button type="button" onClick={() => handlePlanDelete(plan.id)}
                            className="p-1.5 rounded-lg text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {showUpgradeModal && (
        <UpgradeModal
          currentPlan={gymPlan}
          loadingPlan={loadingPlan}
          onUpgrade={async (plan, annual) => { setShowUpgradeModal(false); await handleUpgrade(plan, annual) }}
          onClose={() => setShowUpgradeModal(false)}
        />
      )}
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsPageInner />
    </Suspense>
  )
}
