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
  const points = values.map((v, i) => ({ x: x(i), y: y(v) }))
  const line = `M${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')}`
  const area = `${line} L${x(values.length - 1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z`
  return { line, area, points }
}

// Change between two amounts; pct is undefined when starting from zero
export function change(from: number, to: number) {
  const abs = to - from
  return { abs, pct: from ? abs / from : undefined }
}

export type Bucket = { label: string; count: number; total: number }

// How many records fall in each price range, and what they add up to. Cheapest first.
export function distribution(amounts: number[], money: (n: number) => string): Bucket[] {
  const ranges: [number, number, string][] = [
    [0, 10, `Under ${money(10)}`],
    [10, 20, `${money(10)}–${money(20)}`],
    [20, 50, `${money(20)}–${money(50)}`],
    [50, 100, `${money(50)}–${money(100)}`],
    [100, Infinity, `${money(100)}+`],
  ]
  return ranges.map(([lo, hi, label]) => {
    const inRange = amounts.filter((a) => a >= lo && a < hi)
    return { label, count: inRange.length, total: inRange.reduce((n, a) => n + a, 0) }
  })
}

// Totals per group (genre, decade…), biggest first, with the rest folded into "Other"
export function totalsBy<T>(rows: { row: T; amount: number }[], keys: (row: T) => string[], top = 6) {
  const totals = new Map<string, number>()
  for (const { row, amount } of rows) {
    const ks = keys(row)
    // a record with two genres counts half toward each, so the bars still add up
    for (const k of ks) totals.set(k, (totals.get(k) ?? 0) + amount / ks.length)
  }
  const sorted = [...totals.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total)
  if (sorted.length <= top) return sorted
  const rest = sorted.slice(top - 1).reduce((n, g) => n + g.total, 0)
  return [...sorted.slice(0, top - 1), { label: 'Other', total: rest }]
}

export type MonthTotal = { month: string; label: string; total: number }

// Totals for each of the last `months` months (oldest first), empty months included.
// Dates are YYYY-MM-DD or ISO strings; anything older or unparseable is skipped.
export function byMonth(rows: { date: string; amount: number }[], months = 12, now = new Date()): MonthTotal[] {
  const out: MonthTotal[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    out.push({ month, label: d.toLocaleDateString(undefined, { month: 'short' }), total: 0 })
  }
  const index = new Map(out.map((m, i) => [m.month, i]))
  for (const r of rows) {
    const i = index.get(r.date.slice(0, 7))
    if (i !== undefined) out[i].total += r.amount
  }
  return out
}
