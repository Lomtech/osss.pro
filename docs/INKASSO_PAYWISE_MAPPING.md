# Inkasso · Paywise — Integrations- & Feld-Mapping

> **Companion zu [`INKASSO_API_INTEGRATION.md`](./INKASSO_API_INTEGRATION.md)** (generisches Playbook).
> Hier steht der **konkrete Paywise-Adapter**: Entities, Feld-für-Feld-Mapping,
> Onboarding, Status-Polling.
>
> **Quelle:** verifiziert gegen die echte API-Doku `docs.paywise.de` (Case-Management-
> API + Partner-API), Stand **2026-06-18**. Spalten gegen `src/types/database.ts`.
> Was NICHT aus der Doku belegt ist, steht unter §9 „Noch mit Paywise zu klären".

---

## 0. Warum Paywise — und warum §19 hier kein Blocker ist

debtist hatte abgesagt, weil osss.pro Kleinunternehmer (§19) ist. Bei Paywise fällt das weg:

- **Partner-Modell:** osss.pro = technischer **Integrationspartner**, **nie Gläubiger** → deine USt-Situation ist irrelevant.
- **§19-Gyms sind onboardbar:** `company.tax_deduction_eligibility = "N"` (nicht vorsteuerabzugsberechtigt) + `vat_number` ist **optional**.
- **Geld fließt auf die Gym-IBAN** (`company.iban`), nie über osss.pro → kein RDG-/Zahlungsdienste-Risiko.

---

## 1. Entity-Modell

| osss.pro | Paywise-Entity | API |
|---|---|---|
| **osss.pro** (du) | **Partner** (hält EIN Partner-Token) | Partner API |
| **Gym** (`gyms`) | **Company** = der **Gläubiger** | Partner API (anlegen) |
| Gym-Inhaber/Personal | **User** (≥1 pro Company, Login + Benachrichtigungen) | Partner API |
| **Mitglied** (`members`) | **Debtor** (`acting_as: consumer`) | Case-Mgmt API |
| offene Rechnung (`payments`) | **Claim** → nach Annahme in **Mandate** | Case-Mgmt API |

Eine Company muss `data_submission_completed = true` sein, **bevor** Claims gehen.
Claims im Namen eines Gyms werden mit dem Header **`X-User-Id: <paywise_user_id>`** gestellt.

---

## 2. APIs / Auth / Umgebungen

| | Partner API | Case-Management API |
|---|---|---|
| Base-URL | `https://api.paywise.de/partner/v1/` | `https://api.paywise.de/v1/` |
| Zweck | Companies + Users anlegen/verwalten | Debtors, Claims, Payments, Statements |
| Auth | `Authorization: Bearer <partner_token>` | `Authorization: Bearer <company_token>` + `X-User-Id` |

- REST/JSON, **getrennte Test- & Prod-Keys** + **Test-Mode** (der Key bestimmt live/test).
- **Kein Bulk** — ein Objekt pro Request.
- **Beträge** sind Objekte mit `{ "value": "150.00" }` — **Dezimal-String in Euro, NICHT Cent.** → unser `amount_cents` muss als `(cents/100).toFixed(2)` übergeben werden. (Dezimal-Trenner = Punkt; bei Bedarf in §9 verifizieren.)

---

## 3. Gym onboarden (einmalig, Partner API)

### 3.1 Weg A — Web-Flow-Onboarding (empfohlen)
Paywise-gehostete Seite: der **Gym-Inhaber** macht **selbst** KYC, hinterlegt IBAN/Rechtsform/
Vertreter und **akzeptiert Paywise' Bedingungen**. osss.pro bekommt am Ende `company_id` + `user_id`.
→ Sauber, weil die Inkasso-Beauftragung rechtlich dem Gym gehört, nicht dir.

### 3.2 Weg B — API-only (`POST /partner/v1/companies/`)
Vollautomatisch, aber osss.pro müsste die **Beauftragung des Gyms vorab einholen + dokumentieren**
(Opt-in im Dashboard + AGB/AVV-Klausel), und IBAN/Rechtsform/Vertreter selbst erheben.

### 3.3 Company-Feld-Mapping (`POST /partner/v1/companies/`)

| Paywise `companies` | Pflicht | ← osss.pro (`gyms.*`) | Hinweis |
|---|---|---|---|
| `name` | **ja** | `legal_name` ?? `name` | Juristischer Name bevorzugt |
| `phone` | **ja** | `phone` | |
| `address` {street,zip,city,country} | – | `legal_address` ?? `address` | **Einzel-String** → strukturieren (§9) |
| `vat_number` | – | `ustid` | nur wenn regelbesteuert; optional |
| `tax_deduction_eligibility` | – | aus `is_kleinunternehmer`: `true → "N"`, sonst `"J"` | **das §19-Feld** |
| `default_claim_type` | – | konstant **`"H22"`** (Mitgliedsbeitrag) | |
| `iban` | – | entschlüsselt aus `bank_iban_enc` (+ `bank_bic`/`bank_name`) | **verschlüsselt gespeichert** → beim Web-Flow gibt das Gym sie direkt ein |
| `legal_form` | – | *(keine Spalte)* | beim Onboarding erheben |
| `legal_representatives[]` | – | *(keine Spalte)* | beim Onboarding erheben (e. V. → Vorstand) |
| `users[].email/first_name/last_name` | – | Gym-Owner (aus `auth.users` / Owner-Profil) | ≥1 User |

### 3.4 Neue `gyms`-Spalten (Migration)
```
paywise_company_id   text   null   -- Company-UUID von Paywise
paywise_user_id      text   null   -- für X-User-Id beim Claim
paywise_status       text   null   -- 'pending' | 'data_complete' | 'active'
```
Gym ist erst inkasso-fähig, wenn `paywise_status = 'active'` (== Company.data_submission_completed).

---

## 4. Forderung übergeben (Case-Management API, pro `dunning_handoffs`-Row)

`submitCase()` im Adapter macht **vier** Calls (Paywise hat keinen Ein-Schritt-Submit):

1. `POST /v1/debtors/` → Debtor anlegen (oder bestehenden wiederverwenden) → `debtor_id`
2. `POST /v1/claims/` → Claim mit `debtor_id` anlegen → `claim_id`
3. `POST /v1/claims/{id}/documents` → **Rechnungs-PDF hochladen** (wir generieren es via `dispatch-invoice-pdf.tsx`)
4. `PATCH/POST` Release → `submission_state = "released"`

`claim_id` → `dunning_handoffs.reference_id`; `status → 'sent_to_provider'`; Roh-Response → `provider_response`.
Alle Calls mit `X-User-Id = gym.paywise_user_id`.

### 4.1 Debtor-Mapping (`POST /v1/debtors/`)

| Paywise `debtors` | Pflicht | ← osss.pro (`members.*`) | Hinweis |
|---|---|---|---|
| `acting_as` | **ja** | konstant **`"consumer"`** | Mitglieder = Verbraucher |
| `addresses[]` {street,zip,city} | **ja** | `address` | **Einzel-String** → strukturieren (§9) |
| `person.first_name` | – | `first_name` | |
| `person.last_name` | – | `last_name` | |
| `person.birth_date` | – | `date_of_birth` | für Verbraucher-Inkasso wichtig |
| `communication_channels[].value` | – | `email`, `phone` | je ein Eintrag |
| `your_reference` | – | `buildReference(gymId, handoffId)` | Idempotenz |
| `bank_accounts[]` {iban,bic} | – | *(meist leer)* | nur falls bekannt |

### 4.2 Claim-Mapping (`POST /v1/claims/`)

| Paywise `claims` | Pflicht | ← osss.pro | Hinweis |
|---|---|---|---|
| `debtor` | **ja** | `debtor_id` aus Schritt 1 | |
| `your_reference` | **ja** | `buildReference(...)` | |
| `subject_matter` | **ja** | `payments.description` ?? `"Mitgliedsbeitrag <Gym>"` | Leistungsbeschreibung |
| `occurence_date` | **ja** | `payments.issued_at` (Vertrags-/Leistungsdatum) | bei wiederkehrend = Rechnungs-/Leistungszeitraum (§9) |
| `document_reference` | **ja** | `payments.invoice_number` | Rechnungsnummer |
| `document_date` | **ja** | `payments.issued_at` | Rechnungsdatum |
| `due_date` | **ja** | `payments.due_date` | |
| `reminder_date` | **ja** | Datum der **ersten echten Mahnung** | **NICHT** Zahlungserinnerung! aus `dunning_actions` (§9) |
| `delay_date` | **ja** | Verzugsbeginn (§286 BGB) | sorgfältig ableiten (§9) |
| `main_claim_amount.value` | **ja** | `payments.amount_cents` → `"X.XX"` | **Hauptforderung** (Prinzipal inkl. USt) |
| `total_claim_amount.value` | **ja** | Haupt + Nebenforderungen − erhaltene Zahlungen | s. u. |
| `starting_approach` | **ja** | konstant **`"extrajudicial"`** | erst außergerichtlich |
| `claim_disputed` | **ja** | `false` | sonst Rückfrage |
| `obligation_fulfilled` | **ja** | `true` | Gym hat Leistung erbracht |
| `additional_charges[]` | – | Mahngebühren + Zinsen + Rücklastschrift | **Nebenforderungen**, s. u. |
| `items[]` | – | aus `invoice_line_items` | optional, erhöht Erfolg |

**Betragslogik — wichtig:** Paywise trennt **Hauptforderung** und **Nebenforderungen**.
Unser `dunning_handoffs.amount_cents` ist der Gesamtbetrag → aufteilen:
- `main_claim_amount` = ursprüngliche Rechnung (`payments.amount_cents`)
- `additional_charges[]` = Mahngebühren (`gyms.dunning_late_fee_cents`) + Verzugszinsen (`gyms.dunning_interest_*`) + ggf. Rücklastschriftgebühr — je als eigene Nebenforderung mit `subject_matter` (z. B. „Mahngebühr").
- `total_claim_amount` = Summe − bereits erhaltene Teilzahlungen.

---

## 5. Status verfolgen — **Polling, KEIN Webhook**

Paywise hat **keinen Webhook-Endpoint** → der `parseWebhook`/`verifyWebhook`-Pfad bleibt für
Push-Provider, Paywise braucht einen **Status-Poll-Cron** (z. B. stündlich, Inngest/Vercel-Cron):

1. offene `dunning_handoffs` (status ∈ sent_to_provider/accepted) laden,
2. `GET /v1/claims/{id}` (`submission_state`) + `GET /v1/mandates/{id}/status-updates` pollen,
3. auf `HandoffStatus` mappen (gleiche Persist-Logik wie der Webhook-Receiver).

| Paywise | → `HandoffStatus` |
|---|---|
| `submission_state` = released / under_review / client_response_pending | `sent_to_provider` |
| `submission_state` = accepted (in Mandate) | `accepted` |
| `submission_state` = rejected | `rejected` |
| Mandate-Status-Update „bezahlt" | `paid` → `closed_at` |
| Mandate-Status-Update „niedergeschlagen/storniert" | `written_off` / `closed` |

> Die exakten Mandate-Status-Werte (Schritt „paid/written_off") stehen in
> `mandates/list-status-updates` — beim Bauen gegen die Werteliste mappen (§9).

**Rückfragen (Requests to Client):** `GET /v1/mandates/{id}/requests-to-client` → im Dashboard
anzeigen, Owner antwortet (`submit answer` + ggf. Doc-Upload).

---

## 6. Direktzahlungen melden

Zahlt ein Mitglied nach Übergabe direkt ans Gym → **muss an Paywise gemeldet werden**
(`POST /v1/payments/` mit `claim`-Bezug, `amount.value`, `value_date`), sonst treibt Paywise zu viel ein.
Trigger: Stripe-Webhook/Manuelle-Zahlung auf ein Member mit offenem Handoff → Payment melden.

---

## 7. Provider-Slot `paywise`

`dunning_handoffs.provider` erlaubt aktuell nur `sport_alliance | fair_pay | eos | creditreform | riverty | manual | other`.
**Entweder** `'other'` nutzen (wie der Sandbox-Adapter — kollidiert dann aber mit Sandbox),
**oder** sauber `'paywise'` ergänzen:
1. Migration: CHECK-Constraint um `'paywise'` erweitern,
2. TS-Union in `src/app/dashboard/members/[id]/DunningHandoffSection.tsx`,
3. Allow-List in `src/app/api/members/[id]/dunning/handoffs/route.ts` (Zeile ~28).
→ danach `osss-audit migrations-types-drift` grün halten.

---

## 8. Env-Vars (`.env.example` **und** Vercel/Coolify)

```
INKASSO_PAYWISE_PARTNER_TOKEN=     # Partner API (Companies/Users)
INKASSO_PAYWISE_API_TOKEN=         # Case-Management API (Claims/Debtors)
INKASSO_PAYWISE_BASE_URL=https://api.paywise.de
# Test- und Prod-Token sind verschieden — in Preview die Test-Keys.
```
(Jeder neue `process.env`-Read MUSS in `.env.example`, sonst läuft `osss-audit env-consistency` rot.)

---

## 9. Noch mit Paywise / fachlich zu klären (ehrliche offene Punkte)

- **`occurence_date`** bei wiederkehrendem Mitgliedsbeitrag — Leistungsdatum, Rechnungsdatum oder Vertragsdatum? (Paywise: „check back with team".)
- **`delay_date` (Verzugsdatum)** — §286 BGB: 30 Tage nach Fälligkeit + Hinweis, oder ab erster Mahnung? (Paywise: „check back with team".)
- **`reminder_date`** — unser Mahnflow muss festhalten, **welche** Aktion eine echte „Mahnung" war (keine „Zahlungserinnerung"). Ggf. `dunning_actions.action_type` schärfen.
- **Adress-Strukturierung** — `gyms.address` und `members.address` sind Einzel-Strings; Paywise will `{street,zip,city}`. Entweder strukturierte Felder ergänzen oder beim Onboarding/Handoff erfassen.
- **Betragsformat** — `{value}` Dezimal-Trenner (Punkt vs. Komma) + ob inkl./exkl. USt bei §19 (dann USt=0).
- **Mandate-Status-Werteliste** für das `paid/written_off/closed`-Mapping (`mandates/list-status-updates`).
- **Statements/Abrechnung** — Format der `statements`-Endpunkte für die monatliche Rückführung ans Gym (noch nicht im Detail gelesen).
- **API-only-Onboarding** — verlangt Paywise eine explizite Gym-Zustimmung/Signatur, oder reicht unser Opt-in + AVV?

---

## 10. Bau-Reihenfolge (nach Mapping-Freigabe)

1. **Migration** — `gyms.paywise_*`-Spalten + `'paywise'` im `provider`-CHECK.
2. **Onboarding** — Web-Flow-Anbindung + Dashboard-Opt-in („Inkasso aktivieren") + `company_id/user_id` speichern.
3. **`PaywiseProvider`-Adapter** (`src/lib/inkasso/paywise.ts`) — `submitCase` (4-Step) + Betrags-Split + Mapping aus §4.
4. **Status-Poll-Cron** — `src/app/api/cron/inkasso-poll/route.ts` (mit `cronGuard`), Mapping aus §5.
5. **Direktzahlungs-Meldung** — in den Stripe-/Manuell-Zahlungs-Pfad einhängen (§6).
6. **Tests** — `tests/unit/inkasso.test.ts` erweitern (gemockter `fetch`: debtor/claim/release ok+Fehler, Status-Mapping, Betrags-Split).
7. **DSGVO** — AVV mit Paywise + Verarbeitungsverzeichnis „V11 — Forderungsbeitreibung" + Datenschutzerklärung (siehe Playbook Phase 0.3).
8. **Test-Mode-Durchlauf** → erster kontrollierter Echtfall → Go-live.
