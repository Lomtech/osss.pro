'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'

/**
 * In-page contact modal — extracted from src/app/page.tsx so the landing page
 * itself can stay a Server Component. Posts to /api/public/contact, includes
 * a hidden honeypot field as the original did.
 *
 * IMPORTANT: rendered via createPortal into document.body. Reason: the nav
 * components use `backdrop-blur-md` (Tailwind backdrop-filter) which creates
 * a new containing block in Chrome/Safari per CSS spec — `position: fixed`
 * children would otherwise be positioned relative to the nav, not the
 * viewport. The portal lifts the modal out of that scope.
 */
export function ContactModal({ lang, onClose }: { lang: 'de' | 'en'; onClose: () => void }) {
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [phone, setPhone]     = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [hp, setHp]           = useState('')  // Honeypot
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [done, setDone]       = useState(false)
  const [mounted, setMounted] = useState(false)

  // Portal mount-check: warte auf erstes Client-Render damit document.body verfügbar ist
  useEffect(() => { setMounted(true) }, [])

  // Body-scroll-lock während Modal offen ist (sonst kann User hinter dem Modal scrollen)
  useEffect(() => {
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = original }
  }, [])

  const isEn = lang === 'en'

  const valid = name.trim().length >= 2 && email.includes('@') && message.trim().length >= 10

  async function send() {
    if (!valid) {
      setError(isEn ? 'Please fill name, email and message (min. 10 chars).' : 'Bitte Name, E-Mail und Nachricht (min. 10 Zeichen) ausfüllen.')
      return
    }
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          subject: subject.trim() || undefined,
          message: message.trim(),
          hp,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setDone(true)
      setTimeout(onClose, 2200)
    } catch (e) {
      setError(e instanceof Error ? e.message : (isEn ? 'Sending failed' : 'Versand fehlgeschlagen'))
    } finally {
      setBusy(false)
    }
  }

  if (!mounted) return null

  const modalContent = (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm overflow-y-auto"
         style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
         onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl max-h-[100dvh] sm:max-h-[88vh] flex flex-col my-auto"
           onClick={e => e.stopPropagation()}>
        {/* Sticky Header — bleibt sichtbar während User scrollt */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 pt-6 pb-3 border-b border-zinc-100 bg-white rounded-t-2xl">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-500">{isEn ? 'Contact' : 'Kontakt'}</p>
            <h2 className="text-xl font-black text-zinc-950 mt-0.5">{isEn ? 'How can we help?' : 'Wie können wir helfen?'}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy}
            className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 disabled:opacity-50 text-xl leading-none flex-shrink-0">✕</button>
        </div>

        {/* Scrollable body — alles unter dem Sticky-Header scrollt unabhängig */}
        <div className="flex-1 overflow-y-auto">
        {done ? (
          <div className="px-6 py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <p className="font-bold text-zinc-900 text-base">{isEn ? 'Message sent!' : 'Nachricht verschickt!'}</p>
            <p className="text-sm text-zinc-500 mt-1">{isEn ? 'We typically reply within 24 hours.' : 'Wir antworten meist innerhalb 24 Stunden.'}</p>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1">{isEn ? 'Name *' : 'Name *'}</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value.slice(0, 200))}
                  placeholder={isEn ? 'Max Mustermann' : 'Max Mustermann'}
                  className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1">{isEn ? 'Email *' : 'E-Mail *'}</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value.slice(0, 254))}
                  placeholder="max@example.com"
                  className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1">{isEn ? 'Phone (optional)' : 'Telefon (optional)'}</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value.slice(0, 50))}
                  placeholder="+49 …"
                  className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1">{isEn ? 'Subject (optional)' : 'Betreff (optional)'}</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value.slice(0, 200))}
                  placeholder={isEn ? 'Trial / pricing / etc.' : 'Demo / Preise / …'}
                  className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">{isEn ? 'Your message *' : 'Dein Anliegen *'}</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value.slice(0, 10000))}
                rows={5}
                placeholder={isEn ? 'Tell us what you need…' : 'Schreib uns, was du brauchst…'}
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 resize-y"
              />
              <p className="text-[10px] mt-1">
                {message.trim().length > 0 && message.trim().length < 10 ? (
                  <span className="text-amber-600">{isEn ? 'At least 10 characters' : 'Mindestens 10 Zeichen'} · {message.trim().length}/10</span>
                ) : (
                  <span className="text-zinc-400">{message.length}/10.000 {isEn ? 'characters' : 'Zeichen'}</span>
                )}
              </p>
            </div>
            {/* Honeypot — versteckt vor Usern, aber Bots füllen alle Felder */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={hp}
              onChange={e => setHp(e.target.value)}
              style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }}
              aria-hidden="true"
            />
            {error && (
              <div className="text-xs p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">{error}</div>
            )}
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              {isEn
                ? <>Your data is sent to <strong>oss@osss.pro</strong> only — no marketing list, no third parties. <Link href="/datenschutz" className="underline">Privacy policy</Link>.</>
                : <>Deine Angaben gehen nur an <strong>oss@osss.pro</strong> — keine Liste, keine Dritten. <Link href="/datenschutz" className="underline">Datenschutz</Link>.</>}
            </p>
            <div className="flex gap-2 pt-2">
              <button onClick={onClose} disabled={busy}
                className="flex-1 py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50">
                {isEn ? 'Cancel' : 'Abbrechen'}
              </button>
              <button onClick={send} disabled={busy}
                className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-300 disabled:cursor-not-allowed text-zinc-950 font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                {busy ? (
                  <>
                    <span className="w-4 h-4 border-2 border-zinc-700 border-t-transparent rounded-full animate-spin" />
                    {isEn ? 'Sending…' : 'Sende…'}
                  </>
                ) : (
                  isEn ? 'Send message →' : 'Nachricht senden →'
                )}
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
