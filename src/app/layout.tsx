import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { ToastProvider } from "@/components/Toast";
import { ConfirmProvider } from "@/components/ConfirmModal";
import { PromptProvider } from "@/components/PromptModal";
import { TrackPageView, TrackClicks } from "@/components/TrackPageView";
import { STANDARD_TIER } from "@/lib/pricing";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.osss.pro"),
  title: {
    default: "Osss – Gym-Software für Kampfsport | DSGVO + DATEV",
    template: "%s | Osss",
  },
  description:
    "Die deutsche Gym-Software für Kampfsport. Mit Belt-System, DATEV-Export und SEPA-Lastschrift. DSGVO-konform, ab €0/Monat.",
  applicationName: "Osss",
  keywords: [
    "Gym Software",
    "Kampfsport Software",
    "BJJ Software",
    "Mitgliederverwaltung Verein",
    "Belt-Tracking",
    "Karate Mitgliederverwaltung",
    "Judo Verwaltung",
    "DATEV Export Verein",
    "Gym SEPA Lastschrift",
    "DSGVO Mitgliederverwaltung",
    "Kampfsport CRM",
    "Wing Tsun Software",
    "Kung Fu Verwaltung",
    "Muay Thai Software",
  ],
  authors: [{ name: "Osss", url: "https://www.osss.pro" }],
  creator: "Osss",
  publisher: "Osss",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Osss",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  alternates: {
    canonical: "/",
    languages: {
      "de-DE": "/",
      "en-US": "/?lang=en",
    },
  },
  // og:image wird von src/app/opengraph-image.tsx automatisch generiert
  // (Next.js File-Convention) — 1200x630 PNG dynamisch gerendert.
  openGraph: {
    title: "Osss – Gym-Software für Kampfsport",
    description:
      "Mitglieder, Belts, Beiträge — live in 10 Minuten. Mit DATEV, SEPA und DSGVO-Compliance, ab €0/Monat.",
    url: "https://www.osss.pro",
    siteName: "Osss",
    type: "website",
    locale: "de_DE",
    alternateLocale: ["en_US"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Osss – Gym-Software für Kampfsport",
    description:
      "Mitglieder, Belts, Beiträge — live in 10 Minuten. DATEV + SEPA + DSGVO inklusive.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "business",
};

// Wichtig: KEIN userScalable: false — verstößt gegen WCAG 1.4.4 und wird
// von Google Lighthouse als "Accessibility issue" gewertet → SEO-Penalty.
// Nutzer mit Sehschwäche müssen reinzoomen können.
export const viewport: Viewport = {
  themeColor: "#FBBF24",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// JSON-LD structured data — hilft Google bei Rich Snippets + Knowledge Panel.
// Empfohlen von Google Search Central für SaaS / SoftwareApplication.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.osss.pro/#organization",
      name: "Osss",
      url: "https://www.osss.pro",
      logo: "https://www.osss.pro/icon-512",
      sameAs: [],
      contactPoint: {
        "@type": "ContactPoint",
        email: "oss@osss.pro",
        contactType: "customer support",
        availableLanguage: ["German", "English"],
      },
      address: {
        "@type": "PostalAddress",
        addressCountry: "DE",
        addressLocality: "Adelshofen",
        postalCode: "82276",
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://www.osss.pro/#software",
      name: "Osss",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "Die deutsche Gym-Software für Kampfsport. Mit Belt-System, DATEV-Export, SEPA und DSGVO-Compliance.",
      url: "https://www.osss.pro",
      inLanguage: ["de", "en"],
      // Single-Tier seit 2026-05 — aus pricing.ts abgeleitet, damit die
      // strukturierten Daten (Google Rich-Snippet) nicht von der echten
      // Preisseite driften.
      offers: [
        { "@type": "Offer", name: `${STANDARD_TIER.name} (monatlich)`, price: String(STANDARD_TIER.monthlyCents / 100), priceCurrency: "EUR" },
        { "@type": "Offer", name: `${STANDARD_TIER.name} (jährlich)`, price: String(STANDARD_TIER.annualMonthlyCents / 100), priceCurrency: "EUR" },
      ],
      featureList: [
        "Mitgliederverwaltung",
        "Belt-Tracking & Promotions",
        "Anwesenheits-Check-in (QR + GPS)",
        "Stundenplan & iCal-Export",
        "Stripe SEPA-Lastschrift",
        "Automatische Rechnungen (§19 UStG)",
        "DATEV-Export",
        "Mitglieder-Portal",
        "Öffentliche Gym-Website",
        "Lead-Pipeline / CRM",
        "DSGVO-konformer AVV (eIDAS-konform)",
      ],
      provider: { "@id": "https://www.osss.pro/#organization" },
    },
    {
      "@type": "WebSite",
      "@id": "https://www.osss.pro/#website",
      url: "https://www.osss.pro",
      name: "Osss",
      publisher: { "@id": "https://www.osss.pro/#organization" },
      inLanguage: "de-DE",
    },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`${geistSans.variable} h-full antialiased`}>
      <head>
        {/* Preconnect to critical origins for faster cold start */}
        <link rel="preconnect" href="https://ktwgvuasjezokhsfpfqb.supabase.co" />
        <link rel="dns-prefetch" href="https://ktwgvuasjezokhsfpfqb.supabase.co" />
        {/* PWA: "Add to Home Screen" support */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Osss" />
        {/* Splash screen color for iOS */}
        <meta name="msapplication-TileColor" content="#0f172a" />
        <meta name="msapplication-tap-highlight" content="no" />
        {/* JSON-LD: Organization + SoftwareApplication für Google Rich Snippets */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <ToastProvider>
          <ConfirmProvider>
            <PromptProvider>
              <LanguageProvider>{children}</LanguageProvider>
            </PromptProvider>
          </ConfirmProvider>
        </ToastProvider>
        {/* Cookielose, DSGVO-anonyme Reichweiten-Messung — siehe /api/track */}
        <TrackPageView />
        <TrackClicks />
      </body>
    </html>
  );
}
