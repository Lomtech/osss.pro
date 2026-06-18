// Landing page — Server Component.
//
// This file used to be a single 1375-line `'use client'` file pulling framer-motion,
// supabase, lucide-react and all interactive logic into the initial JS bundle. The
// Hero animations, podium parallax, video parallax, contact modal, mobile-menu
// toggle, sports tabs and footer-contact button now live as Client islands under
// `src/app/_landing/`. Everything else (pricing teaser, pain points, "how it
// works", features grid, German features, DATEV, cost proof, final CTA, newsletter,
// footer) renders as RSC HTML — no JS needed for first paint.
//
// Language detection is server-side via cookie (`lang`) → Accept-Language → 'de'.
// Server-rendered text matches what the client island sees on hydration so there
// is no flash. The LanguageSwitcher continues to mirror state into both
// localStorage and the cookie so future SSR renders agree.

import Link from 'next/link'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import {
  Users, CreditCard, Smartphone, Target, Award,
  FileSpreadsheet, Globe, FileEdit, FileText, Shield, Headphones,
  CheckCircle, ArrowRight, Zap, Download, Link2,
  Clock, Euro,
} from 'lucide-react'
import { OsssLogo, LogoMark } from '@/components/Logo'
import { NewsletterSignup } from '@/components/NewsletterSignup'
// Audit 2026-05-13: PILOT10-Discount + Slots-Konstanten entfernt.
import { getServerLang } from '@/lib/i18n/server'
import { HeroAnimations } from './_landing/HeroAnimations'
import { SportsTabs } from './_landing/SportsTabs'
import { ContactButton } from './_landing/ContactButton'
import { BookDemoSection } from './_landing/BookDemoSection'
import { Reveal } from './_landing/Reveal'

// Eingeloggte Gym-Owner sollen die Marketing-Landing nicht erst durchklicken,
// nur um aufs Dashboard zu kommen. Server-seitiger Auth-Check direkt am
// Render-Anfang → 302 zu /dashboard ohne überhaupt HTML zu shippen.
// Nur ausführen wenn ?stay=1 NICHT in der URL ist, damit man die Landing
// trotzdem absichtlich besuchen kann (z.B. zum Demo-Buchen-Link teilen).
async function isLoggedIn(): Promise<boolean> {
  // Auth-Check getrennt von redirect() halten — letzteres wirft intern
  // eine NEXT_REDIRECT-Exception, die wir NICHT im catch verschlucken
  // dürfen, sonst rendert die Landing trotzdem.
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll:    () => cookieStore.getAll(),
          setAll: () => {}, // RSC darf keine Cookies setzen
        },
      },
    )
    const { data: { user } } = await supabase.auth.getUser()
    return !!user
  } catch {
    return false
  }
}

export default async function Home({ searchParams }: { searchParams: Promise<{ stay?: string }> }) {
  const { stay } = await searchParams
  // Eingeloggte Gym-Owner direkt aufs Dashboard schicken — Marketing-Landing
  // nicht erst durchscrollen müssen. `?stay=1` lässt einen die Landing absicht-
  // lich behalten (zum Teilen / Demo-Buchen-Link-Test). redirect() läuft AUSSERHALB
  // try/catch, damit die NEXT_REDIRECT-Exception nicht verschluckt wird.
  if (stay !== '1' && (await isLoggedIn())) {
    redirect('/dashboard')
  }
  const lang = await getServerLang()

  // ── Static, language-keyed copy. Originally inlined as `lang === 'en' ? […] : […]`
  // expressions in the JSX; pulled out here so the JSX reads cleanly and stays RSC.
  const PAIN_POINTS_DATA = lang === 'en' ? [
    { icon: FileSpreadsheet, title: 'Excel & WhatsApp',     desc: 'Member lists in spreadsheets, payment reminders in chat. Three tools, no overview — and the monthly accounting chaos at the end.' },
    { icon: Globe,           title: 'International tools',  desc: 'Mindbody, Glofox & co. — English-only UI, no DATEV export, no German invoice layout.' },
    { icon: FileEdit,        title: 'Manual invoices',      desc: 'The same hour every month, just for invoices. Six hours a year on routine work software should have automated long ago.' },
  ] : [
    { icon: FileSpreadsheet, title: 'Excel & WhatsApp',     desc: 'Mitgliederlisten in Tabellen, Zahlungserinnerungen per Chat. Drei Tools, kein Überblick — und am Monatsende die Stress-Buchhaltung.' },
    { icon: Globe,           title: 'Internationale Tools', desc: 'Mindbody, Glofox & Co. — englische UI, kein DATEV-Export, kein deutsches Rechnungs-Layout.' },
    { icon: FileEdit,        title: 'Rechnungen per Hand',  desc: 'Jeden Monat dieselbe Stunde nur für Rechnungen. Sechs Stunden im Jahr für Routine, die Software längst übernehmen sollte.' },
  ]

  // Features-Datenstruktur mit ROI-Anker (Audit 2026-05-11):
  // Jedes Feature hat Pain (was nervt aktuell), Solution (was Osss tut),
  // roiTime + roiMoney (konservative Schätzungen bei ~50-150 Mitgliedern).
  // ROI-Werte basieren auf User-Interviews mit 4 Studio-Ownern und sind
  // bewusst zurückhaltend — soll glaubwürdig bleiben, nicht aufgepumpt.
  // Slug ermöglicht Anker-Links (#feature-members) für CRM/Mail-Cross-Links.
  const FEATURES_DATA = lang === 'en' ? [
    {
      slug: 'members', icon: Users, title: 'Manage members',
      desc: 'Profiles, contracts, family members, belts, notes — one card per member, everything in one place.',
      pain: 'Right now: 5 Excel versions, nobody knows who\'s still active.',
      roiTime: '~2 h/week saved', roiMoney: '~80 €/month',
    },
    {
      slug: 'sepa', icon: CreditCard, title: 'Collect dues via SEPA',
      desc: 'Set up Stripe direct debit. Members pay automatically. You never write an invoice by hand again.',
      pain: 'Right now: chasing late payers via WhatsApp, hand-written reminders.',
      roiTime: '~4 h/month saved', roiMoney: '~120 €/month + 0 % platform fee',
    },
    {
      slug: 'portal', icon: Smartphone, title: 'Member portal',
      desc: 'Members check in via QR or GPS, book classes, view training history. Browser-based — no app install.',
      pain: 'Right now: WhatsApp groups for "when\'s training?", same question 10× per week.',
      roiTime: '~1 h/week saved', roiMoney: '~40 €/month',
    },
    {
      slug: 'website', icon: Link2, title: 'Public gym website',
      desc: 'osss.pro/gym/your-name — schedule, pricing, photos, trial-class booking. Configured in 10 minutes, no code.',
      pain: 'Right now: WordPress that nobody maintains, web-designer charges 80 €/month.',
      roiTime: '~2 h/month saved', roiMoney: '~50-200 €/month web-designer',
    },
    {
      slug: 'leads', icon: Target, title: 'Lead pipeline',
      desc: 'Enquiries from your website flow in. Status, notes, follow-ups — from first contact to signed contract.',
      pain: 'Right now: leads via Instagram DM, Email, WhatsApp — half get forgotten.',
      roiTime: '~3 h/month saved', roiMoney: '~1 extra sign-up/month = ~80 €',
    },
    {
      slug: 'belts', icon: Award, title: 'Belt tracking',
      desc: 'Kyu grades, student grades, sash colours — pre-configured for 6 martial arts. Promotions with date and history.',
      pain: 'Right now: belt info in coach\'s head + photo album, nobody knows next test date.',
      roiTime: '~1 h/month saved', roiMoney: '~25 €/month',
    },
  ] : [
    {
      slug: 'members', icon: Users, title: 'Mitglieder verwalten',
      desc: 'Stammdaten, Verträge, Familienmitglieder, Belts, Notizen — pro Mitglied eine Karte, alles an einem Ort.',
      pain: 'Aktuell: 5 Excel-Versionen, niemand weiß wer noch aktiv ist.',
      roiTime: '~2 h/Woche gespart', roiMoney: '~80 €/Monat',
    },
    {
      slug: 'sepa', icon: CreditCard, title: 'Beiträge per SEPA',
      desc: 'Stripe-Lastschrift einrichten, Mitglieder zahlen automatisch. Du erstellst nie wieder eine Rechnung von Hand.',
      pain: 'Aktuell: Säumigen per WhatsApp hinterher, handgeschriebene Mahnungen.',
      roiTime: '~4 h/Monat gespart', roiMoney: '~120 €/Monat + 0 % Plattformgebühr',
    },
    {
      slug: 'portal', icon: Smartphone, title: 'Member-Portal',
      desc: 'Mitglieder checken per QR-Code oder GPS ein, buchen Kurse, sehen ihre Trainingshistorie. Browser-basiert — keine App-Installation.',
      pain: 'Aktuell: WhatsApp-Gruppen für „wann ist Training?", dieselbe Frage 10×/Woche.',
      roiTime: '~1 h/Woche gespart', roiMoney: '~40 €/Monat',
    },
    {
      slug: 'website', icon: Link2, title: 'Öffentliche Gym-Seite',
      desc: 'osss.pro/gym/dein-name — Stundenplan, Preise, Fotos, Probetraining-Buchung. In 10 Minuten konfiguriert, ohne eine Zeile Code.',
      pain: 'Aktuell: WordPress den keiner pflegt, Web-Designer-Rechnung 80 €/Monat.',
      roiTime: '~2 h/Monat gespart', roiMoney: '~50-200 €/Monat Web-Designer',
    },
    {
      slug: 'leads', icon: Target, title: 'Lead-Pipeline',
      desc: 'Anfragen aus deiner Website fließen direkt rein. Status, Notizen, Folge-Termine — vom Erstkontakt bis zum Mitglieds-Vertrag.',
      pain: 'Aktuell: Anfragen per Instagram-DM, Mail, WhatsApp — die Hälfte vergessen.',
      roiTime: '~3 h/Monat gespart', roiMoney: '~1 extra Anmeldung/Monat ≈ 80 €',
    },
    {
      slug: 'belts', icon: Award, title: 'Belt-Tracking',
      desc: 'Schülergrade, Kyu-Stufen, Sash-Farben — vorkonfiguriert für 6 Sportarten. Promotions mit Datum und Verlauf.',
      pain: 'Aktuell: Gurt-Stand im Kopf des Trainers + Foto-Album, niemand weiß den nächsten Prüfungs-Termin.',
      roiTime: '~1 h/Monat gespart', roiMoney: '~25 €/Monat',
    },
  ]

  const GERMAN_FEATURES_DATA = lang === 'en' ? [
    { icon: FileText,   title: 'German-spec invoices', desc: 'Compliant invoices for small businesses (§19 UStG) — required fields, sequential numbering, automatic dispatch. Set it up once, done.' },
    { icon: Download,   title: 'DATEV export',         desc: 'Export booking data as DATEV CSV. One click, one file — your accountant imports it directly. Most competitors only offer this as a paid add-on.' },
    { icon: Shield,     title: 'GDPR from day one',    desc: 'Data in EU/UK (London, EU adequacy decision). DPA signed electronically in your dashboard. No cookie-banner workarounds.' },
    { icon: Headphones, title: 'Direct support',       desc: 'No English-only ticketing system. Write us directly — oss@osss.pro.' },
  ] : [
    { icon: FileText,   title: '§19 UStG Rechnungen', desc: 'Kleinunternehmer-konforme Rechnungen — Pflichtangaben, fortlaufende Nummerierung, automatischer Versand. Einmal Daten eintragen, fertig.' },
    { icon: Download,   title: 'DATEV-Export',         desc: 'Buchungsdaten als DATEV-CSV exportieren. Ein Klick, eine Datei — dein Steuerberater importiert sie direkt. Bei den meisten anderen nur als Bezahl-Add-on.' },
    { icon: Shield,     title: 'DSGVO ab Tag eins',    desc: 'Daten in der EU/UK (London, Adequacy Decision der EU-Kommission). Auftragsverarbeitungsvertrag elektronisch im Dashboard. Keine Cookie-Banner-Tricks.' },
    { icon: Headphones, title: 'Support auf Deutsch', desc: 'Kein Support-Ticket-System auf Englisch. Schreib uns direkt — oss@osss.pro.' },
  ]

  const STEPS_DATA = lang === 'en' ? [
    { num: '01', title: 'Create account',     desc: 'Email, password, pick your sport. No credit card. No sales demo.' },
    { num: '02', title: 'Import members',     desc: 'CSV upload from your old tool or enter manually. Belts and contracts carry over.' },
    { num: '03', title: 'Gym goes live',      desc: 'Connect Stripe, fill the schedule, share the member portal. Done.' },
  ] : [
    { num: '01', title: 'Account anlegen',        desc: 'E-Mail, Passwort, Sportart auswählen. Keine Kreditkarte. Keine Verkaufs-Demo.' },
    { num: '02', title: 'Mitglieder importieren', desc: 'CSV-Upload aus deinem alten Tool oder manuell. Belts und Verträge bleiben erhalten.' },
    { num: '03', title: 'Gym geht live',          desc: 'Stripe verbinden, Stundenplan füllen, Mitglieder-Portal teilen. Fertig.' },
  ]

  // For DATEV mockup — server-rendered date, identical for SSR + initial paint.
  const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
  const yearNow = new Date().getFullYear()

  return (
    // overflow-x-clip statt -hidden: clip versteckt horizontalen Overflow ebenfalls,
    // erzeugt aber KEINEN scroll-context — wichtig damit `position: sticky` der Nav
    // (in HeroAnimations.tsx) relativ zum Viewport positioniert bleibt und beim
    // Scrollen zum #book-demo Anchor sichtbar bleibt. overflow-x-hidden hat den
    // Parent zum Scroll-Container gemacht, wodurch sticky an der DIV-Spitze stecken
    // blieb statt am Viewport-Top.
    <div className="min-h-screen bg-white font-sans overflow-x-clip">

      {/* ── NAV + HERO + PODIUM + DASHBOARD + VIDEO — animation-heavy Client island ── */}
      <HeroAnimations lang={lang} />

      {/* ── PAIN POINTS — direkt unter Hero: Besucher soll sofort erkennen
           dass wir sein konkretes Problem kennen, bevor wir Lösung zeigen. ── */}
      <Reveal as="section" className="py-16 sm:py-20 px-5 bg-zinc-950">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-amber-400 font-bold text-[10px] uppercase tracking-[0.2em] mb-3">
              {lang === 'en' ? 'Sound familiar?' : 'Kommt dir das bekannt vor?'}
            </p>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-3">
              {lang === 'en' ? 'Running a gym shouldn\'t feel like this.' : 'Ein Gym zu führen sollte nicht so sein.'}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PAIN_POINTS_DATA.map(p => (
              <div key={p.title} className="bg-zinc-900 rounded-2xl p-7 border border-zinc-800">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-5">
                  <p.icon size={18} className="text-amber-400" />
                </div>
                <p className="font-bold text-white mb-2">{p.title}</p>
                <p className="text-sm text-zinc-400 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ── PROMO-VIDEO — 64s Werbespot. Bewusst HIER zwischen Pain-Points (oben)
           und MAAT-Vergleich (unten): der Clip ist der „Lösungs-Reveal" zwischen
           Problem und Wettbewerbsbeweis. Das Poster ist die Eröffnungsszene
           („Mitglieder in Excel.") → knüpft visuell an die Pain-Points an.
           preload="metadata" → die 7 MB laden erst beim Klick, kein First-Paint-
           Hit. Narrierter Spot → KEIN Autoplay; native controls = Klick-zum-
           Abspielen mit Ton. RSC, kein JS-Island nötig. ── */}
      <Reveal as="section" className="py-20 sm:py-24 px-5 bg-zinc-950 border-t border-zinc-900">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-amber-400 font-bold text-[10px] uppercase tracking-[0.2em] mb-3">
              {lang === 'en' ? 'Osss in 60 seconds' : 'Osss in 60 Sekunden'}
            </p>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-3">
              {lang === 'en'
                ? 'This is your gym without the paperwork.'
                : 'So sieht dein Gym ohne Papierkram aus.'}
            </h2>
            <p className="text-zinc-400 max-w-md mx-auto text-sm leading-relaxed">
              {lang === 'en'
                ? 'The whole Osss workflow in one short clip — best with the sound on.'
                : 'Der ganze Osss-Workflow in einem kurzen Clip — am besten mit Ton.'}
            </p>
          </div>
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-black ring-1 ring-white/10 shadow-2xl shadow-amber-500/10">
            <video
              controls
              preload="metadata"
              playsInline
              poster="/osss-werbevideo-poster.jpg"
              className="w-full h-full object-cover"
            >
              <source src="/osss-werbevideo.mp4" type="video/mp4" />
              {lang === 'en'
                ? 'Your browser does not support the video tag.'
                : 'Dein Browser unterstützt kein Video.'}
            </video>
          </div>
        </div>
      </Reveal>

      {/* Audit 2026-05-13: Pilot-Discount-Strip (PILOT10, 40 % lebenslang) entfernt. */}

      {/* ── MAAT VERGLEICH — direkter Conversion-Hebel direkt unter dem Hero.
           Bewusst HIER (nicht weiter unten in „Cost Proof"), weil ein Owner der
           schon MAAT auf dem Schirm hat in den ersten 5 Sekunden sehen muss
           warum Osss billiger UND lokaler ist. Vier Karten = vier Buying-
           Concerns: Preis, DATEV, Support, Migration. Headline + Tabelle
           verlinken auf /vs-maat (Tiefen-Battle-Page). ── */}
      <Reveal as="section" className="py-20 px-5 bg-white border-b border-zinc-100">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-amber-600 font-bold text-[10px] uppercase tracking-[0.2em] mb-3">
              {lang === 'en' ? 'Switching from MAAT?' : 'Wechselst du von MAAT?'}
            </p>
            <h2 className="text-3xl sm:text-4xl font-black text-zinc-950 tracking-tight mb-3">
              {lang === 'en'
                ? <>Built in Germany.<br />Without the platform fee.</>
                : <>In Deutschland gebaut.<br />Ohne 1 % Plattformgebühr.</>}
            </h2>
            <p className="text-zinc-500 max-w-md mx-auto text-sm leading-relaxed">
              {lang === 'en'
                ? 'MAAT is an Italian SaaS that takes 1 % of every member payment. Osss is built one hour from Munich and takes 0 %.'
                : 'MAAT ist italienisches SaaS und nimmt 1 % von jeder Mitgliedszahlung. Osss wird 1 h von München gebaut und nimmt 0 %.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            {/* Plattformgebühr — der Killer-Punkt */}
            <div className="bg-emerald-50 rounded-2xl p-5 border-2 border-emerald-200 relative">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-3">
                {lang === 'en' ? 'Platform fee' : 'Plattformgebühr'}
              </p>
              <p className="text-3xl font-black text-emerald-700 tabular-nums mb-1">0 %</p>
              <p className="text-[11px] text-emerald-700 font-semibold mb-3">Osss</p>
              <div className="h-px bg-emerald-200 mb-3" />
              <p className="text-2xl font-black text-zinc-400 line-through tabular-nums mb-1">1 %</p>
              <p className="text-[11px] text-zinc-400">
                {lang === 'en' ? 'MAAT — ~600 €/year @ 50 members' : 'MAAT — ~600 €/Jahr bei 50 Mitgl.'}
              </p>
            </div>

            {/* DATEV */}
            <div className="bg-zinc-50 rounded-2xl p-5 border-2 border-zinc-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-3">
                DATEV-Export
              </p>
              <p className="flex items-center gap-2 text-emerald-700 font-bold mb-1">
                <CheckCircle size={16} /> {lang === 'en' ? 'Built-in' : 'Inklusive'}
              </p>
              <p className="text-[11px] text-emerald-700 font-semibold mb-3">Osss</p>
              <div className="h-px bg-zinc-200 mb-3" />
              <p className="text-zinc-400 font-bold text-sm mb-1">
                {lang === 'en' ? '✕ Not native' : '✕ Nicht nativ'}
              </p>
              <p className="text-[11px] text-zinc-400">
                {lang === 'en' ? 'MAAT — manual workaround' : 'MAAT — manueller Workaround'}
              </p>
            </div>

            {/* Support-Sprache */}
            <div className="bg-zinc-50 rounded-2xl p-5 border-2 border-zinc-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-3">
                Support
              </p>
              <p className="flex items-center gap-2 text-emerald-700 font-bold mb-1">
                <CheckCircle size={16} /> {lang === 'en' ? 'German · same day' : 'Deutsch · selber Tag'}
              </p>
              <p className="text-[11px] text-emerald-700 font-semibold mb-3">Osss · direkt vom Founder</p>
              <div className="h-px bg-zinc-200 mb-3" />
              <p className="text-zinc-400 font-bold text-sm mb-1">
                {lang === 'en' ? '✕ English / Italian' : '✕ Englisch / Italienisch'}
              </p>
              <p className="text-[11px] text-zinc-400">
                {lang === 'en' ? 'MAAT — ticket queue, Milan' : 'MAAT — Ticket-Schleife, Mailand'}
              </p>
            </div>

            {/* Migration */}
            <div className="bg-zinc-50 rounded-2xl p-5 border-2 border-zinc-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-3">
                {lang === 'en' ? 'Migration' : 'Wechsel'}
              </p>
              <p className="flex items-center gap-2 text-emerald-700 font-bold mb-1">
                <CheckCircle size={16} /> {lang === 'en' ? 'CSV + 1:1 help' : 'CSV + 1:1-Hilfe'}
              </p>
              <p className="text-[11px] text-emerald-700 font-semibold mb-3">Osss · gratis Setup-Call</p>
              <div className="h-px bg-zinc-200 mb-3" />
              <p className="text-zinc-400 font-bold text-sm mb-1">
                {lang === 'en' ? '✕ Self-serve only' : '✕ Nur Self-Serve'}
              </p>
              <p className="text-[11px] text-zinc-400">
                {lang === 'en' ? 'MAAT — no migration team' : 'MAAT — kein Migrations-Team'}
              </p>
            </div>
          </div>

          <div className="text-center flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/vs-maat" data-track="cta_vs_maat_landing"
              className="inline-flex items-center gap-2 bg-zinc-950 hover:bg-zinc-800 text-white font-bold px-6 py-3 rounded-xl text-sm transition-all hover:scale-[1.02] active:scale-[0.98]">
              {lang === 'en' ? 'Full comparison' : 'Vollständigen Vergleich'} <ArrowRight size={14} />
            </Link>
            <Link href="/rechner" data-track="cta_rechner_from_maat_strip"
              className="inline-flex items-center gap-2 bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-900 font-bold px-6 py-3 rounded-xl text-sm transition-all">
              {lang === 'en' ? 'Calculate your savings' : 'Was du sparst — rechnen'} <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </Reveal>

      {/* ── COST PROOF — quantitative € comparison, jetzt direkt nach
           qualitativem MAAT-Strip. Owner sieht erst die Dimensionen
           (Gebühr/DATEV/Support/Migration), dann die harten Zahlen pro Jahr.
           Vorher saß dieser Block weit unten kurz vor dem finalen CTA — mit
           der Reorder-Aktion 2026-05-10 nach vorne gezogen. ── */}
      <Reveal as="section" className="py-20 px-5 bg-zinc-50 border-y border-zinc-100">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-emerald-600 font-bold text-[10px] uppercase tracking-[0.25em] mb-3">
              {lang === 'en' ? 'Real numbers' : 'Echte Zahlen'}
            </p>
            <h2 className="text-3xl sm:text-4xl font-black text-zinc-950 tracking-tight mb-3">
              {lang === 'en' ? 'What does Excel really cost you?' : 'Was kostet dich Excel wirklich?'}
            </h2>
            <p className="text-zinc-500 text-sm max-w-md mx-auto leading-relaxed">
              {lang === 'en'
                ? 'Example: 50 members, 3h/week admin, €40/h. The numbers below are not estimates — they\'re math.'
                : 'Beispiel: 50 Mitglieder, 3 h/Woche Verwaltung, 40 €/h Stundensatz. Die Zahlen unten sind keine Schätzung — das ist Mathematik.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
            {/* Excel/Manuell */}
            <div className="bg-white rounded-2xl p-6 border-2 border-rose-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600 mb-2">
                {lang === 'en' ? 'Excel / manual' : 'Excel / manuell'}
              </p>
              <p className="text-3xl font-black text-zinc-900 tabular-nums tracking-tight">6.000 €</p>
              <p className="text-xs text-zinc-400 mt-1">
                {lang === 'en' ? '150 h/year × €40' : '150 h/Jahr × 40 €'}
              </p>
              <p className="text-[11px] text-zinc-400 mt-2 italic">
                {lang === 'en' ? 'Your time, calculated.' : 'Deine Lebenszeit, hochgerechnet.'}
              </p>
            </div>

            {/* MAAT — direkter Wettbewerbsvergleich, gleiche Studiogröße */}
            <div className="bg-white rounded-2xl p-6 border-2 border-amber-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-2">MAAT &amp; Co.</p>
              <p className="text-3xl font-black text-zinc-900 tabular-nums tracking-tight">1.188 €</p>
              <p className="text-xs text-zinc-400 mt-1">
                {lang === 'en' ? '49 €/mo + 1 % on dues' : '49 €/Mo + 1 % auf Beiträge'}
              </p>
              <p className="text-[11px] text-zinc-400 mt-2 italic">
                {lang === 'en' ? 'Platform fee at 50 members: 600 €/year.' : 'Plattformgebühr bei 50 Mitgl.: 600 €/Jahr.'}
              </p>
            </div>

            {/* Osss — single tier, annual */}
            <div className="bg-emerald-50 rounded-2xl p-6 border-2 border-emerald-300 relative">
              <div className="absolute -top-2.5 left-6 bg-emerald-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                Osss
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-2">{lang === 'en' ? 'Osss (annual)' : 'Osss (jährlich)'}</p>
              <p className="text-3xl font-black text-emerald-700 tabular-nums tracking-tight">468 €</p>
              <p className="text-xs text-emerald-700 mt-1">
                {lang === 'en' ? '39 €/month · 0 % on dues' : '39 €/Monat · 0 % auf Beiträge'}
              </p>
              <p className="text-[11px] text-emerald-700 mt-2 italic">
                {lang === 'en' ? '14-day trial, no credit card.' : '14-Tage-Trial, ohne Kreditkarte.'}
              </p>
            </div>
          </div>

          <div className="text-center">
            <Link href="/rechner"
              className="inline-flex items-center gap-2 bg-zinc-950 hover:bg-zinc-800 text-white font-bold px-6 py-3 rounded-xl text-sm transition-all hover:scale-[1.02] active:scale-[0.98]">
              {lang === 'en' ? 'Calculate with your numbers' : 'Mit deinen Zahlen rechnen'} <ArrowRight size={14} />
            </Link>
            <p className="text-xs text-zinc-400 mt-3">
              {lang === 'en'
                ? 'Slider-based — interactive, takes 30 seconds.'
                : 'Mit Slidern — interaktiv, dauert 30 Sekunden.'}
            </p>
          </div>
        </div>
      </Reveal>

      {/* ── SPORTS — interactive tabs Client island, intro is RSC ── */}
      <section className="bg-zinc-50 px-5 py-24 border-b border-zinc-100">
        <div className="max-w-5xl mx-auto">
          <Reveal as="div" className="text-center mb-12">
            <p className="text-amber-600 font-bold text-[10px] uppercase tracking-[0.2em] mb-3">{lang === 'en' ? '10 martial arts pre-configured' : '10 Kampfsportarten vorkonfiguriert'}</p>
            <h2 className="text-3xl sm:text-4xl font-black text-zinc-950 tracking-tight mb-3">{lang === 'en' ? 'What do you train?' : 'Was trainierst du?'}</h2>
            <p className="text-zinc-500 max-w-sm mx-auto text-sm leading-relaxed">
              {lang === 'en' ? 'Pick your sport. Osss sets up the belt system, class types and member fields automatically.' : 'Wähle deine Sportart. Osss konfiguriert Gürtelsystem, Klassen-Typen und Mitgliederfelder automatisch.'}
            </p>
          </Reveal>

          <SportsTabs lang={lang} />
        </div>
      </section>

      {/* ── HOW IT WORKS ── RSC */}
      <Reveal as="section" className="py-24 px-5 bg-amber-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-amber-700 font-bold text-[10px] uppercase tracking-[0.2em] mb-3">{lang === 'en' ? 'How it works' : 'So funktioniert\'s'}</p>
            <h2 className="text-3xl sm:text-4xl font-black text-zinc-950 tracking-tight mb-3">{lang === 'en' ? 'From signup to live in 10 minutes' : 'Vom Account zum Live-Gym in 10 Minuten'}</h2>
            <p className="text-zinc-500 max-w-sm mx-auto text-sm leading-relaxed">
              {lang === 'en' ? 'No sales call. No 14-day onboarding. Sign up, import, start.' : 'Kein Verkaufs-Call. Kein 14-Tage-Onboarding. Anmelden, importieren, loslegen.'}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {STEPS_DATA.map(step => (
              <div key={step.num}>
                <div className="bg-white rounded-2xl p-7 border border-amber-100 shadow-sm h-full">
                  <div className="text-amber-500 font-black text-4xl tracking-tighter leading-none mb-5">{step.num}</div>
                  <p className="font-bold text-zinc-900 mb-2">{step.title}</p>
                  <p className="text-sm text-zinc-500 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ── FEATURES ── RSC
           Audit 2026-05-11: Karten erweitert um Pain Point + ROI-Badges (Zeit + Geld).
           User-Wunsch: Owner soll sofort sehen WAS das Tool wirklich für ihn löst
           (Pain) und WAS er konkret zurückbekommt (Zeit + Euro). Anker-IDs (#feature-X)
           ermöglichen Direkt-Links aus Sales-Mails und Pricing-Page. */}
      <Reveal as="section" id="features" className="py-24 px-5 bg-white scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-zinc-400 font-bold text-[10px] uppercase tracking-[0.2em] mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl font-black text-zinc-950 tracking-tight mb-3">{lang === 'en' ? 'Six tools. One system.' : 'Sechs Werkzeuge. Ein System.'}</h2>
            <p className="text-zinc-500 max-w-xl mx-auto text-sm leading-relaxed">
              {lang === 'en'
                ? 'Each card: what you currently fight with, what Osss does about it, and the rough time + money you get back per month.'
                : 'Jede Karte: womit du dich aktuell rumschlägst, was Osss dagegen tut, und wieviel Zeit + Geld du grob pro Monat zurückbekommst.'}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES_DATA.map(f => (
              <div key={f.title} id={`feature-${f.slug}`}
                className="rounded-2xl border border-zinc-100 bg-zinc-50/50 p-6 hover:border-amber-200 hover:bg-white hover:shadow-sm transition-all duration-200 group scroll-mt-24">
                <div className="w-10 h-10 rounded-xl bg-amber-100 group-hover:bg-amber-200 flex items-center justify-center mb-4 transition-colors">
                  <f.icon size={18} className="text-amber-700" />
                </div>
                <p className="font-bold text-zinc-900 mb-2">{f.title}</p>
                <p className="text-sm text-zinc-500 leading-relaxed mb-4">{f.desc}</p>

                {/* Pain Point — rote Zeile, knapp, identifizierbar */}
                <div className="bg-rose-50/60 border border-rose-100 rounded-lg p-3 mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700 mb-1">
                    {lang === 'en' ? 'Pain Point' : 'Schmerzpunkt'}
                  </p>
                  <p className="text-xs text-rose-900 leading-relaxed">{f.pain}</p>
                </div>

                {/* ROI — Zeit + Geld in 2-Spalten Badge-Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-emerald-50/60 border border-emerald-100 rounded-lg p-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 mb-0.5 flex items-center gap-1">
                      <Clock size={9} /> {lang === 'en' ? 'Time' : 'Zeit'}
                    </p>
                    <p className="text-[11px] font-semibold text-emerald-900 leading-tight">{f.roiTime}</p>
                  </div>
                  <div className="bg-emerald-50/60 border border-emerald-100 rounded-lg p-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 mb-0.5 flex items-center gap-1">
                      <Euro size={9} /> {lang === 'en' ? 'Money' : 'Geld'}
                    </p>
                    <p className="text-[11px] font-semibold text-emerald-900 leading-tight">{f.roiMoney}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Total-ROI-Anker unter den 6 Cards — fasst alle Karten zusammen */}
          <div className="mt-10 max-w-2xl mx-auto bg-zinc-950 rounded-2xl p-6 sm:p-7 text-center">
            <p className="text-amber-400 font-bold text-[10px] uppercase tracking-[0.2em] mb-3">
              {lang === 'en' ? 'Total per month, conservatively' : 'Summe pro Monat, konservativ'}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-3xl sm:text-4xl font-black text-white tabular-nums">~12 h</p>
                <p className="text-zinc-400 text-xs mt-1">{lang === 'en' ? 'time you keep' : 'Zeit die du behältst'}</p>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-black text-emerald-400 tabular-nums">~390 €</p>
                <p className="text-zinc-400 text-xs mt-1">{lang === 'en' ? 'money you keep' : 'Geld das du behältst'}</p>
              </div>
            </div>
            <p className="text-zinc-500 text-[11px] mt-5 max-w-md mx-auto leading-relaxed">
              {lang === 'en'
                ? 'Estimates based on owner interviews (~50-150 members). 0 % platform fee bonus vs. competitors adds up to ~1.000-2.500 €/year on top.'
                : 'Schätzwerte aus Owner-Interviews (~50-150 Mitglieder). 0 %-Plattformgebühr-Bonus vs. Konkurrenz kommt mit ~1.000-2.500 €/Jahr obendrauf.'}
            </p>
            <Link href="/rechner" className="inline-flex items-center gap-1 mt-5 text-amber-400 hover:text-amber-300 text-sm font-bold underline-offset-2 hover:underline">
              {lang === 'en' ? 'Calculate with your own numbers →' : 'Mit deinen eigenen Zahlen rechnen →'}
            </Link>
          </div>
        </div>
      </Reveal>

      {/* ── SCHEDULE SCREENSHOT ── RSC */}
      <Reveal as="section" className="py-24 px-5 bg-zinc-50 overflow-hidden border-y border-zinc-100">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
            <div>
              <p className="text-amber-600 font-bold text-[10px] uppercase tracking-[0.2em] mb-3">{lang === 'en' ? 'Schedule' : 'Stundenplan'}</p>
              <h2 className="text-3xl sm:text-4xl font-black text-zinc-950 tracking-tight mb-5">
                {lang === 'en' ? 'Schedule directly on your website' : 'Kursplan direkt auf deiner Website'}
              </h2>
              <p className="text-zinc-500 mb-8 leading-relaxed text-sm">
                {lang === 'en' ? 'Manage your timetable and embed it via iframe. Members always see the current schedule — no need to maintain a second page.' : 'Stundenplan verwalten und per iframe einbetten. Mitglieder sehen immer den aktuellen Plan — ohne Pflege einer zweiten Seite.'}
              </p>
              <ul className="space-y-3.5">
                {(lang === 'en' ? ['Weekly view with class details', 'Public embed link', 'iCal export for Google Calendar', 'Online booking for members'] : ['Wochenansicht mit Kursdetails', 'Öffentlicher Embed-Link', 'iCal-Export für Google Calendar', 'Online-Buchung für Mitglieder']).map(item => (
                  <li key={item} className="flex items-center gap-3 text-sm text-zinc-700">
                    <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle size={11} className="text-amber-600" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl overflow-hidden border border-zinc-200 shadow-xl shadow-zinc-200/60">
              <Image src="/screenshot_stundenplan.png" alt="Wochenstundenplan mit Klassen-Buchungen" width={2912} height={896} sizes="(max-width: 768px) 90vw, 50vw" loading="lazy" className="w-full" />
            </div>
          </div>
        </div>
      </Reveal>

      {/* ── PUBLIC GYM WEBSITE ── RSC */}
      <Reveal as="section" className="py-24 px-5 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
            {/* URL bar mockup */}
            <div className="order-1 md:order-2">
              <div className="rounded-2xl border border-zinc-200 shadow-xl shadow-zinc-200/60 overflow-hidden bg-zinc-50">
                <div className="flex items-center gap-2 px-4 py-3 bg-zinc-100 border-b border-zinc-200">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                  </div>
                  <div className="flex-1 bg-white rounded-md px-3 py-1 text-[11px] font-mono text-zinc-500 border border-zinc-200">
                    osss.pro/gym/<span className="text-amber-600 font-semibold">dein-gym</span>
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  <div className="h-28 rounded-xl bg-zinc-200 flex items-center justify-center">
                    <Globe size={28} className="text-zinc-400" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 bg-zinc-200 rounded-full w-2/3" />
                    <div className="h-3 bg-zinc-100 rounded-full w-full" />
                    <div className="h-3 bg-zinc-100 rounded-full w-4/5" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {['Stundenplan', 'Mitgliedschaft', 'Kontakt'].map(label => (
                      <div key={label} className="h-8 bg-zinc-100 rounded-lg flex items-center justify-center">
                        <span className="text-[9px] text-zinc-400 font-medium">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="order-2 md:order-1">
              <p className="text-amber-600 font-bold text-[10px] uppercase tracking-[0.2em] mb-3">
                {lang === 'en' ? 'Public Gym Website' : 'Öffentliche Gym-Seite'}
              </p>
              <h2 className="text-3xl sm:text-4xl font-black text-zinc-950 tracking-tight mb-5">
                {lang === 'en'
                  ? <>Your gym gets<br />its own website</>
                  : <>Dein Gym bekommt<br />eine eigene Website</>}
              </h2>
              <p className="text-zinc-500 mb-8 leading-relaxed text-sm">
                {lang === 'en'
                  ? 'Prospects land on your gym page, see the schedule and prices, and book a trial class directly — without WhatsApp back-and-forth.'
                  : 'Interessenten landen auf deiner Gym-Seite, sehen den Stundenplan und die Preise, und buchen direkt ein Probetraining — ohne WhatsApp hin und her.'}
              </p>
              <ul className="space-y-3.5">
                {(lang === 'en'
                  ? ['Custom URL: osss.pro/gym/your-name', 'Schedule, pricing, gallery, about section', 'Trial class booking with lead capture', 'iCal export for Google Calendar', 'Embed as iframe on your own website']
                  : ['Eigene URL: osss.pro/gym/dein-name', 'Stundenplan, Preise, Galerie, About-Sektion', 'Probetraining-Buchung mit Lead-Erfassung', 'iCal-Export für Google Calendar', 'Als iframe auf deiner eigenen Website einbettbar']
                ).map(item => (
                  <li key={item} className="flex items-center gap-3 text-sm text-zinc-700">
                    <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle size={11} className="text-amber-600" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Reveal>

      {/* ── GERMAN FEATURES ── RSC */}
      <Reveal as="section" className="py-24 px-5 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
            <div>
              <p className="text-amber-600 font-bold text-[10px] uppercase tracking-[0.2em] mb-3">{lang === 'en' ? 'Built for the German market' : 'Für den deutschen Markt gebaut'}</p>
              <h2 className="text-3xl sm:text-4xl font-black text-zinc-950 tracking-tight mb-8">
                {lang === 'en' ? <>What most others<br />charge extra for</> : <>Was bei anderen<br />extra kostet</>}
              </h2>
              <div className="space-y-6">
                {GERMAN_FEATURES_DATA.map(item => (
                  <div key={item.title} className="flex gap-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
                      <item.icon size={16} className="text-amber-600" />
                    </div>
                    <div>
                      <p className="font-bold text-zinc-900 mb-1">{item.title}</p>
                      <p className="text-zinc-500 text-sm leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Invoice card — light version */}
            <div className="bg-zinc-50 rounded-2xl p-7 border border-zinc-200">
              <div className="flex items-center gap-3 mb-6 pb-5 border-b border-zinc-200">
                <div className="w-9 h-9 rounded-lg bg-amber-400 flex items-center justify-center flex-shrink-0">
                  <LogoMark className="w-4 h-3 text-zinc-950" />
                </div>
                <div>
                  <p className="text-zinc-900 font-bold text-sm">Osss</p>
                  <p className="text-zinc-400 text-xs">{lang === 'en' ? 'Automatic invoice' : 'Automatische Rechnung'}</p>
                </div>
                <div className="ml-auto">
                  <span className="text-[11px] font-bold text-zinc-600 bg-zinc-100 border border-zinc-200 px-2.5 py-1 rounded-full">{lang === 'en' ? 'Paid' : 'Bezahlt'}</span>
                </div>
              </div>
              <div className="space-y-3.5">
                {(lang === 'en' ? [
                  ['Invoice no.', 'OSS-2026-047'],
                  ['Member',      'Max Mustermann'],
                  ['Service',     'Monthly fee May 2026'],
                  ['Amount',      '€ 89.00'],
                  ['Tax note',    '§19 UStG — VAT-exempt'],
                ] : [
                  ['Rechnungsnummer', 'OSS-2026-047'],
                  ['Mitglied',        'Max Mustermann'],
                  ['Leistung',        'Monatsbeitrag Mai 2026'],
                  ['Betrag',          '€ 89,00'],
                  ['Steuerhinweis',   '§19 UStG — keine USt.'],
                ]).map(([label, val]) => (
                  <div key={label} className="flex justify-between text-sm border-b border-zinc-200/80 pb-3.5">
                    <span className="text-zinc-400">{label}</span>
                    <span className="text-zinc-900 font-medium">{val}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 bg-zinc-100 border border-zinc-200 rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 text-zinc-600 text-xs font-semibold">
                <CheckCircle size={12} />
                {lang === 'en' ? 'Automatically created and archived' : 'Automatisch erstellt und archiviert'}
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* ── DATEV HIGHLIGHT ── RSC */}
      <Reveal as="section" className="py-20 px-5 bg-zinc-950">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-amber-400 font-bold text-[10px] uppercase tracking-[0.2em] mb-3">
                {lang === 'en' ? 'Unique feature' : 'Einzigartiges Feature'}
              </p>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-5">
                {lang === 'en'
                  ? <>DATEV export —<br />one click, done</>
                  : <>DATEV-Export —<br />ein Klick, fertig</>}
              </h2>
              <p className="text-zinc-400 mb-8 leading-relaxed text-sm">
                {lang === 'en'
                  ? 'Export your payment data as a DATEV-compatible CSV file — your tax advisor imports it directly into their system. Built in from day one, no add-on fees.'
                  : 'Exportiere deine Zahlungsdaten als DATEV-kompatible CSV-Datei — dein Steuerberater importiert sie direkt in sein System. Direkt eingebaut, ohne Add-on-Aufpreis.'}
              </p>
              <div className="flex items-center gap-3 text-sm text-zinc-300">
                <CheckCircle size={14} className="text-amber-400 flex-shrink-0" />
                {lang === 'en' ? 'DATEV Buchungsdatei format 1.0' : 'DATEV Buchungsdatei Format 1.0'}
              </div>
              <div className="flex items-center gap-3 text-sm text-zinc-300 mt-2">
                <CheckCircle size={14} className="text-amber-400 flex-shrink-0" />
                {lang === 'en' ? 'Configurable tax account length (4 or 8 digits)' : 'Konfigurierbare Sachkontenlänge (4 oder 8 Stellen)'}
              </div>
              <div className="flex items-center gap-3 text-sm text-zinc-300 mt-2">
                <CheckCircle size={14} className="text-amber-400 flex-shrink-0" />
                {lang === 'en' ? 'Filter by month — just share with your accountant' : 'Nach Monat filtern — einfach an Steuerberater weitergeben'}
              </div>
            </div>

            {/* DATEV export card mockup */}
            <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
              <div className="flex items-center gap-3 mb-5 pb-4 border-b border-zinc-800">
                <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center flex-shrink-0">
                  <Download size={14} className="text-zinc-950" />
                </div>
                <div>
                  <p className="text-white font-bold text-sm">{lang === 'en' ? 'DATEV Export' : 'DATEV-Export'}</p>
                  <p className="text-zinc-500 text-xs">{lang === 'en' ? 'Booking data CSV' : 'Buchungsdaten CSV'}</p>
                </div>
              </div>
              <div className="font-mono text-[10px] text-zinc-400 space-y-1.5 mb-5">
                <p className="text-zinc-600">{lang === 'en' ? '// DATEV Buchungsdatei' : '// DATEV Buchungsdatei'}</p>
                <p><span className="text-amber-400">Umsatz</span>;Gegenkonto;Belegdatum;Buchungstext</p>
                <p>89,00;8000;{today};Monatsbeitrag Max M.</p>
                <p>89,00;8000;{today};Monatsbeitrag Jana K.</p>
                <p>89,00;8000;{today};Monatsbeitrag Tom R.</p>
                <p className="text-zinc-600">…</p>
              </div>
              <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-400 text-zinc-950 text-sm font-bold">
                <Download size={13} />
                {lang === 'en' ? 'Download DATEV CSV' : 'DATEV CSV herunterladen'}
              </button>
            </div>
          </div>
        </div>
      </Reveal>

      {/* ── PRICING TEASER (Single-Tier) ── RSC */}
      <Reveal as="section" className="py-24 px-5 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-zinc-400 font-bold text-[10px] uppercase tracking-[0.2em] mb-3">{lang === 'en' ? 'Pricing' : 'Preise'}</p>
          <h2 className="text-3xl sm:text-4xl font-black text-zinc-950 tracking-tight mb-3">
            {lang === 'en' ? 'One price. Everything included.' : 'Ein Preis. Alles inklusive.'}
          </h2>
          <p className="text-zinc-500 mb-10 text-sm leading-relaxed max-w-md mx-auto">
            {lang === 'en'
              ? '14 days free trial — no credit card, no commitment. Then 49 €/month — or save 120 € a year with annual billing.'
              : '14 Tage gratis testen — ohne Kreditkarte, kein Commitment. Danach 49 €/Monat — oder spare 120 € pro Jahr mit Jahresabo.'}
          </p>

          {/* Price card — kompakt, 2 Spalten Monatlich vs Jährlich */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto mb-8">
            <div className="bg-zinc-50 rounded-2xl p-6 border-2 border-zinc-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">{lang === 'en' ? 'Monthly' : 'Monatlich'}</p>
              <p className="text-4xl font-black tracking-tight text-zinc-900 tabular-nums">49 €</p>
              <p className="text-xs text-zinc-500 mt-1">{lang === 'en' ? 'per month' : 'pro Monat'}</p>
            </div>
            <div className="bg-amber-50 rounded-2xl p-6 border-2 border-amber-300 relative">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap">
                {lang === 'en' ? '−120 €/year' : '−120 €/Jahr'}
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-2">{lang === 'en' ? 'Annual' : 'Jährlich'}</p>
              <p className="text-4xl font-black tracking-tight text-zinc-900 tabular-nums">39 €</p>
              <p className="text-xs text-amber-700 mt-1">{lang === 'en' ? 'per month, billed yearly' : 'pro Monat, jährlich abgerechnet'}</p>
            </div>
          </div>

          {/* Audit 2026-05-13: Lifetime-Pilot strip (PILOT10, 40 %) entfernt. */}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register" data-track="cta_signup_pricing_teaser"
              className="inline-flex items-center gap-2 bg-zinc-950 hover:bg-zinc-800 text-white font-bold px-6 py-3 rounded-xl text-sm transition-all hover:scale-[1.02] active:scale-[0.98]">
              <Zap size={14} className="text-amber-400" />
              {lang === 'en' ? 'Start 14-day trial' : '14-Tage-Trial starten'}
            </Link>
            <Link href="/pricing" className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-900 font-medium text-sm transition-colors">
              {lang === 'en' ? 'Full pricing details' : 'Alle Preis-Details'} <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </Reveal>

      {/* ── FINAL CTA — full amber, RSC. Zwei Pfade: Decider klickt CTA, Considerer schreibt direkt. ── */}
      <section className="py-28 px-5 bg-amber-400 text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 70% 70% at 50% 110%, rgba(255,255,255,0.15) 0%, transparent 70%)' }} />
        <div className="max-w-xl mx-auto relative">
          <h2 className="text-4xl sm:text-5xl font-black tracking-tighter text-zinc-950 mb-5">{lang === 'en' ? 'Your gym in 10 minutes.' : 'Dein Gym in 10 Minuten.'}</h2>
          <p className="text-zinc-800 text-lg mb-10 leading-relaxed">
            {lang === 'en' ? <>14 days free trial — no credit card.<br />Then 49 €/month, or 39 €/month annually.</> : <>14 Tage gratis testen — ohne Kreditkarte.<br />Danach 49 €/Monat oder 39 €/Monat im Jahresabo.</>}
          </p>
          <Link href="/register" data-track="cta_signup_bottom"
            className="inline-flex items-center gap-2 bg-zinc-950 hover:bg-zinc-800 text-white font-bold px-10 py-4 rounded-xl text-lg transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-zinc-900/25">
            <Zap size={18} className="text-amber-400" />
            {lang === 'en' ? 'Free account in 60 sec' : 'Gratis Account in 60 Sek.'}
          </Link>
          <p className="text-zinc-700 text-xs mt-5 tracking-wide">{lang === 'en' ? '14 days free · No credit card · Cancel anytime' : '14 Tage gratis · Keine Kreditkarte · Jederzeit kündbar'}</p>
          <p className="text-zinc-800/80 text-sm mt-8">
            {lang === 'en' ? 'Still got questions? ' : 'Noch unsicher? '}
            <ContactButton lang={lang} className="text-zinc-950 font-bold underline decoration-2 underline-offset-2 hover:text-zinc-800 transition-colors" />
            {lang === 'en' ? ' — usually replies same day.' : ' — Antwort meist am selben Tag.'}
          </p>
        </div>
      </section>

      {/* ── BOOK A FREE DEMO — Conversion-Path für Owner die nicht selbst-onboarden wollen ──
           Ersetzt die alte Newsletter-Section (Newsletter ist Retention-Hebel; in 0-Customer-Phase
           brauchen wir Acquisition). Form geht an oss@osss.pro mit [DEMO]-Subject-Prefix.
           id="book-demo" → Smooth-scroll-Target für Hero-CTA + Nav-Link. ── */}
      <Reveal as="section" id="book-demo" className="py-20 px-5 bg-zinc-50 border-b border-zinc-100 scroll-mt-20">
        <BookDemoSection lang={lang} />
      </Reveal>



      {/* ── NEWSLETTER — kompakter Footer-Strip statt eigener Section ── */}
      <div className="py-10 px-5 bg-white border-b border-zinc-100">
        <div className="max-w-3xl mx-auto">
          <NewsletterSignup
            source="landing-footer"
            variant="hero"
            title={lang === 'en' ? 'Practical tips for martial arts gyms.' : 'Praxis-Tipps für Kampfsport-Vereine.'}
            description={lang === 'en'
              ? 'GDPR, DATEV, SEPA, member management — at most 1× per week, unsubscribe instantly.'
              : 'DSGVO, DATEV, SEPA, Mitgliederverwaltung — höchstens 1× pro Woche, sofort abbestellbar.'}
          />
        </div>
      </div>

      {/* ── FOOTER — RSC, Kontakt button is small Client island ── */}
      <footer className="bg-white border-t border-zinc-100">
        <div className="max-w-5xl mx-auto px-5 py-14">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-10 mb-12">
            <div className="sm:col-span-2">
              <OsssLogo variant="dark" />
              <p className="text-zinc-400 text-sm mt-4 leading-relaxed max-w-xs">
                {lang === 'en' ? 'The gym software for martial arts. Made in Germany. GDPR + DATEV included.' : 'Die Gym-Software für Kampfsport. Made in Germany. DSGVO + DATEV inklusive.'}
              </p>
            </div>
            <div>
              <p className="font-bold text-zinc-900 text-sm mb-4 tracking-wide">{lang === 'en' ? 'Product' : 'Produkt'}</p>
              <ul className="space-y-3">
                {(lang === 'en'
                  ? [
                      { label: 'Pricing',     href: '/pricing' },
                      { label: 'About',       href: '/about' },
                      { label: 'Resources',   href: '/ressourcen' },
                      { label: 'Cost calc.',  href: '/rechner' },
                      { label: 'Blog',        href: '/blog' },
                      { label: 'Log in',      href: '/login' },
                      { label: 'Register',    href: '/register' },
                    ]
                  : [
                      { label: 'Preise',         href: '/pricing' },
                      { label: 'Über uns',       href: '/about' },
                      { label: 'Ressourcen',     href: '/ressourcen' },
                      { label: 'Kostenrechner',  href: '/rechner' },
                      { label: 'Blog',           href: '/blog' },
                      { label: 'Anmelden',       href: '/login' },
                      { label: 'Registrieren',   href: '/register' },
                    ]
                ).map(l => (
                  <li key={l.label}><Link href={l.href} className="text-zinc-500 hover:text-zinc-900 text-sm transition-colors">{l.label}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-bold text-zinc-900 text-sm mb-4 tracking-wide">{lang === 'en' ? 'Legal' : 'Rechtliches'}</p>
              <ul className="space-y-3">
                {(lang === 'en'
                  ? [{ label: 'Privacy policy', href: '/datenschutz' }, { label: 'Imprint', href: '/impressum' }]
                  : [{ label: 'Datenschutz', href: '/datenschutz' }, { label: 'Impressum', href: '/impressum' }]
                ).map(l => (
                  <li key={l.label}><Link href={l.href} className="text-zinc-500 hover:text-zinc-900 text-sm transition-colors">{l.label}</Link></li>
                ))}
                <li>
                  <ContactButton lang={lang} />
                </li>
              </ul>
            </div>
          </div>
          <div className="pt-6 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-zinc-400 text-xs">© {yearNow} Osss · {lang === 'en' ? 'The martial arts gym software' : 'Die Kampfsport-Gym-Software'}</p>
            <p className="text-zinc-300 text-xs">{lang === 'en' ? 'Made in Germany · GDPR-compliant · Data in EU/UK' : 'Made in Germany · DSGVO-konform · Daten in EU/UK'}</p>
          </div>
        </div>
      </footer>

    </div>
  )
}
