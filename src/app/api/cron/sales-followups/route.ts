import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { cronGuard } from '@/lib/cron-guard'
import { getAppUrl } from '@/lib/app-url'
import { withCronSentry } from '@/lib/cron/with-sentry'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Cron: täglich 7:00 UTC = 8:00/9:00 MEZ
// (Vercel Hobby-Plan erlaubt nur 1× pro Tag — für stündliche Erinnerungen
//  müsste man auf Pro Plan upgraden oder externen Cron-Service nutzen)
//
// Job hat ZWEI Aufgaben:
//   1. Auto-Sequence-Stepping: schiebe Leads in der Sales-Pipeline weiter.
//      → 'new' (>1d alt) bekommt next_action='send_mail_1'
//      → 'contacted' (>3d/>7d/>14d) bekommt followup_mail_2 / linkedin_dm / call_followup
//      → 'contacted' (>21d ohne Reaktion) wird auf 'lost' gesetzt
//      → demo_scheduled mit vergangenem Datum → 'demo_followup'
//      → won (in erster Woche) → 'onboarding_check'
//
//   2. Erinnerungs-Mail an Admin mit allen heute fälligen Aktionen.
//      Nutzt next_action_at (Pipeline-View) UND legacy next_followup_at —
//      damit alte Leads (vor Pipeline-Migration) nicht aus dem Radar fallen.
const LOOKAHEAD_HOURS = 36 // 36h-Fenster: heute + morgen früh in einer Morgen-Mail

type LeadRow = {
  id: string
  name: string
  city: string | null
  phone: string | null
  email: string | null
  status: string
  priority: number
  notes: string | null
  next_followup_at: string | null
  next_action: string | null
  next_action_at: string | null
  last_contacted_at: string | null
  contact_count: number
}

export const GET = withCronSentry('sales-followups', async (req: Request) => {
  const guard = cronGuard(req)
  if (guard) return guard

  const supabase = createServiceClient()
  const now = new Date()

  // ─── PHASE 1: Auto-Sequence-Stepping ─────────────────────────────────
  // Wir lesen alle aktiven Leads und entscheiden pro Lead, ob ein next_action
  // gesetzt werden muss. Performance ist OK bei <10k aktiven Leads (CRM-Skala).
  const sequenced = await runAutoSequence(supabase, now)

  // Tagesübersicht-Mail standardmäßig AUS (Owner-Wunsch 2026-08: die tägliche
  // Sales-CRM-Erinnerung nicht mehr verschicken). Das Pipeline-Auto-Stepping
  // (Phase 1) oben läuft unverändert weiter — nur der Mail-Versand entfällt.
  // Wieder aktivieren: Env SALES_DIGEST_ENABLED=true setzen.
  if (process.env.SALES_DIGEST_ENABLED !== 'true') {
    return NextResponse.json({ ok: true, sequenced, mailSkipped: 'digest disabled (SALES_DIGEST_ENABLED != true)' })
  }

  // ─── PHASE 2: Reminder-Mail an Admin ─────────────────────────────────
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map(e => e.trim()).filter(Boolean)
  const resendConfigured = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL)
  if (adminEmails.length === 0 || !resendConfigured) {
    return NextResponse.json({
      ok: true,
      sequenced,
      mailSkipped: adminEmails.length === 0 ? 'ADMIN_EMAILS not set' : 'Resend not configured',
    })
  }

  const horizon = new Date(now.getTime() + LOOKAHEAD_HOURS * 60 * 60 * 1000)

  // De-dupe-Schwelle: ein Lead wird höchstens einmal alle 20h in eine Reminder-Mail
  // aufgenommen. Schützt vor Spam, falls der Cron mehrmals/Tag manuell getriggert
  // wird (Vercel Hobby = 1×/Tag, aber das ist eine schwache Garantie).
  const REMIND_COOLDOWN_HOURS = 20
  const cooldownCutoff = new Date(now.getTime() - REMIND_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString()

  // Wir sammeln Leads aus BEIDEN Feldern (next_action_at neu, next_followup_at legacy)
  // und deduplizieren über die ID. Ohne legacy-Pfad würden alte Leads ohne next_action
  // nie wieder erinnert werden.
  //
  // followup_reminded_at-Filter: Lead wird nur gemailt, wenn er noch nie erinnert
  // wurde ODER die letzte Erinnerung > REMIND_COOLDOWN_HOURS her ist.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actionDueRes = await (supabase.from('sales_leads') as any)
    .select('id, name, city, phone, email, status, priority, notes, next_followup_at, next_action, next_action_at, last_contacted_at, contact_count')
    .lte('next_action_at', horizon.toISOString())
    .not('next_action_at', 'is', null)
    .not('status', 'in', '(won,lost,not_a_fit,do_not_contact)')
    .or(`followup_reminded_at.is.null,followup_reminded_at.lt.${cooldownCutoff}`)
    .order('next_action_at', { ascending: true })
    .limit(200)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const followupDueRes = await (supabase.from('sales_leads') as any)
    .select('id, name, city, phone, email, status, priority, notes, next_followup_at, next_action, next_action_at, last_contacted_at, contact_count')
    .lte('next_followup_at', horizon.toISOString())
    .or(`followup_reminded_at.is.null,followup_reminded_at.lt.${cooldownCutoff}`)
    .order('next_followup_at', { ascending: true })
    .limit(100)

  if (actionDueRes.error || followupDueRes.error) {
    return NextResponse.json({
      error: actionDueRes.error?.message ?? followupDueRes.error?.message,
      sequenced,
    }, { status: 500 })
  }

  const seen = new Set<string>()
  const due: LeadRow[] = []
  for (const arr of [actionDueRes.data ?? [], followupDueRes.data ?? []]) {
    for (const l of arr as LeadRow[]) {
      if (seen.has(l.id)) continue
      seen.add(l.id)
      due.push(l)
    }
  }

  if (due.length === 0) {
    return NextResponse.json({ ok: true, sequenced, due: 0 })
  }

  const appUrl = getAppUrl()
  // Bucketing für die Mail — primär nach next_action_at, fallback next_followup_at
  function bestDate(l: LeadRow): Date | null {
    const t = l.next_action_at ?? l.next_followup_at
    return t ? new Date(t) : null
  }
  const overdue: LeadRow[] = []
  const today: LeadRow[] = []
  const tomorrow: LeadRow[] = []
  for (const l of due) {
    const d = bestDate(l)
    if (!d) continue
    if (d <= now) overdue.push(l)
    else if (d.toDateString() === now.toDateString()) today.push(l)
    else tomorrow.push(l)
  }

  const html = renderEmail({ overdue, today, tomorrow, appUrl, sequenced })
  const subject = overdue.length > 0
    ? `🔴 ${overdue.length} überfällige Aktionen + ${today.length + tomorrow.length} kommende`
    : `📞 ${today.length} Aktion${today.length !== 1 ? 'en' : ''} heute · ${tomorrow.length} morgen`

  let sent = 0
  const sendErrors: string[] = []
  for (const to of adminEmails) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to, subject, html }),
      })
      if (res.ok) sent++
      else sendErrors.push(`${to}: HTTP ${res.status}`)
    } catch (err) {
      sendErrors.push(`${to}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Mark ALLE in dieser Mail enthaltenen Leads als gerade erinnert.
  // Vorher wurde nur der legacy-Pfad markiert, was bedeutete dass action_at-Leads
  // bei einem 2. Cron-Run innerhalb der Cooldown-Phase nochmal gemailt wurden.
  // Jetzt: einheitlich für beide Pfade. Schützt vor Spam bei manuellen Triggers.
  if (sent > 0 && due.length > 0) {
    const allIds = due.map(l => l.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updRes = await (supabase.from('sales_leads') as any)
      .update({ followup_reminded_at: now.toISOString() })
      .in('id', allIds)
    if (updRes.error) {
      console.error('[cron/sales-followups] failed to mark leads as reminded:', updRes.error.message)
    }
  }

  return NextResponse.json({
    ok: sendErrors.length === 0,
    sequenced,
    due: due.length,
    overdue: overdue.length,
    today: today.length,
    tomorrow: tomorrow.length,
    emailsSent: sent,
    errors: sendErrors.length > 0 ? sendErrors : undefined,
  })
})

// ───── Auto-Sequence-Logik ─────────────────────────────────────────────
//
// Idempotent: setzt next_action nur, wenn sinnvoll (nicht überschreibt
// existierende, neuere Aktionen). Läuft täglich; wenn der Owner ein
// Wochenende offline war, kollabieren mehrere Tage zu einem einzigen
// next_action — der Owner sieht Montag die aktuellste fällige Aktion,
// nicht 3 Backlog-Mails.
//
// Schwellwerte werden gegen MAX gefenstert: wenn ein Lead 25 Tage nicht
// kontaktiert wurde und Status='contacted', wird er sofort auf 'lost'
// gesetzt (kein 21-Tage-Reminder mehr).
async function runAutoSequence(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  now: Date,
): Promise<{
  new_to_mail1: number
  to_followup2: number
  to_linkedin: number
  to_call: number
  contacted_lost: number
  demo_followups: number
  onboarding_checks: number
}> {
  const counters = {
    new_to_mail1: 0,
    to_followup2: 0,
    to_linkedin: 0,
    to_call: 0,
    contacted_lost: 0,
    demo_followups: 0,
    onboarding_checks: 0,
  }

  const oneDayAgo = new Date(now.getTime() - 1  * 86400_000).toISOString()
  const threeDaysAgo  = new Date(now.getTime() - 3  * 86400_000).toISOString()
  const sevenDaysAgo  = new Date(now.getTime() - 7  * 86400_000).toISOString()
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400_000).toISOString()
  const twentyOneDaysAgo = new Date(now.getTime() - 21 * 86400_000).toISOString()
  const sevenDaysAhead = new Date(now.getTime() + 7  * 86400_000).toISOString()

  const nowIso = now.toISOString()

  // Helper — patches a list of ids and logs a system activity per lead.
  // Errors are logged but don't abort the cron — partial progress is better
  // than zero progress when one rule fails.
  async function patchAndLog(
    ids: string[],
    update: Record<string, unknown>,
    activitySubject: string,
    activityKind: 'note' | 'status_change' | 'followup_scheduled',
  ) {
    if (ids.length === 0) return
    const updRes = await supabase.from('sales_leads').update(update).in('id', ids)
    if (updRes.error) {
      console.error(`[cron/sales-followups] sales_leads update failed (${activitySubject}):`, updRes.error.message)
      return // skip activity-insert if the update itself failed — keeps audit-trail consistent
    }
    const rows = ids.map(id => ({
      lead_id: id,
      kind: activityKind,
      subject: activitySubject,
      occurred_at: nowIso,
    }))
    const actRes = await supabase.from('sales_activities').insert(rows)
    if (actRes.error) {
      console.error(`[cron/sales-followups] sales_activities insert failed (${activitySubject}):`, actRes.error.message)
    }
  }

  // ── Rule 1: status='new' und created_at > 1 Tag → send_mail_1 sofort fällig
  const r1 = await supabase.from('sales_leads')
    .select('id')
    .eq('status', 'new')
    .lte('created_at', oneDayAgo)
    .is('next_action', null)
    .limit(500)
  const r1Ids = ((r1.data ?? []) as Array<{ id: string }>).map(l => l.id)
  if (r1Ids.length > 0) {
    await patchAndLog(r1Ids,
      { next_action: 'send_mail_1', next_action_at: nowIso },
      'Auto-Sequence: send_mail_1 fällig (Lead älter als 1 Tag)',
      'followup_scheduled')
    counters.new_to_mail1 = r1Ids.length
  }

  // ── Rule 5: status='contacted' und last_contacted_at > 21 Tage → lost
  // ZUERST! Damit der gleiche Lead nicht erst auf followup gesetzt und sofort
  // wieder auf 'lost' geschoben wird.
  const r5 = await supabase.from('sales_leads')
    .select('id')
    .eq('status', 'contacted')
    .not('last_contacted_at', 'is', null)
    .lte('last_contacted_at', twentyOneDaysAgo)
    .limit(500)
  const r5Ids = ((r5.data ?? []) as Array<{ id: string }>).map(l => l.id)
  if (r5Ids.length > 0) {
    await patchAndLog(r5Ids,
      { status: 'lost', lost_reason: 'no_response', next_action: null, next_action_at: null },
      'Auto-Sequence: contacted → lost (21d ohne Reaktion)',
      'status_change')
    counters.contacted_lost = r5Ids.length
  }

  // ── Rule 2: status='contacted' und last_contacted_at zw. 3 und 7 Tagen → followup_mail_2
  const r2 = await supabase.from('sales_leads')
    .select('id, next_action')
    .eq('status', 'contacted')
    .not('last_contacted_at', 'is', null)
    .lte('last_contacted_at', threeDaysAgo)
    .gt('last_contacted_at', sevenDaysAgo)
    .or('next_action.is.null,next_action.eq.send_mail_1')
    .limit(500)
  const r2Ids = ((r2.data ?? []) as Array<{ id: string }>).map(l => l.id)
  if (r2Ids.length > 0) {
    await patchAndLog(r2Ids,
      { next_action: 'followup_mail_2', next_action_at: nowIso },
      'Auto-Sequence: followup_mail_2 fällig (3d nach Kontakt)',
      'followup_scheduled')
    counters.to_followup2 = r2Ids.length
  }

  // ── Rule 3: status='contacted' und last_contacted_at zw. 7 und 14 Tagen → linkedin_dm
  const r3 = await supabase.from('sales_leads')
    .select('id')
    .eq('status', 'contacted')
    .not('last_contacted_at', 'is', null)
    .lte('last_contacted_at', sevenDaysAgo)
    .gt('last_contacted_at', fourteenDaysAgo)
    .or('next_action.is.null,next_action.in.(send_mail_1,followup_mail_2)')
    .limit(500)
  const r3Ids = ((r3.data ?? []) as Array<{ id: string }>).map(l => l.id)
  if (r3Ids.length > 0) {
    await patchAndLog(r3Ids,
      { next_action: 'linkedin_dm', next_action_at: nowIso },
      'Auto-Sequence: linkedin_dm fällig (7d nach Kontakt)',
      'followup_scheduled')
    counters.to_linkedin = r3Ids.length
  }

  // ── Rule 4: status='contacted' und last_contacted_at zw. 14 und 21 Tagen → call_followup
  const r4 = await supabase.from('sales_leads')
    .select('id')
    .eq('status', 'contacted')
    .not('last_contacted_at', 'is', null)
    .lte('last_contacted_at', fourteenDaysAgo)
    .gt('last_contacted_at', twentyOneDaysAgo)
    .or('next_action.is.null,next_action.in.(send_mail_1,followup_mail_2,linkedin_dm)')
    .limit(500)
  const r4Ids = ((r4.data ?? []) as Array<{ id: string }>).map(l => l.id)
  if (r4Ids.length > 0) {
    await patchAndLog(r4Ids,
      { next_action: 'call_followup', next_action_at: nowIso },
      'Auto-Sequence: call_followup fällig (14d nach Kontakt)',
      'followup_scheduled')
    counters.to_call = r4Ids.length
  }

  // ── Rule 6: demo_scheduled aber next_followup_at < jetzt und kein next_action_at
  // → demo_followup (Demo war, aber Owner hat noch nichts geloggt)
  const r6 = await supabase.from('sales_leads')
    .select('id')
    .eq('status', 'demo_scheduled')
    .not('next_followup_at', 'is', null)
    .lte('next_followup_at', nowIso)
    .is('next_action', null)
    .limit(500)
  const r6Ids = ((r6.data ?? []) as Array<{ id: string }>).map(l => l.id)
  if (r6Ids.length > 0) {
    await patchAndLog(r6Ids,
      { next_action: 'demo_followup', next_action_at: nowIso, status: 'demo_done' },
      'Auto-Sequence: demo_followup fällig (Demo-Termin liegt zurück)',
      'followup_scheduled')
    counters.demo_followups = r6Ids.length
  }

  // ── Rule 7: status='won' und converted_at innerhalb der letzten 7 Tage
  // → next_action='onboarding_check' falls noch nicht gesetzt
  const r7 = await supabase.from('sales_leads')
    .select('id')
    .eq('status', 'won')
    .not('converted_at', 'is', null)
    .gte('converted_at', sevenDaysAgo)
    .lte('converted_at', nowIso)
    .is('next_action', null)
    .limit(500)
  const r7Ids = ((r7.data ?? []) as Array<{ id: string }>).map(l => l.id)
  if (r7Ids.length > 0) {
    await patchAndLog(r7Ids,
      { next_action: 'onboarding_check', next_action_at: sevenDaysAhead },
      'Auto-Sequence: onboarding_check in 7 Tagen (won)',
      'followup_scheduled')
    counters.onboarding_checks = r7Ids.length
  }

  return counters
}

function actionLabel(a: string | null): string {
  if (!a) return 'Aktion offen'
  switch (a) {
    case 'send_mail_1':     return '✉ Erstkontakt-Mail senden'
    case 'followup_mail_2': return '✉ Follow-up-Mail #2'
    case 'linkedin_dm':     return '💼 LinkedIn-DM'
    case 'call_followup':   return '📞 Anruf-Follow-up'
    case 'callback_call':   return '🔁 Rückruf'
    case 'demo_call':       return '🎯 Demo-Termin'
    case 'demo_followup':   return '📋 Demo-Nachfass'
    case 'onboarding_check':return '🚀 Onboarding-Check'
    default:                return a
  }
}

function renderEmail({ overdue, today, tomorrow, appUrl, sequenced }: {
  overdue: LeadRow[]; today: LeadRow[]; tomorrow: LeadRow[]; appUrl: string
  sequenced: { new_to_mail1: number; to_followup2: number; to_linkedin: number; to_call: number; contacted_lost: number; demo_followups: number; onboarding_checks: number }
}) {
  const fromDomain = (process.env.RESEND_FROM_EMAIL ?? 'noreply@osss.pro').split('@')[1] ?? 'osss.pro'

  const renderLead = (l: LeadRow, kind: 'overdue' | 'today' | 'tomorrow') => {
    const dt = l.next_action_at ? new Date(l.next_action_at) : (l.next_followup_at ? new Date(l.next_followup_at) : new Date())
    const time = dt.toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    const tone = kind === 'overdue' ? '#dc2626' : kind === 'today' ? '#d97706' : '#475569'
    const cta = `${appUrl}/admin/leads?view=pipeline&lead=${l.id}`
    const action = actionLabel(l.next_action)
    const phoneLine = l.phone ? `<div style="margin-top:4px;font-size:13px"><a href="tel:${l.phone}" style="color:#0f172a;text-decoration:none">📞 ${l.phone}</a></div>` : ''
    const emailLine = l.email ? `<div style="margin-top:2px;font-size:13px"><a href="mailto:${l.email}" style="color:#0f172a;text-decoration:none">✉ ${l.email}</a></div>` : ''
    const noteLine = l.notes ? `<div style="margin-top:6px;font-size:12px;color:#64748b;font-style:italic">"${escapeHtml(l.notes.slice(0, 200))}${l.notes.length > 200 ? '…' : ''}"</div>` : ''
    const stars = '★'.repeat(l.priority) + '☆'.repeat(5 - l.priority)
    return `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border-left:3px solid ${tone};background:#fafafa;border-radius:0 8px 8px 0">
        <tr><td style="padding:12px 16px">
          <div style="font-weight:700;font-size:15px;color:#0f172a">${escapeHtml(l.name)}</div>
          <div style="font-size:13px;color:${tone};margin-top:2px;font-weight:600">${escapeHtml(action)}</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px">
            ${l.city ? escapeHtml(l.city) + ' · ' : ''}${time} · <span style="color:${tone}">${kind === 'overdue' ? 'überfällig' : kind === 'today' ? 'heute' : 'morgen'}</span> · ${stars} · ${l.contact_count}× kontaktiert
          </div>
          ${phoneLine}${emailLine}${noteLine}
          <div style="margin-top:10px"><a href="${cta}" style="display:inline-block;padding:6px 12px;background:#0f172a;color:#fff;text-decoration:none;border-radius:6px;font-size:12px;font-weight:600">In der Pipeline öffnen →</a></div>
        </td></tr>
      </table>`
  }

  const section = (title: string, items: LeadRow[], kind: 'overdue' | 'today' | 'tomorrow') => {
    if (items.length === 0) return ''
    return `
      <div style="margin-top:24px">
        <h2 style="margin:0 0 12px;font-size:16px;color:#0f172a">${title} (${items.length})</h2>
        ${items.map(l => renderLead(l, kind)).join('')}
      </div>`
  }

  const seqSummary = (() => {
    const items: string[] = []
    if (sequenced.new_to_mail1) items.push(`${sequenced.new_to_mail1}× neue Leads → send_mail_1`)
    if (sequenced.to_followup2) items.push(`${sequenced.to_followup2}× → followup_mail_2`)
    if (sequenced.to_linkedin)  items.push(`${sequenced.to_linkedin}× → linkedin_dm`)
    if (sequenced.to_call)      items.push(`${sequenced.to_call}× → call_followup`)
    if (sequenced.demo_followups) items.push(`${sequenced.demo_followups}× → demo_followup`)
    if (sequenced.onboarding_checks) items.push(`${sequenced.onboarding_checks}× → onboarding_check`)
    if (sequenced.contacted_lost) items.push(`${sequenced.contacted_lost}× automatisch auf 'lost' (21d ohne Reaktion)`)
    if (items.length === 0) return ''
    return `<div style="margin-top:16px;padding:12px 16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:13px;color:#0c4a6e">
      <strong>🤖 Auto-Sequence-Update:</strong> ${items.join(' · ')}
    </div>`
  })()

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:560px">
        <tr><td style="background:#0f172a;border-radius:12px 12px 0 0;padding:20px 24px">
          <p style="margin:0;color:#fbbf24;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase">osss.pro · Sales-CRM</p>
          <h1 style="margin:6px 0 0;color:#fff;font-size:18px;font-weight:700">Tagesübersicht — Aktionen</h1>
        </td></tr>
        <tr><td style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
          ${seqSummary}
          ${section('🔴 Überfällig', overdue, 'overdue')}
          ${section('📞 Heute', today, 'today')}
          ${section('📅 Morgen', tomorrow, 'tomorrow')}
          <p style="font-size:11px;color:#9ca3af;margin:24px 0 0;border-top:1px solid #f1f5f9;padding-top:12px">
            Diese Erinnerung wird täglich verschickt für alle Leads mit fälliger next_action in den nächsten ${LOOKAHEAD_HOURS}h.
            <br>Sender: ${fromDomain}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]!)
}
