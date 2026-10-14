import type { LibraryItem } from '../db/db'
import { useCurrency, usePrice } from '../hooks/prices'
import { formatMoney } from '../lib/value'

// Short grade for labels: "Very Good Plus (VG+)" -> "VG+"
const grade = (condition: string) => condition.match(/\(([^)]+)\)/)?.[1]?.replace(/ or .*/, '') ?? condition

export function MarketPrice({ item, mediaCondition }: { item: LibraryItem; mediaCondition?: string }) {
  const currency = useCurrency()
  const { price, loading, failed } = usePrice(item.releaseId, currency)

  if (failed) return <p className="px-1 text-sm text-stone-500">Couldn't get prices from Discogs right now.</p>
  if (loading || !price || !currency) {
    return <div className="h-24 animate-pulse rounded-2xl bg-stone-200/60 dark:bg-stone-800/60" aria-label="Loading prices" />
  }

  if (price.blocked) return <p className="px-1 text-sm text-stone-500">Discogs doesn't allow this release to be sold.</p>

  const money = (n: number) => formatMoney(n, currency)
  const suggested = mediaCondition ? price.suggested?.[mediaCondition] : undefined
  const rows: [string, string][] = []
  if (suggested !== undefined) rows.push([`Suggested for ${grade(mediaCondition!)}`, money(suggested)])
  if (price.forSale > 0 && price.lowest !== null) {
    rows.push(['Lowest listing', money(price.lowest)])
    rows.push(['For sale', `${price.forSale} cop${price.forSale === 1 ? 'y' : 'ies'}`])
  }
  if (!rows.length) return <p className="px-1 text-sm text-stone-500">No copies for sale on Discogs right now.</p>

  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      <dl className="divide-y divide-stone-200 dark:divide-stone-800">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
            <dt className="text-sm text-stone-600 dark:text-stone-400">{label}</dt>
            <dd className="text-sm font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {price.forSale > 0 && (
        <a
          href={`https://www.discogs.com/sell/release/${item.releaseId}`}
          target="_blank"
          rel="noopener"
          className="block border-t border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-800/50"
        >
          See listings on Discogs
        </a>
      )}
    </div>
  )
}
