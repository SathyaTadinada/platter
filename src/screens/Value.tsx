import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { Card, Section, Spinner } from '../components/ui'
import { db } from '../db/db'
import { useCurrency, useFreshPrices } from '../hooks/prices'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { useCollectionMeta } from '../hooks/useCollectionMeta'
import { useFieldMatches } from '../hooks/useFields'
import { fieldFor } from '../lib/fields'
import { recordCollectionValue } from '../lib/pricing'
import { getLayout, subscribeLayout, type SectionKey } from '../lib/statsLayout'
import { change, formatMoney, valueOf } from '../lib/value'
import { RecordRow } from '../components/stats'
import { PriceCoverage } from '../components/PriceCoverage'
import { card, shortDate, type Money, type Valued } from './value/shared'
import { Delta, Chart } from './value/ValueChart'
import { PaidVsNow } from './value/PaidVsNow'
import { Breakdown, GroupTotals } from './value/Breakdowns'
import { Monthly } from './value/Monthly'

const TOP = 10
// The Value view of the Stats tab
export function ValueStats() {
  const { client, username } = useSignedIn()
  const currency = useCurrency()
  const items = useLiveQuery(() => db.collection.toArray(), [])
  const history = useLiveQuery(() => db.valueHistory.orderBy('date').toArray(), [])
  const prices = useFreshPrices(currency)
  const matches = useFieldMatches()
  const current = useAsync(
    () => (currency ? recordCollectionValue(client, username, currency) : Promise.resolve(undefined)),
    [client, username, currency, items?.length],
  )

  const layout = useSyncExternalStore(subscribeLayout, getLayout)
  const paidField = matches ? fieldFor(matches, 'purchasePrice')?.id : undefined
  const mediaField = matches ? fieldFor(matches, 'mediaCondition')?.id : undefined
  const dateField = matches ? fieldFor(matches, 'purchaseDate')?.id : undefined
  const folders = useCollectionMeta().data?.folders ?? []

  const valued = useMemo(() => {
    if (!items || !prices) return []
    return items
      .map((item) => ({ item, value: valueOf(prices.get(item.releaseId), mediaField ? item.fields[mediaField] : undefined) }))
      .filter((v): v is Valued => Boolean(v.value))
      .sort((a, b) => b.value.amount - a.value.amount)
  }, [items, prices, mediaField])

  if (!items || !currency || !prices) return <Spinner />

  const money: Money = (n, whole = false) => formatMoney(n, currency, { whole })
  const series = (history ?? []).filter((h) => h.currency === currency)
  const anySuggested = valued.some((v) => v.value.basis === 'suggested')

  const sections: Record<SectionKey, ReactNode> = {
    overTime: (
      <Section title="Over time">
        <Card>
          {series.length >= 2 ? (
            <Chart series={series} money={(n) => money(n, true)} />
          ) : (
            <p className="text-sm text-stone-500">Platter saves the value each day you open it, so this fills in after a couple of days.</p>
          )}
        </Card>
      </Section>
    ),
    paid: <PaidVsNow items={items} valued={valued} paidField={paidField} money={money} />,
    month: (
      <Section title="By month">
        <Monthly items={items} paidField={paidField} dateField={dateField} money={money} currency={currency} />
      </Section>
    ),
    top: valued.length > 0 && (
      <Section
        title="Most valuable"
        info={
          anySuggested
            ? "Graded copies use Discogs' suggested price for that condition. The rest go by the cheapest copy for sale."
            : "These are the cheapest copies for sale on Discogs. Fill in your seller settings on Discogs to get prices for your copy's condition."
        }
      >
        <ul className={`divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 ${card}`}>
          {valued.slice(0, TOP).map(({ item, value }) => (
            <li key={item.instanceId}>
              <RecordRow item={item}>
                <span className="block text-sm font-semibold tabular-nums">{money(value.amount)}</span>
                {/* only worth saying when the list mixes both kinds */}
                {anySuggested && (
                  <span className="block text-xs text-stone-500">{value.basis === 'suggested' ? 'suggested' : 'lowest listing'}</span>
                )}
              </RecordRow>
            </li>
          ))}
        </ul>
      </Section>
    ),
    price: valued.length > 0 && (
      <Section title="By price">
        <Breakdown valued={valued} money={money} />
      </Section>
    ),
    breakdown: valued.length > 0 && (
      <Section title="Breakdown">
        <GroupTotals valued={valued} folders={folders} money={money} />
      </Section>
    ),
  }

  const first = (
    <Section>
      <div className={`${card} p-4`}>
        <p className="text-sm text-stone-500">Estimated value</p>
        {current.data ? (
          <>
            <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums">{current.data.raw.median}</p>
            {/* nothing to say when it hasn't moved */}
            {series.length >= 2 && Math.abs(current.data.snap.median - series[0].median) >= 1 && (
              <div className="mt-2">
                <Delta
                  {...change(series[0].median, current.data.snap.median)}
                  money={(n) => money(n, true)}
                  suffix={`since ${shortDate(series[0])}`}
                />
              </div>
            )}
            <p className="mt-3 text-sm text-stone-500 tabular-nums">
              Low {current.data.raw.minimum} · High {current.data.raw.maximum}
            </p>
          </>
        ) : current.loading ? (
          <p className="mt-1 h-10 w-40 animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800" />
        ) : (
          <p className="mt-1 text-sm">Couldn't get this from Discogs right now.</p>
        )}
      </div>
    </Section>
  )

  return (
    <>
      <PriceCoverage items={items} prices={prices} currency={currency} />
      {/* sections flow down two columns on wide screens, in the order picked in "Choose charts" */}
      <div className="lg:columns-2 lg:gap-x-8 [&>*]:inline-block [&>*]:w-full [&>*]:break-inside-avoid [&>*]:align-top">
        <div>{first}</div>
        {layout.order
          .filter((k) => !layout.hidden.includes(k) && sections[k])
          .map((k) => (
            <div key={k}>{sections[k]}</div>
          ))}
      </div>
      <footer className="mt-2 border-t border-stone-200 pt-4 text-sm dark:border-stone-800">
        <a
          href={`https://www.discogs.com/user/${encodeURIComponent(username)}/collection`}
          target="_blank"
          rel="noopener"
          className="text-stone-500 underline underline-offset-2"
        >
          Data provided by Discogs.
        </a>
      </footer>
    </>
  )
}
