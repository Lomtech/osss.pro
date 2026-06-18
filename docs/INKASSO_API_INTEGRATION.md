# Inkasso-API-Anbindung — Finalisierungs-Playbook

**Stand 2026-06-03.** Das provider-agnostische Gerüst steht (`src/lib/inkasso/`).
Diese Anleitung führt von dort zu „Inkasso-API läuft in Produktion".

> **Ehrlicher Kern:** Die Code-Anbindung ist die einfache Hälfte. Der eigentliche
> Blocker ist ein **unterschriebener Inkasso-Vertrag + Credentials** — jeder
> seriöse deutsche Anbieter gated seine API dahinter (kein self-serve). Phase 0
> ist deshalb der kritische Pfad, nicht der Code.

> **Update 2026-06-18 — Provider gewählt: Paywise** (paywise.de). Onboarding als
> Integrationspartner hat geklappt; §19 ist dort **kein** Blocker (Partner-Modell,
> Gyms = Gläubiger). Das konkrete Feld-Mapping + der Paywise-Adapterplan stehen in
> **[`INKASSO_PAYWISE_MAPPING.md`](./INKASSO_PAYWISE_MAPPING.md)**. Dieses Playbook
> bleibt der generische Rahmen (Phasen 0–7); die Anbieter-Tabelle in Phase 0.1 ist
> damit historisch.

---

## Was schon existiert (nicht nochmal bauen)

| Baustein | Datei | Zustand |
|---|---|---|
| Provider-Interface + Registry | `src/lib/inkasso/provider.ts` | fertig |
| Sandbox-Adapter (Test ohne Vertrag) | `src/lib/inkasso/sandbox.ts` | fertig |
| Provider-Registrierung (env-gated) | `src/lib/inkasso/index.ts` | fertig |
| Handoff-Submit verdrahtet | `src/app/api/members/[id]/dunning/handoffs/route.ts` | fertig |
| Webhook-Empfänger (status-callbacks) | `src/app/api/inkasso/webhook/[provider]/route.ts` | fertig |
| Unit-Tests | `tests/unit/inkasso.test.ts` | 10 grün |
| Dossier-PDF (Übergabe-Dokument) | `src/lib/dunning-handoff-pdf.tsx` | fertig |
| 3-Stufen-Mahn-Eskalation | `src/app/api/cron/dunning-escalation/route.ts` | fertig |

**Datenmodell** (`dunning_handoffs`, live verifiziert — Schema ist API-ready):
`reference_id` (text, Provider-Fall-ID) · `provider_response` (jsonb, Audit) ·
`sent_at` / `accepted_at` / `closed_at` (timestamptz) · `status`.

**Status-Lifecycle** (Live-CHECK-Constraint):
`initiated → pdf_exported → sent_to_provider → accepted | rejected → paid | written_off → closed`

---

## Phase 0 — Anbieter wählen + Vertrag (KRITISCHER PFAD, ~1-3 Wochen)

Ohne das kann nichts „laufen". Parallel zu allem anderen sofort starten.

### 0.1 Anbieter-Entscheidung

| Kriterium | Finion FairPay (Sport Alliance) | debtist | Klassisch (EOS, Creditreform, …) |
|---|---|---|---|
| Fitness-spezialisiert | **Ja** (Branche #1) | Nein (Generalist) | Nein |
| API | Partner-Integration (Magicline/PerfectGym) | **API-first REST + Webhooks** | meist Portal/Datei |
| SEPA-Rückbuchungsrisiko-Übernahme | **Ja** (Finion MemberCash) | Nein | Nein |
| Self-serve | Nein (Vertrag) | Nein (Vertrag) | Nein |
| API-Doku öffentlich | Nein | Nein (auf Anfrage) | meist keine API |

**Empfehlung:** Für ein Kampfsport-/Fitness-Studio ist **Finion FairPay** der
naheliegende Anbieter (Branchen-Fit + SEPA-Risiko). Wenn dir saubere REST+Webhook-
Integration wichtiger ist als Branchen-Fit: **debtist**. Beides erfordert ein
Sales-Gespräch.

> Verifiziere im Sales-Call: **Success-Fee / Provision**, ob eine **REST-API oder
> nur SFTP/Portal-Upload** angeboten wird, **Sandbox-Zugang**, **Webhook-Support**
> für Status-Rückmeldung, und ob sie eine **Test-/Onboarding-Umgebung** geben.

### 0.2 Was du vom Anbieter brauchst (Onboarding-Checkliste)
- [ ] Unterschriebener Inkasso-/Forderungsmanagement-Vertrag
- [ ] **API-Dokumentation** (Endpunkte, Auth-Methode, Pflichtfelder, Fehlercodes)
- [ ] **Credentials** (API-Key / OAuth-Client) — getrennt für Sandbox + Production
- [ ] **Webhook-Spezifikation** (Payload-Format, Signatur-Verfahren, Status-Werte)
- [ ] Sandbox-/Test-Umgebung zum Durchspielen ohne echte Schuldner

### 0.3 DSGVO — NICHT vergessen (Pflicht vor erstem echten Fall)
Ein Inkasso-Anbieter verarbeitet Schuldner-PII in deinem Auftrag → **neuer
Auftragsverarbeiter**:
- [ ] **AVV (Art. 28 DSGVO)** mit dem Anbieter unterschreiben
- [ ] Eintrag in `compliance/verarbeitungsverzeichnis.md` (neue Tätigkeit „V11 — Forderungsbeitreibung")
- [ ] In der Datenschutzerklärung als Empfänger ergänzen

---

## Phase 1 — Mahn-Loop lückenlos machen (Code, ~0,5 Tag) — VOR Go-live

Damit kein Rückstand am Inkasso vorbei „durchrutscht". Heute eskalieren **nur
Abo-Rechnungen** automatisch; Einmal-/Manuell-Zahlungen + Rückbuchungen nicht.

In `src/app/api/stripe/webhook/route.ts`:
- [ ] `payment_intent.payment_failed`-Branch: nicht nur `status='failed'` setzen,
      sondern dieselbe Dunning-Eskalation triggern wie `invoice.payment_failed`
      (dunning_level++, `dunning_actions`-Eintrag, `sendDunningMail`).
- [ ] `charge.refunded` (Rückbuchung/Chargeback): in den Mahn-Flow überführen.
- [ ] Gemeinsame Helper-Funktion `escalateDunning(memberId, amountCents)` aus dem
      bestehenden `invoice.payment_failed`-Block extrahieren und an allen drei
      Stellen aufrufen (DRY + testbar).

Optional, aber empfohlen für „läuft von selbst":
- [ ] Bei Mahnstufe 3 (`final_warning`) automatisch eine `dunning_handoffs`-Row
      `status='initiated'` anlegen (oder Owner-Reminder), damit Fälle nicht bei
      L3 liegenbleiben. Siehe `dunning-escalation/route.ts` (L2→L3-Block).

**Test:** Property-/Unit-Test für `escalateDunning` (analog
`tests/unit/checkout-math.test.ts`).

---

## Phase 2 — Echten Provider-Adapter bauen (Code, ~1-2 Tage NACH Phase 0)

Sobald Doku + Sandbox-Credentials da sind. **Eine neue Datei, sonst nichts.**

### 2.1 Adapter anlegen
`src/lib/inkasso/<provider>.ts` (z.B. `fair-pay.ts` oder `debtist.ts`):

```ts
import {
  type InkassoProvider, type InkassoCase, type SubmitResult,
  type StatusUpdate, isHandoffStatus,
} from './provider'

export class DebtistProvider implements InkassoProvider {
  readonly name = 'other' // MUSS ein Wert aus dem dunning_handoffs.provider-CHECK sein
                          // ('sport_alliance'|'fair_pay'|'eos'|'creditreform'|'riverty'|'manual'|'other')

  private apiKey = process.env.INKASSO_DEBTIST_API_KEY ?? ''
  private webhookSecret = process.env.INKASSO_DEBTIST_WEBHOOK_SECRET ?? ''
  private baseUrl = process.env.INKASSO_DEBTIST_BASE_URL ?? 'https://api.debtist.com/v1'

  isConfigured() { return Boolean(this.apiKey) }

  async submitCase(c: InkassoCase): Promise<SubmitResult> {
    try {
      const res = await fetch(`${this.baseUrl}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        // Feld-Mapping aus der Anbieter-Doku — debtor, amount, reference …
        body: JSON.stringify({
          external_reference: c.reference,          // unsere Idempotenz-Referenz
          amount_cents: c.amountCents,
          debtor: {
            first_name: c.debtor.firstName, last_name: c.debtor.lastName,
            email: c.debtor.email, address: c.debtor.street,
            date_of_birth: c.debtor.dateOfBirth,
          },
          creditor: { name: c.creditor.gymName },
          notes: c.notes,
        }),
      })
      const raw = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, status: 'initiated', raw, error: `HTTP ${res.status}` }
      return {
        ok: true,
        referenceId: raw.case_id,                   // ← Provider-Fall-ID → reference_id
        status: 'sent_to_provider',
        raw,
      }
    } catch (e) {
      return { ok: false, status: 'initiated', raw: { error: String(e) },
               error: e instanceof Error ? e.message : 'network error' }
    }
  }

  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    // Signatur-Verfahren aus der Anbieter-Doku (HMAC-SHA256 o.ä.).
    // Beispiel-Pattern siehe sandbox.ts (constant-time compare).
    const sig = headers['x-debtist-signature'] ?? ''
    // const expected = hmacSha256(rawBody, this.webhookSecret) …
    return sig.length > 0 // ← durch echte Signaturprüfung ersetzen
  }

  parseWebhook(payload: unknown): StatusUpdate[] | null {
    const p = payload as Record<string, unknown>
    const referenceId = typeof p?.case_id === 'string' ? p.case_id : null
    // Provider-Status → unser Lifecycle mappen:
    const map: Record<string, string> = {
      accepted: 'accepted', rejected: 'rejected',
      paid: 'paid', written_off: 'written_off', closed: 'closed',
    }
    const status = map[String(p?.status)] ?? null
    if (!referenceId || !status || !isHandoffStatus(status)) return null
    return [{ referenceId, status, raw: p }]
  }
}
```

### 2.2 Registrieren
In `src/lib/inkasso/index.ts`, im `initInkassoProviders()`:
```ts
import { DebtistProvider } from './debtist'
const debtist = new DebtistProvider()
if (debtist.isConfigured()) registerProvider(debtist)
```

### 2.3 Env-Vars
In `.env.example` **und** in Vercel/Coolify (Production + Preview):
```
INKASSO_DEBTIST_API_KEY=
INKASSO_DEBTIST_WEBHOOK_SECRET=
INKASSO_DEBTIST_BASE_URL=
```
(`osss-audit env-consistency` läuft sonst rot — neue `process.env`-Reads müssen
in `.env.example`.)

### 2.4 Unit-Tests
`tests/unit/inkasso.test.ts` erweitern: Adapter mit gemocktem `fetch`
(submitCase ok/fehler), `parseWebhook`-Mapping, `verifyWebhook`-Signatur.

---

## Phase 3 — Schema ins Repo holen (Code, ~0,5 Tag)

`dunning_handoffs` (+ `quotes`/`quote_line_items`/`invoice_line_items`) leben
nur in der Live-DB, nicht in `supabase/migrations/` oder `database.ts` → der
Code nutzt `as any`. Vor dem Go-live sauber ziehen:
- [ ] `supabase login` + `supabase link --project-ref ktwgvuasjezokhsfpfqb`
- [ ] `supabase db pull` → erzeugt Migration mit dem echten Schema
- [ ] `supabase gen types typescript --linked > src/types/database.ts` (oder manuell
      `dunning_handoffs` ergänzen) → `as any` in den Inkasso-Routen entfernen
- [ ] `osss-audit migrations-types-drift` + `rls` müssen danach grün sein

---

## Phase 4 — Webhook beim Anbieter registrieren

- [ ] Callback-URL im Anbieter-Dashboard hinterlegen:
      `https://www.osss.pro/api/inkasso/webhook/<provider>`
      (`<provider>` = der `name` aus dem Adapter, z.B. `fair_pay` oder `other`)
- [ ] Signatur-Secret im Anbieter + als `INKASSO_<PROVIDER>_WEBHOOK_SECRET` setzen
- [ ] Die Route ist bereits da (`src/app/api/inkasso/webhook/[provider]/route.ts`):
      verifiziert Signatur via `adapter.verifyWebhook`, mappt via `parseWebhook`,
      patcht `dunning_handoffs` per `reference_id`.

---

## Phase 5 — Testen (Sandbox → Provider-Sandbox → Echtfall)

### 5.1 Lokal mit dem eingebauten Sandbox-Adapter (ohne Vertrag)
```bash
# .env.local
INKASSO_SANDBOX_ENABLED=true
INKASSO_WEBHOOK_SECRET=test-secret-123
```
1. Handoff anlegen: `POST /api/members/<id>/dunning/handoffs` mit `{"provider":"other","amount_cents":150000}`
   → Antwort: `reference_id: "SBX-…"`, `status: sent_to_provider`.
2. Status-Webhook simulieren:
```bash
curl -X POST https://localhost:3000/api/inkasso/webhook/other \
  -H 'x-inkasso-secret: test-secret-123' -H 'Content-Type: application/json' \
  -d '{"reference_id":"SBX-XXXXXXXX","status":"paid"}'
```
   → `dunning_handoffs.status` springt auf `paid`, `closed_at` gesetzt.

### 5.2 Provider-Sandbox (mit Test-Credentials aus Phase 0)
Adapter mit Sandbox-Keys, einen Testfall durchspielen, Webhook-Round-Trip prüfen.

### 5.3 Erster Echtfall (kontrolliert)
Einen realen, alten Rückstand übergeben, in Provider-Portal + osss-Status verfolgen.

---

## Phase 6 — UI (Code, ~0,5 Tag)

Im Dunning-Tab (`src/app/dashboard/members/[id]/DunningHandoffSection.tsx`):
- [ ] Handoff-Status-Badge (`sent_to_provider` / `paid` / `written_off` …) + `reference_id`
- [ ] Bei Status `initiated` + konfiguriertem Provider: „Jetzt an <Provider> übergeben"-Button
- [ ] Bei Fehler: Hinweis + PDF-Fallback-Download

---

## Phase 7 — Go-live + Monitoring

- [ ] Production-Credentials in Coolify/Vercel setzen, redeploy
- [ ] Webhook-Production-URL beim Anbieter registrieren
- [ ] Sentry-Alert auf fehlgeschlagene `submitCase` / Webhook-401
- [ ] Monatlicher Abgleich: `dunning_handoffs` offene Fälle vs. Provider-Portal

---

## Definition of Done — „Inkasso-API läuft"
1. ✅ Vertrag + AVV unterschrieben, Production-Credentials gesetzt
2. ✅ Mahn-Loop lückenlos (Phase 1) — kein Failure rutscht durch
3. ✅ Adapter implementiert + getestet (Phase 2), Schema im Repo (Phase 3)
4. ✅ Webhook registriert + Round-Trip verifiziert (Phase 4/5)
5. ✅ Ein Echtfall erfolgreich übergeben + Status-Update empfangen
6. ✅ DSGVO: AVV + Verarbeitungsverzeichnis + Datenschutzerklärung aktualisiert

## Reihenfolge / kritischer Pfad
```
Phase 0 (Vertrag) ───────────────┐  ← Wochen, blockiert alles
Phase 1 (Loop-Fix) ── Phase 3 (Schema) ── parallel, ohne Vertrag machbar
                                  ↓
Phase 2 (Adapter) ← braucht Doku+Credentials aus Phase 0
                                  ↓
Phase 4/5 (Webhook+Test) → Phase 6 (UI) → Phase 7 (Go-live)
```
**Heute startbar ohne Vertrag:** Phase 1 (Loop-Fix) + Phase 3 (Schema) + Sandbox-Test.
**Alles andere wartet auf den Vertrag** — deshalb ist der Sales-Call der erste Schritt.
