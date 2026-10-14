import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { Link } from 'wouter'
import { Button, Card, Notice, Screen, Section, Spinner } from '../components/ui'
import { db, type LibraryItem } from '../db/db'
import { checkPrices, stopPriceCheck, useCurrency, useFreshPrices, usePriceCheck } from '../hooks/prices'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { useFieldMatches } from '../hooks/useFields'
import { fieldFor } from '../lib/fields'
import { backgroundGapMs, recordCollectionValue } from '../lib/pricing'
import { chartPaths, formatMoney, paidTotal, parseMoney, valueOf, type RecordValue, type ValueSnapshot } from '../lib/value'
import { Cover } from './Collection'

const TOP = 10

export function Value() {
  const { client, username } = useSignedIn()
  const currency = useCurrency()
  const items = useLiveQuery(() => db.collection.toArray(), [])
  const history = useLiveQuery(() => db.valueHistory.orderBy('date').toArray(), [])
  const prices = useFreshPrices(currency)
  const check = usePriceCheck()
  const matches = useFieldMatches()
  const current = useAsync(
    () => (currency ? recordCollectionValue(client, username, currency) : Promise.resolve(undefined)),
    [client, username, currency],
  )

  const paidField = matches ? fieldFor(matches, 'purchasePrice')?.id : undefined
  const mediaField = matches ? fieldFor(matches, 'mediaCondition')?.id : undefined

  const valued = useMemo(() => {
    if (!items || !prices) return []
    return items
      .map((item) => ({ item, value: valueOf(prices.get(item.releaseId), mediaField ? item.fields[mediaField] : undefined) }))
      .filter((v): v is { item: LibraryItem; value: RecordValue } => Boolean(v.value))
      .sort((a, b) => b.value.amount - a.value.amount)
  }, [items, prices, mediaField])

  if (!items || !currency || !prices) return <Spinner />

  const money = (n: number, whole = false) => formatMoney(n, currency, { whole })
  const releaseIds = items.map((i) => i.releaseId)
  const priced = new Set(releaseIds.filter((id) => prices.has(id))).size
  const distinct = new Set(releaseIds).size
  const series = (history ?? []).filter((h) => h.currency === currency)
  const anySuggested = valued.some((v) => v.value.basis === 'suggested')

  // what was paid, and what the same records go for now
  const paid = paidTotal(items, paidField)
  const paidAndPriced = paidField === undefined ? [] : valued.filter((v) => parseMoney(v.item.fields[paidField]) !== undefined)
  const paidSubset = paidTotal(
    paidAndPriced.map((v) => v.item),
    paidField,
  )
  const worthSubset = paidAndPriced.reduce((n, v) => n + v.value.amount, 0)

  return (
    <Screen title="Value" back="/" width="wide">
      <div className="lg:grid lg:grid-cols-2 lg:gap-x-8">
        <div>
          <Section>
            <Card>
              <p className="text-sm text-stone-500">Estimated value</p>
              {current.data ? (
                <>
                  <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums">{current.data.raw.median}</p>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                    Low {current.data.raw.minimum} · High {current.data.raw.maximum}
                  </p>
                </>
              ) : current.loading ? (
                <p className="mt-1 h-10 w-40 animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800" />
              ) : (
                <p className="mt-1 text-sm">Couldn't get this from Discogs right now.</p>
              )}
              <p className="mt-3 text-xs text-stone-500">
                From recent sales on Discogs.{' '}
                <a
                  href={`https://www.discogs.com/user/${encodeURIComponent(username)}/collection`}
                  target="_blank"
                  rel="noopener"
                  className="underline underline-offset-2"
                >
                  Data provided by Discogs.
                </a>
              </p>
            </Card>
          </Section>

          <Section title="Over time">
            <Card>
              {series.length >= 2 ? (
                <Chart series={series} money={(n) => money(n, true)} />
              ) : (
                <p className="text-sm text-stone-500">Platter notes the value once a day. The chart starts after the second day.</p>
              )}
            </Card>
          </Section>

          {paid.count > 0 && (
            <Section title="What you paid">
              <Card>
                <p className="text-2xl font-bold tabular-nums">{money(paid.total)}</p>
                <p className="text-sm text-stone-500">
                  for {paid.count} record{paid.count === 1 ? '' : 's'} with a purchase price
                </p>
                {paidAndPriced.length > 0 && (
                  <p className="mt-3 text-sm">
                    {paidAndPriced.length === paid.count
                      ? `They'd go for about ${money(worthSubset)} now.`
                      : `${paidAndPriced.length} of them have current prices: ${money(paidSubset.total)} paid, about ${money(worthSubset)} now.`}
                  </p>
                )}
              </Card>
            </Section>
          )}
        </div>

        <div>
          <Section title="Most valuable">
            <PriceCheckStatus
              priced={priced}
              total={distinct}
              check={check}
              onStart={() => checkPrices(client, releaseIds, currency)}
              gapMs={backgroundGapMs(client)}
            />
            {valued.length > 0 && (
              <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
                {valued.slice(0, TOP).map(({ item, value }) => (
                  <li key={item.instanceId}>
                    <Link
                      href={`/collection/${item.instanceId}`}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-stone-50 dark:hover:bg-stone-800/50"
                    >
                      <Cover item={item} small className="size-11 shrink-0 rounded-md" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        <span className="block truncate text-xs text-stone-500">{item.artist}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums">{money(value.amount)}</span>
                        {/* only worth saying when the list mixes both kinds */}
                        {anySuggested && (
                          <span className="block text-xs text-stone-500">
                            {value.basis === 'suggested' ? 'suggested' : 'lowest listing'}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {valued.length > 0 && (
              <p className="px-1 text-xs text-stone-500">
                {anySuggested
                  ? "Suggested prices are Discogs' estimate for your copy's media condition. Records without a grade show the cheapest copy for sale."
                  : 'This is the cheapest copy for sale right now, which may be in worse shape than yours. Fill in your seller settings on Discogs to get suggested prices by condition instead.'}
              </p>
            )}
          </Section>
        </div>
      </div>
    </Screen>
  )
}

function PriceCheckStatus({
  priced,
  total,
  check,
  onStart,
  gapMs,
}: {
  priced: number
  total: number
  gapMs: number
  check: ReturnType<typeof usePriceCheck>
  onStart: () => void
}) {
  if (check.running) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-stone-100 px-4 py-3 dark:bg-stone-900">
        <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent text-stone-500" />
        <p className="min-w-0 flex-1 text-sm tabular-nums">
          Checking prices · {check.done} of {check.total}
        </p>
        <button type="button" onClick={stopPriceCheck} className="text-sm font-medium text-stone-600 dark:text-stone-300">
          Stop
        </button>
      </div>
    )
  }
  const minutes = Math.max(1, Math.round(((total - priced) * gapMs) / 60_000))
  return (
    <div className="space-y-3">
      {check.error && <Notice tone="error">Price check stopped: {check.error}</Notice>}
      {priced >= total ? (
        <p className="px-1 text-sm text-stone-500">All {total} releases priced in the last six hours.</p>
      ) : (
        <Card className="space-y-3">
          <p className="text-sm">
            {priced
              ? `${priced} of ${total} releases have prices. They're good for six hours.`
              : `Prices come from the Discogs marketplace, one release at a time. For your collection that's about ${minutes} minute${minutes === 1 ? '' : 's'}, and you can keep using the app meanwhile.`}
          </p>
          <Button variant="secondary" className="w-full" onClick={onStart}>
            {priced ? 'Check the rest' : 'Check prices'}
          </Button>
        </Card>
      )}
    </div>
  )
}

function Chart({ series, money }: { series: ValueSnapshot[]; money: (n: number) => string }) {
  const W = 320
  const H = 140
  const paths = chartPaths(series, W, H)!
  const first = series[0]
  const last = series.at(-1)!
  const day = (s: ValueSnapshot) => new Date(`${s.date}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const change = last.median - first.median
  return (
    <figure>
      <figcaption className="mb-3 text-sm">
        <span className="font-semibold tabular-nums">
          {change >= 0 ? '+' : '−'}
          {money(Math.abs(change))}
        </span>{' '}
        <span className="text-stone-500">since {day(first)}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-36 w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        aria-label="Collection value over time"
      >
        <path d={paths.area} className="fill-accent-500/10" />
        <path
          d={paths.line}
          className="fill-none stroke-accent-500"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-stone-500">
        <span>{day(first)}</span>
        <span>{day(last)}</span>
      </div>
    </figure>
  )
}
