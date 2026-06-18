# Verzeichnis von Verarbeitungstätigkeiten

**Nach Art. 30 Abs. 1 DSGVO**

> Dies ist ein **internes Dokument**. Es muss auf Verlangen der Aufsichtsbehörde
> (in Bayern: BayLDA) vorgelegt werden — aber NICHT öffentlich zugänglich sein.
>
> **Stand:** _[Datum bei jeder Änderung aktualisieren]_
> **Letzte Prüfung:** _[Datum]_

---

## 0. Verantwortlicher

| Feld | Eintrag |
|---|---|
| Name / Firma | Lom-Ali Imadaev |
| Anschrift | Kreuzstraße 1, 82276 Adelshofen, Deutschland |
| E-Mail | oss@osss.pro |
| Telefon | _[ggf. eintragen]_ |
| Datenschutzbeauftragter | **Nicht erforderlich** (< 20 Personen verarbeiten regelmäßig PII, keine besonderen Kategorien Art. 9, kein Kerngeschäft Profiling) — Stand bei wachsendem Team neu prüfen |

---

## 1. Übersicht der Verarbeitungstätigkeiten

| Nr. | Bezeichnung | Zweck (Kurz) | Rechtsgrundlage |
|---|---|---|---|
| V1 | Mitgliederverwaltung | CRUD von Mitgliederdaten in Osss-Plattform | Art. 6(1)(b) — Vertrag zw. Gym & Mitglied |
| V2 | Authentifizierung | Login Gym-Owner / Trainer / Mitglied | Art. 6(1)(b), (f) |
| V3 | Zahlungsabwicklung | Stripe Connect — Beitragseinzug der Gyms | Art. 6(1)(b) |
| V4 | Anwesenheits-Tracking | Trainings-Check-Ins, Kapazitätsplanung | Art. 6(1)(b), (f) |
| V5 | Graduierungen / Belt-System | Dokumentation Gürtelgrade, Stripe-Counter | Art. 6(1)(b) |
| V6 | E-Mail-Versand (transaktional) | Bestätigungen, Erinnerungen, Quittungen | Art. 6(1)(b), (f) |
| V7 | Hosting & Server-Logs | Web-Auslieferung, IT-Sicherheit | Art. 6(1)(f) |
| V8 | Fehler-Tracking (Sentry) | App-Stabilität, Bug-Diagnose | Art. 6(1)(f) |
| V9 | Sales-CRM (intern) | Kaltakquise von Gym-Inhabern | Art. 6(1)(f) — siehe Risikohinweis V9 |
| V10 | Onboarding / Setup-Wizard | Erste Konfiguration durch Gym-Owner | Art. 6(1)(b) |
| V11 | Forderungsbeitreibung (Inkasso) | Übergabe offener Forderungen an Paywise | Art. 6(1)(b), (f) |

---

## V1 — Mitgliederverwaltung

| Feld | Eintrag |
|---|---|
| **Zweck** | Verwaltung der Mitgliedschaften innerhalb eines Gyms (Stammdaten, Vertragsstatus, Kontaktdaten) |
| **Rechtsgrundlage** | Art. 6(1)(b) DSGVO — Erfüllung des Mitgliedschaftsvertrages zwischen Gym (Verantwortlicher) und Mitglied |
| **Betroffene Personen** | Mitglieder der angeschlossenen Gyms |
| **Datenkategorien** | Vor-/Nachname, E-Mail, Telefon, Geburtsdatum, Anschrift, Mitgliedschaftsstatus, Beitritt, Kündigung |
| **Empfänger** | Supabase (Datenbank), Vercel (Hosting), Stripe (Zahlungen) |
| **Drittlandtransfer** | Datenstandort Supabase: **London/UK (eu-west-2)** — abgedeckt durch EU-Angemessenheitsbeschluss 2021/1772 (gültig bis 27.06.2031). Stripe + Vercel + Resend in USA: EU-SCCs + Data Privacy Framework. |
| **Speicherdauer** | Bis Vertragsende + 10 Jahre für rechnungsrelevante Daten (§ 257 HGB / § 147 AO), sonst Löschung auf Anfrage |
| **TOMs** | Verschlüsselung at-rest (Supabase pgsodium), in-transit (TLS 1.3), RLS, MFA-fähige Auth, regelmäßige Backups (Supabase 7d PITR) |
| **Bemerkung** | Gym ist eigenständiger Verantwortlicher für seine Mitgliederdaten (Zwei-Stufen-Modell). Osss ist Auftragsverarbeiter. → AVV zwischen Osss und Gym nötig (siehe `compliance/avv-vorlage-osss-gym.md`) |

---

## V2 — Authentifizierung

| Feld | Eintrag |
|---|---|
| **Zweck** | Identifikation und Authentifizierung von Nutzern (Owner / Trainer / Mitglied) |
| **Rechtsgrundlage** | Art. 6(1)(b), (f) DSGVO |
| **Betroffene Personen** | Nutzer mit Account |
| **Datenkategorien** | E-Mail, gehashtes Passwort, Login-Zeitpunkte, IP-Adresse (Sicherheitslogs), Session-Token |
| **Empfänger** | Supabase Auth (intern), Vercel (Edge) |
| **Drittlandtransfer** | Ja — USA, EU-SCCs |
| **Speicherdauer** | Account aktiv + 30 Tage nach Löschung (für Recovery), Sicherheitslogs 90 Tage |
| **TOMs** | bcrypt für Passwort-Hashing, JWT mit Rotation, Rate-Limiting (Upstash), CSRF-Schutz |
| **Bemerkung** | Auth-Cookie ist technisch notwendig (kein Tracking). Daher TTDSG § 25 nicht einschlägig → kein Banner nötig |

---

## V3 — Zahlungsabwicklung

| Feld | Eintrag |
|---|---|
| **Zweck** | Beitragseinzug für Gym-Mitglieder via Stripe Connect (Standard Connected Account Modell) |
| **Rechtsgrundlage** | Art. 6(1)(b) DSGVO |
| **Betroffene Personen** | Mitglieder, die zahlen |
| **Datenkategorien** | Name, E-Mail, IBAN/Karte (NUR bei Stripe — nicht in Osss-DB), Betragshöhe, Status |
| **Empfänger** | Stripe Inc. (USA), Stripe Payments Europe Ltd. (Irland) |
| **Drittlandtransfer** | Ja — USA, EU-SCCs + DPF, PCI-DSS Level 1 zertifiziert |
| **Speicherdauer** | Stripe: gemäß Stripe-DPA. Osss-DB: nur Stripe-Customer-ID + Subscription-ID, keine Karten-/Kontodaten |
| **TOMs** | Stripe Elements (PCI-konform — Daten gehen nie durch Osss-Server), Webhook-Signatur-Verifikation |
| **Bemerkung** | KEIN PII-Karten-Daten landen je in Osss-DB. Compliance-Risiko minimiert |

---

## V4 — Anwesenheits-Tracking

| Feld | Eintrag |
|---|---|
| **Zweck** | Check-Ins zu Trainings, Kapazitätsplanung, Statistik für Gym-Owner |
| **Rechtsgrundlage** | Art. 6(1)(b) DSGVO (Vertragsleistung) + (f) (berechtigtes Interesse Gym an Auslastungsstatistik) |
| **Betroffene Personen** | Mitglieder |
| **Datenkategorien** | Mitglieds-ID, Klassen-ID, Check-In-Zeitpunkt |
| **Empfänger** | Supabase |
| **Drittlandtransfer** | Ja — USA, EU-SCCs |
| **Speicherdauer** | 24 Monate (begründet durch Statistik & Steuer), danach Aggregation und Löschung der Einzeldaten |
| **TOMs** | RLS pro Gym, kein Cross-Gym-Zugriff |

---

## V5 — Graduierungen / Belt-System

| Feld | Eintrag |
|---|---|
| **Zweck** | Dokumentation der Gürtelgrade, Stripe-Counter, Prüfungserfolge |
| **Rechtsgrundlage** | Art. 6(1)(b) DSGVO |
| **Betroffene Personen** | Mitglieder |
| **Datenkategorien** | Mitglieds-ID, Belt-Level, Stripes, Datum der Graduierung, vergeben-von |
| **Empfänger** | Supabase |
| **Drittlandtransfer** | Ja — USA, EU-SCCs |
| **Speicherdauer** | Lebenslang (während Mitgliedschaft + 10 Jahre für Statistik / Stilrichtung) — nach Löschverlangen entfernt |

---

## V6 — Transaktionaler E-Mail-Versand

| Feld | Eintrag |
|---|---|
| **Zweck** | Bestätigungen (Anmeldung, Stornierung), Erinnerungen, System-Mails |
| **Rechtsgrundlage** | Art. 6(1)(b), (f) DSGVO |
| **Betroffene Personen** | Mitglieder, Trainer, Gym-Owner |
| **Datenkategorien** | E-Mail, Name, Betreff, Body |
| **Empfänger** | Resend Inc. (USA) |
| **Drittlandtransfer** | Ja — USA, EU-SCCs |
| **Speicherdauer** | Resend: gemäß Resend-DPA (üblich 30d für Versandprotokolle) |
| **TOMs** | DKIM, SPF, DMARC konfiguriert; keine Bulk-Marketing-Mails ohne Opt-In |

---

## V7 — Hosting & Server-Logs

| Feld | Eintrag |
|---|---|
| **Zweck** | Auslieferung der Webanwendung, IT-Sicherheit, Performance-Monitoring |
| **Rechtsgrundlage** | Art. 6(1)(f) DSGVO — berechtigtes Interesse an stabiler / sicherer Anwendung |
| **Betroffene Personen** | Alle Besucher der Domain |
| **Datenkategorien** | IP-Adresse (gekürzt nach Standard-Practice), User-Agent, Referer, Aufgerufene URL, Zeitstempel |
| **Empfänger** | Vercel Inc. (USA) |
| **Drittlandtransfer** | Ja — USA, EU-SCCs + DPF zertifiziert |
| **Speicherdauer** | Vercel-Standard (üblich 30 Tage), keine direkte Verlängerung durch Osss |

---

## V8 — Fehler-Tracking (Sentry)

| Feld | Eintrag |
|---|---|
| **Zweck** | Erfassung von JavaScript-Exceptions, Server-Errors, Performance-Metriken zur Bug-Behebung |
| **Rechtsgrundlage** | Art. 6(1)(f) DSGVO — berechtigtes Interesse an stabiler Anwendung |
| **Betroffene Personen** | Nutzer, deren Browser/Server einen Fehler auslöst |
| **Datenkategorien** | Error-Message, Stack-Trace, Browser-Typ, Next.js-Route. **KEIN PII** (`sendDefaultPii: false`), **KEIN Session-Replay** |
| **Empfänger** | Functional Software, Inc. (Sentry) — USA |
| **Drittlandtransfer** | Ja — USA, EU-SCCs |
| **Speicherdauer** | Sentry-Standard (90 Tage Free / 30 Tage Solo) |
| **TOMs** | DSN nur über NEXT_PUBLIC env, `tracesSampleRate: 0.1` (10%), Replay deaktiviert, PII deaktiviert auf Client + Server + Edge |

---

## V9 — Sales-CRM (intern)

> ⚠️ **RISIKOHINWEIS:** Diese Verarbeitung ist UWG- und DSGVO-relevant. Vor Skalierung
> mit Anwalt prüfen lassen.

| Feld | Eintrag |
|---|---|
| **Zweck** | Akquise neuer Gym-Kunden für Osss durch Kaltanrufe / E-Mails (B2B) |
| **Rechtsgrundlage** | Art. 6(1)(f) DSGVO — berechtigtes Interesse an Geschäftsanbahnung. UWG § 7(2) — mutmaßliche Einwilligung im B2B bei branchenrelevanten Angeboten |
| **Betroffene Personen** | Inhaber / Geschäftsführer von Kampfsport-/Fitness-Gyms (DACH) |
| **Datenkategorien** | Gym-Name, Adresse, Telefon, Website, Sportart, Notizen aus Gesprächen, Status, Outcomes |
| **Empfänger** | Supabase, Google Places API (nur lesend, abgerufen) |
| **Quelle** | Google Places API (öffentlich verfügbare Geschäftsdaten) |
| **Drittlandtransfer** | Ja — USA (Google), EU-SCCs |
| **Speicherdauer** | 36 Monate ab letzter Aktivität, danach Löschung; bei Widerspruch sofort |
| **TOMs** | Service-Role-Auth (nur Admin), getrennte Domain-Pfad `/admin/leads`, 60s admin-cache, kein Public-Zugriff |
| **Informationspflicht (Art. 14)** | Beim ersten Kontakt mündlich / per E-Mail über Datenspeicherung informieren. Bei Widerspruch sofort löschen |
| **Bemerkung** | Kaltakquise nach UWG ist heikel. Best-Practice: a) nur branchenrelevante Angebote (passt — Gym-Software für Gyms), b) Opt-Out-Listen führen, c) bei E-Mail strikt Opt-In |

---

## V10 — Onboarding / Setup-Wizard

| Feld | Eintrag |
|---|---|
| **Zweck** | Initiale Konfiguration eines Gyms in Osss (Sportart, Belt-System, Branding, etc.) |
| **Rechtsgrundlage** | Art. 6(1)(b) DSGVO |
| **Betroffene Personen** | Gym-Owner |
| **Datenkategorien** | Gym-Name, Slug, Sportart, Logo, Farben, Trainer-Liste, Stundenplan |
| **Empfänger** | Supabase, Vercel |
| **Drittlandtransfer** | Ja — USA, EU-SCCs |
| **Speicherdauer** | Während Vertragslaufzeit + 30 Tage |

---

## 2. Allgemeine Technische und Organisatorische Maßnahmen (TOMs)

### 2.1 Vertraulichkeit (Art. 32(1)(b) DSGVO)

| Maßnahme | Umsetzung |
|---|---|
| Zutrittskontrolle | Cloud-Hosting (Vercel + Supabase) — physische Zutrittskontrolle durch Anbieter (ISO 27001 / SOC 2) |
| Zugangskontrolle | E-Mail + Passwort + JWT, optional MFA. Bcrypt für Passwort-Hashing. Rate-Limiting (Upstash) |
| Zugriffskontrolle | Row-Level-Security (RLS) auf allen Supabase-Tabellen. Admin-Routen via `requireAdmin()` über `ADMIN_EMAILS` env |
| Trennungskontrolle | Multi-Tenant durch `gym_id` Foreign-Keys + RLS-Policies. Cross-Gym-Zugriff technisch ausgeschlossen |

### 2.2 Integrität (Art. 32(1)(b) DSGVO)

| Maßnahme | Umsetzung |
|---|---|
| Eingabekontrolle | Logging in `audit_logs` Tabelle für sensible Operationen (Lead-Status-Changes, Belt-Changes). User-ID + Timestamp |
| Übertragungskontrolle | TLS 1.3 erzwungen (Vercel + Supabase), HSTS-Header, kein HTTP |

### 2.3 Verfügbarkeit / Belastbarkeit (Art. 32(1)(b) DSGVO)

| Maßnahme | Umsetzung |
|---|---|
| Backup | Supabase Point-in-Time-Recovery 7 Tage (Pro-Plan upgraden für längere Haltedauer) |
| Wiederherstellbarkeit | Datenbank-Restore via Supabase-Dashboard, getestet beim letzten Mal: _[Datum eintragen]_ |
| Verfügbarkeit | Vercel Multi-Region, Supabase 99.9% SLA |

### 2.4 Verfahren zur regelmäßigen Überprüfung (Art. 32(1)(d) DSGVO)

| Maßnahme | Frequenz | Letzte Durchführung |
|---|---|---|
| TOM-Review | jährlich | _[Datum]_ |
| Verarbeitungsverzeichnis-Review | jährlich oder bei Änderung | _[Datum]_ |
| Backup-Restore-Test | halbjährlich | _[Datum]_ |
| Penetration-Test / Security-Audit | bei größeren Releases | _[Datum]_ |
| Sentry / Error-Logs Review (kein PII-Leak?) | quartalsweise | _[Datum]_ |
| Auftragsverarbeiter-Status (DPF, SCCs aktuell?) | jährlich | _[Datum]_ |

---

## 3. Auftragsverarbeiter (Art. 28 DSGVO)

| Anbieter | Zweck | AVV abgeschlossen? | Datum AVV | Drittland | Absicherung |
|---|---|:---:|---|---|---|
| Supabase Inc. | Datenbank, Auth, Storage | ⏳ Static | 2026-05-09 (static text) | UK (Daten) / USA (Vertrag) | EU-Adequacy UK + SCCs für USA. **Signed DPA bei Pro-Upgrade** ($25/Mo). |
| Stripe Inc. / Stripe Payments Europe Ltd. | Zahlungsabwicklung | ✅ Auto | beim Account-Setup | USA / IE | SCCs + DPF + PCI-DSS. Auto-akzeptiert beim Stripe-Onboarding, PDF in Stripe-Dashboard → Documents. |
| Vercel Inc. | Hosting | ⏳ Static | 2026-05-09 (static text) | USA | SCCs + DPF. **Signed DPA bei Pro-Upgrade** ($20/Mo). |
| Resend Inc. | E-Mail-Versand | ⏳ Email | _[Email an legal@resend.com pending]_ | USA | SCCs |
| Functional Software, Inc. (Sentry) | Error-Tracking | ⏳ DocuSign | _[DocuSign-Link pending]_ | USA | SCCs. „All Plans"-DPA via Sentry Help Center. |
| Upstash, Inc. | Rate-Limiting (Redis) | ⏳ Email | _[PDF signen + an support@upstash.com mailen pending]_ | USA | SCCs |
| Google LLC (Places API) | Lead-Daten-Anreicherung CRM | ⏳ Console | _[Google Cloud Console → IAM → DPA → Accept pending]_ | USA | SCCs + DPF |

**Legende**:
- ✅ = Vollständig signed/accepted
- ⏳ Static = Static-Vertragstext liegt vor in `compliance/avv-static/`, signed DPA noch ausstehend (Plan-Upgrade nötig oder User-Aktion)
- ⏳ Email/DocuSign/Console = User-Aktion im jeweiligen Workflow erforderlich

> **Status 2026-05-09:** 1 von 7 vollständig (Stripe). Static-Texte aller 7 in
> `compliance/avv-static/` (siehe README dort für Reihenfolge der nächsten Schritte).
> Signed-PDFs landen in `compliance/avv/` (gitignored) mit Datum + Anbieter im Dateinamen.

---

## 4. Betroffenenrechte — Umsetzung

| Recht | Umsetzungsweg | Status |
|---|---|---|
| Auskunft (Art. 15) | Anfrage an oss@osss.pro → manueller Export aus Supabase | ☑ manuell |
| Berichtigung (Art. 16) | Self-Service via Dashboard oder oss@osss.pro | ☑ |
| Löschung (Art. 17) | Anfrage an oss@osss.pro → DELETE auf members + cascade | ☑ manuell |
| Einschränkung (Art. 18) | Soft-Delete-Flag auf Members möglich | ☐ TODO |
| Datenübertragbarkeit (Art. 20) | CSV-Export Mitglieder → Gym-Owner kann exportieren | ☐ TODO |
| Widerspruch (Art. 21) | E-Mail an oss@osss.pro | ☑ |
| Beschwerde Behörde | Hinweis in Datenschutzerklärung | ☑ BayLDA für Bayern |

---

## 5. Meldepflichten bei Datenschutzverletzungen (Art. 33 DSGVO)

| Schritt | Wer | Frist |
|---|---|---|
| Erkennung Vorfall | jeder Mitarbeiter / Sentry-Alert | sofort |
| Bewertung (Risiko hoch?) | Verantwortlicher | < 24h |
| Meldung BayLDA (bei Risiko) | Verantwortlicher | < 72h |
| Information Betroffener (bei hohem Risiko) | Verantwortlicher | unverzüglich |
| Dokumentation in `compliance/breach-log.md` | Verantwortlicher | < 72h |

**Kontakt BayLDA:**
Promenade 18, 91522 Ansbach
poststelle@lda.bayern.de
+49 981 180093-0

---

## V11 — Forderungsbeitreibung (Inkasso)

| Feld | Eintrag |
|---|---|
| **Zweck** | Übergabe offener, fälliger Mitgliedsforderungen an den Inkassodienstleister Paywise (paywise.de) zur außergerichtlichen Beitreibung, nachdem das gym-eigene Mahnverfahren (V1/V6) erfolglos blieb |
| **Rechtsgrundlage** | Art. 6(1)(b) DSGVO (Durchsetzung der Beitragsforderung aus dem Mitgliedsvertrag) + Art. 6(1)(f) (berechtigtes Interesse an der Realisierung offener Forderungen) |
| **Betroffene Personen** | Säumige Mitglieder (Schuldner) der angeschlossenen Gyms |
| **Datenkategorien** | Vor-/Nachname, Anschrift, E-Mail, Telefon, Geburtsdatum; Forderungsdaten: offener Betrag, Rechnungsnummer, Rechnungs-/Fälligkeitsdatum, Verzugsbeginn, Mahnhistorie |
| **Empfänger** | **Paywise** (Inkassodienstleister, Deutschland). osss.pro übermittelt im Auftrag/auf Weisung des jeweiligen Gyms via API. |
| **Drittlandtransfer** | **Keiner** — Paywise verarbeitet in Deutschland/EU. |
| **Speicherdauer** | Bis Abschluss des Inkassoverfahrens; forderungsrelevante Daten anschließend 10 Jahre (§ 257 HGB / § 147 AO) |
| **TOMs** | TLS 1.3 in-transit, API-Token-Auth (getrennt Test/Prod), HMAC-SHA256-signierte Status-Webhooks; Übergabe opt-in pro Gym (`dunning_auto_inkasso_enabled`) oder manuell |
| **Bemerkung** | Zwei-Stufen-Modell: **Gym = Verantwortlicher** für die Forderungs-/Schuldnerdaten, **osss.pro = Auftragsverarbeiter** (technische Übermittlung), **Paywise = Empfänger/Inkassodienstleister**. Die datenschutzrechtliche Rolle von Paywise (Auftragsverarbeiter vs. eigene Verantwortlichkeit) ist vertraglich zu fixieren. **AVV/Datenübermittlungsvereinbarung mit Paywise noch zu unterschreiben** (Voraussetzung vor dem ersten Echtfall). Mitglieder sind in der Datenschutzerklärung über die mögliche Inkasso-Übergabe zu informieren. |

---

## 6. Änderungshistorie

| Datum | Änderung | Geändert von |
|---|---|---|
| 2026-05-06 | Erstellung des Verzeichnisses | Lom-Ali Imadaev |
| 2026-06-18 | V11 Forderungsbeitreibung (Paywise-Inkasso) ergänzt | Lom-Ali Imadaev / Claude |
