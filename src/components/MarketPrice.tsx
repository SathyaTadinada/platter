import { ArrowUpRight } from 'lucide-react'
import { useCurrency, usePrice } from '../hooks/prices'
import { formatMoney } from '../lib/value'

// Short grade for labels: "Very Good Plus (VG+)" -> "VG+"
const grade = (condition: string) => condition.match(/\(([^)]+)\)/)?.[1]?.replace(/ or .*/, '') ?? condition

export function MarketPrice({ releaseId, mediaCondition }: { releaseId: number; mediaCondition?: string }) {
  const currency = useCurrency()
  const { price, loading, failed } = usePrice(releaseId, currency)

  if (failed) return <p className="px-1 text-sm text-stone-500">Couldn't load prices.</p>
  if (loading || !price || !currency) {
    return <div className="h-24 animate-pulse rounded-2xl bg-stone-200/60 dark:bg-stone-800/60" aria-label="Loading prices" />
  }

  if (price.blocked) return <p className="px-1 text-sm text-stone-500">This release can't be sold on Discogs.</p>

  const money = (n: number) => formatMoney(n, currency)
  const suggested = mediaCondition ? price.suggested?.[mediaCondition] : undefined
  const rows: [string, string][] = []
  // with every grade on show, the copy's own grade is highlighted there instead
  const ladder = Object.entries(price.suggested ?? {})
  if (suggested !== undefined && ladder.length < 2) rows.push([`Suggested for ${grade(mediaCondition!)}`, money(suggested)])
  if (price.forSale > 0 && price.lowest !== null) {
    rows.push(['Lowest listing', money(price.lowest)])
    rows.push(['For sale', `${price.forSale} cop${price.forSale === 1 ? 'y' : 'ies'}`])
  }
  if (!rows.length && ladder.length < 2) return <p className="px-1 text-sm text-stone-500">Nobody's selling a copy right now.</p>

  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      {ladder.length >= 2 && (
        <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-800">
          <p className="mb-2 text-sm text-stone-600 dark:text-stone-400">Suggested by condition</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {ladder.map(([condition, amount]) => {
              const mine = condition === mediaCondition
              return (
                <div
                  key={condition}
                  className={`rounded-lg px-2 py-1.5 text-center ${mine ? 'bg-accent-100 ring-1 ring-accent-500 dark:bg-accent-500/20' : 'bg-stone-100 dark:bg-stone-800'}`}
                >
                  <p className="text-xs text-stone-500">{grade(condition)}</p>
                  <p className="text-sm font-semibold tabular-nums">{formatMoney(amount, currency, { whole: true })}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
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
          href={`https://www.discogs.com/sell/release/${releaseId}`}
          target="_blank"
          rel="noopener"
          className="flex items-center justify-between border-t border-stone-200 px-4 py-2.5 text-sm font-medium text-accent-700 hover:bg-stone-50 dark:border-stone-800 dark:text-accent-400 dark:hover:bg-stone-800/50"
        >
          See listings on Discogs
          <ArrowUpRight size={16} aria-hidden />
        </a>
      )}
    </div>
  )
}
