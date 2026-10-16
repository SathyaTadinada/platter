import { fieldValueFits } from './csv'
import { fieldFor, type FieldKey, type FieldMatch } from './fields'
import { formatMoney, parseMoney } from './value'

// What the user can fill in when adding a record
export type Metadata = {
  mediaCondition?: string
  sleeveCondition?: string
  price?: string // as typed, e.g. "25" or "24.99"
  store?: string
  date?: string // YYYY-MM-DD
  location?: string
  notes?: string
}

export const hasMetadata = (m: Metadata) => Object.values(m).some((v) => v?.trim())

// Shared batch values first, the record's own values win
export const mergeMetadata = (...layers: (Metadata | undefined)[]): Metadata =>
  Object.assign({}, ...layers.map((l) => Object.fromEntries(Object.entries(l ?? {}).filter(([, v]) => v?.trim()))))

// "24.5" -> "$24.50" in the user's Discogs currency; anything unparseable is kept as typed
export function formatPrice(raw: string | undefined, currency: string, locale?: string): string | undefined {
  const t = raw?.trim()
  if (!t) return undefined
  const n = parseMoney(t)
  return n === undefined ? t : formatMoney(n, currency, { locale })
}

const LABELS: Record<string, string> = {
  mediaCondition: 'Media Condition',
  sleeveCondition: 'Sleeve Condition',
  price: 'Purchase Price',
  store: 'Purchased From',
  date: 'Purchase Date',
  location: 'Location',
  notes: 'Notes',
}

export type FieldPlan = {
  writes: Record<number, string> // field id -> value
  inNotes: string[] // labels that went into Notes because their field is missing
  dropped: string[] // labels that couldn't be saved anywhere
}

// Works out which custom field gets which value. Purchase details and location
// without a field of their own are written into Notes as one readable line.
export function planFieldWrites(meta: Metadata, matches: FieldMatch[], opts: { currency: string; locale?: string }): FieldPlan {
  const plan: FieldPlan = { writes: {}, inNotes: [], dropped: [] }
  const price = formatPrice(meta.price, opts.currency, opts.locale)

  // returns false when there's no field, so the caller can fall back
  const put = (key: FieldKey, label: keyof typeof LABELS, value: string | undefined) => {
    const v = value?.trim()
    if (!v) return true
    const field = fieldFor(matches, key)
    if (!field) return false
    if (fieldValueFits(field, v)) plan.writes[field.id] = v
    else plan.dropped.push(LABELS[label])
    return true
  }

  if (!put('mediaCondition', 'mediaCondition', meta.mediaCondition)) plan.dropped.push(LABELS.mediaCondition)
  if (!put('sleeveCondition', 'sleeveCondition', meta.sleeveCondition)) plan.dropped.push(LABELS.sleeveCondition)

  const loose = {
    price: put('purchasePrice', 'price', price) ? undefined : price,
    store: put('purchasedFrom', 'store', meta.store) ? undefined : meta.store?.trim(),
    date: put('purchaseDate', 'date', meta.date) ? undefined : meta.date?.trim(),
    location: put('location', 'location', meta.location) ? undefined : meta.location?.trim(),
  }

  const bought = [loose.date, loose.store && `from ${loose.store}`, loose.price && `for ${loose.price}`].filter(Boolean)
  const lines = [
    meta.notes?.trim(),
    bought.length ? `Bought ${bought.join(' ')}` : undefined,
    loose.location && `Location: ${loose.location}`,
  ].filter((l): l is string => Boolean(l))
  const moved = (['price', 'store', 'date', 'location'] as const).filter((k) => loose[k]).map((k) => LABELS[k])

  if (lines.length) {
    const notes = fieldFor(matches, 'notes')
    if (notes && fieldValueFits(notes, lines.join('\n'))) {
      plan.writes[notes.id] = lines.join('\n')
      plan.inNotes.push(...moved)
    } else {
      plan.dropped.push(...moved, ...(meta.notes?.trim() ? [LABELS.notes] : []))
    }
  }
  return plan
}
