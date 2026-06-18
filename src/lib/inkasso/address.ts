// Adress-Parser: members.address ist ein Einzel-String, Paywise braucht
// { street, zip, city }. Best-effort für deutsche Adressen — Anker ist die
// 5-stellige PLZ: alles davor = Straße, die 5 Ziffern = PLZ, alles danach = Ort.
// Findet sich keine PLZ, landet alles in `street` (Paywise lehnt das ggf. ab →
// der Owner korrigiert die Mitglieds-Adresse). Pure, unit-testbar.

export interface ParsedAddress {
  street: string
  zip: string
  city: string
}

export function parseGermanAddress(raw: string | null | undefined): ParsedAddress {
  const s = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return { street: '', zip: '', city: '' }
  // "Musterstr. 1, 82276 Adelshofen" | "Hauptstraße 12 10115 Berlin"
  const m = s.match(/^(.*?)[,\s]+(\d{5})\s+(.+)$/)
  if (m) {
    return {
      street: m[1].replace(/,\s*$/, '').trim(),
      zip: m[2],
      city: m[3].trim(),
    }
  }
  return { street: s, zip: '', city: '' }
}
