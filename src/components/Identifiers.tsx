import type { Identifier } from '../api/discogs/types'
import { digitsOnly, formatBarcodeInput } from '../lib/barcode'

// Barcodes first, then runouts, then the rest (label codes, rights societies…)
const ORDER = ['Barcode', 'Matrix / Runout']
const rank = (t: string) => (ORDER.includes(t) ? ORDER.indexOf(t) : ORDER.length)

export function Identifiers({ identifiers }: { identifiers: Identifier[] }) {
  if (!identifiers.length) return <p className="text-sm text-stone-500">Nothing listed on Discogs.</p>
  const sorted = [...identifiers].sort((a, b) => rank(a.type) - rank(b.type))
  return (
    <dl className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
      {sorted.map((id, i) => {
        // spaced barcodes are easier to compare with the one on the sleeve
        const value = id.type === 'Barcode' && /^[\d\s-]+$/.test(id.value) ? formatBarcodeInput(digitsOnly(id.value)) : id.value
        return (
          <div key={i} className="flex items-baseline gap-3 px-4 py-2.5">
            <dt className="w-32 shrink-0 text-sm text-stone-500">
              {id.type}
              {id.description && <span className="block text-xs">{id.description}</span>}
            </dt>
            <dd className="min-w-0 flex-1 text-right font-mono text-sm break-words">{value}</dd>
          </div>
        )
      })}
    </dl>
  )
}
