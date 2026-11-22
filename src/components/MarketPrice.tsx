import { shortGrade } from '../lib/format'
import { ExternalLink as ExternalIcon } from 'lucide-react'
import { useCurrency, usePrice } from '../hooks/prices'
import { formatMoney } from '../lib/value'
import { ExternalLink } from './ui'

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
  const grades = Object.entries(price.suggested ?? {})
  const selling = price.forSale > 0 && price.lowest !== null
  const rows: [string, string][] = selling
    ? [
        ['Lowest listing', money(price.lowest!)],
        ['For sale', `${price.forSale} cop${price.forSale === 1 ? 'y' : 'ies'}`],
      ]
    : [['For sale', 'None right now']]
  // with every grade on show, the copy's own is highlighted there instead
  if (suggested !== undefined && grades.length < 2) rows.push([`Suggested for ${shortGrade(mediaCondition!)}`, money(suggested)])
  // Discogs' API has no sales history, so past sales are a link to Discogs' own page
  if (!selling && grades.length < 2 && suggested === undefined)
    return (
      <p className="px-1 text-sm text-stone-500">
        Nobody's selling a copy right now.{' '}
        <ExternalLink href={`https://www.discogs.com/sell/history/${releaseId}`} className="whitespace-nowrap">
          Sales history on Discogs
        </ExternalLink>
      </p>
    )

  return (
    <div className="divide-y divide-stone-200 overflow-clip rounded-2xl bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
      <dl className="divide-y divide-stone-200 dark:divide-stone-800">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
            <dt className="text-sm text-stone-600 dark:text-stone-400">{label}</dt>
            <dd className="text-sm font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <a
        href={`https://www.discogs.com/sell/${selling ? 'release' : 'history'}/${releaseId}`}
        target="_blank"
        rel="noopener"
        className="flex items-center justify-between px-4 py-2.5 text-sm font-medium text-accent hover:bg-stone-50 dark:hover:bg-stone-800/50"
      >
        {selling ? 'See listings on Discogs' : 'Sales history on Discogs'}
        <ExternalIcon size={16} aria-hidden />
      </a>
      {grades.length >= 2 && (
        <div className="px-4 py-3">
          <p className="mb-2 text-sm text-stone-600 dark:text-stone-400">Suggested prices</p>
          {/* one row from sm up, two on phones */}
          <div className="grid grid-cols-4 gap-1.5 sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none">
            {grades.map(([condition, amount]) => {
              const mine = condition === mediaCondition
              return (
                <div
                  key={condition}
                  className={`min-w-0 rounded-lg px-1 py-1.5 text-center ${mine ? 'bg-accent-100 ring-1 ring-accent dark:bg-accent/20' : 'bg-stone-100 dark:bg-stone-800'}`}
                >
                  <p className="text-xs text-stone-500">{shortGrade(condition)}</p>
                  <p className="truncate text-sm font-semibold tabular-nums">{formatMoney(amount, currency, { whole: true })}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
