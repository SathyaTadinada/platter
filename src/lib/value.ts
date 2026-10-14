import { DISCOGS_MAX_AGE } from '../db/cache'

// What Discogs' marketplace says about one release, in the user's currency
export type PriceEntry = {
  releaseId: number
  at: number
  currency: string
  lowest: number | null // cheapest listing right now
  forSale: number
  blocked?: boolean // Discogs doesn't allow this release to be sold
  suggested?: Record<string, number> // by media condition; only for accounts with seller settings
}

// The collection's estimated value on one day
export type ValueSnapshot = {
  date: string // YYYY-MM-DD, local
  at: number
  currency: string
  min: number
  median: number
  max: number
  count: number
}

export type RecordValue = { amount: number; basis: 'suggested' | 'lowest' }

// Prices fall under the same 6 hour rule as everything else from Discogs
export const isFresh = (p: Pick<PriceEntry, 'at' | 'currency'>, currency: string, now = Date.now()) =>
  p.currency === currency && now - p.at < DISCOGS_MAX_AGE

// "$1,546.30", "€1.546,30", "1 546,30 kr" -> 1546.3
export function parseMoney(s: string | undefined): number | undefined {
  if (!s) return undefined
  let t = s.replace(/[^\d.,-]/g, '')
  if (!/\d/.test(t)) return undefined
  const lastDot = t.lastIndexOf('.')
  const lastComma = t.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    // whichever comes last is the decimal point
    t = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  } else if (lastComma >= 0) {
    // a lone comma with one or two digits after it is a decimal comma; otherwise thousands
    t = /,\d{1,2}$/.test(t) && t.indexOf(',') === lastComma ? t.replace(',', '.') : t.replace(/,/g, '')
  } else if (lastDot >= 0 && t.indexOf('.') !== lastDot) {
    t = t.replace(/\.(?=.*\.)/g, '') // 1.234.567 or 1.234.56: only the last dot can be decimal
    if (/\.\d{3}$/.test(t)) t = t.replace('.', '')
  }
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

// The suggested price for the copy's grade when there is one, otherwise the cheapest listing
export function valueOf(p: PriceEntry | undefined, mediaCondition?: string): RecordValue | undefined {
  if (!p) return undefined
  const s = mediaCondition ? p.suggested?.[mediaCondition] : undefined
  if (s !== undefined) return { amount: s, basis: 'suggested' }
  if (p.lowest !== null) return { amount: p.lowest, basis: 'lowest' }
}

export function formatMoney(n: number, currency: string, opts: { whole?: boolean; locale?: string } = {}): string {
  try {
    return new Intl.NumberFormat(opts.locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: opts.whole ? 0 : 2,
      minimumFractionDigits: opts.whole ? 0 : undefined,
    }).format(n)
  } catch {
    return `${n.toFixed(opts.whole ? 0 : 2)} ${currency}`
  }
}

// Section headings when the collection is sorted by value
const BRACKETS: [number, number][] = [
  [50, 100],
  [20, 50],
  [10, 20],
]
export function valueBracket(amount: number | undefined, money: (n: number) => string): string {
  if (amount === undefined) return 'No price yet'
  if (amount >= 100) return `${money(100)} and up`
  for (const [lo, hi] of BRACKETS) if (amount >= lo) return `${money(lo)} to ${money(hi)}`
  return `Under ${money(10)}`
}

// Adds a day's reading, replacing an earlier one from the same day
export function upsertDaily(history: ValueSnapshot[], snap: ValueSnapshot): ValueSnapshot[] {
  return [...history.filter((h) => h.date !== snap.date), snap].sort((a, b) => a.date.localeCompare(b.date))
}

export const localDate = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Total of what was typed into the purchase price field
export function paidTotal(items: { fields: Record<number, string> }[], fieldId: number | undefined) {
  let total = 0
  let count = 0
  if (fieldId === undefined) return { total, count }
  for (const i of items) {
    const n = parseMoney(i.fields[fieldId])
    if (n !== undefined && n >= 0) {
      total += n
      count++
    }
  }
  return { total, count }
}

// SVG paths for the value chart: the median as a line with a filled area under it,
// scaled to w x h. Points are spaced by date, so gaps between readings show as time.
export function chartPaths(history: ValueSnapshot[], w: number, h: number, pad = 4) {
  if (history.length < 2) return null
  const t = history.map((s) => Date.parse(s.date))
  const t0 = t[0]
  const span = t.at(-1)! - t0 || 1
  const values = history.map((s) => s.median)
  // a bit of room above and below so small changes don't fill the whole height
  const spread = Math.max(...values) - Math.min(...values) || Math.max(...values) * 0.05 || 1
  const lo = Math.min(...values) - spread * 0.25
  const hi = Math.max(...values) + spread * 0.25
  const x = (i: number) => pad + ((t[i] - t0) / span) * (w - pad * 2)
  const y = (v: number) => h - pad - ((v - lo) / (hi - lo)) * (h - pad * 2)
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const line = `M${points.join(' L')}`
  const area = `${line} L${x(values.length - 1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z`
  return { line, area }
}
