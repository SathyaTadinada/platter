import { useLiveQuery } from 'dexie-react-hooks'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'wouter'
import { Card, Screen, Section, Spinner } from '../components/ui'
import type { Folder } from '../api/discogs/types'
import { db, type LibraryItem } from '../db/db'
import { useCurrency, useFreshPrices } from '../hooks/prices'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { useCollectionMeta } from '../hooks/useCollectionMeta'
import { useFieldMatches } from '../hooks/useFields'
import { fieldFor } from '../lib/fields'
import { recordCollectionValue } from '../lib/pricing'
import {
  byMonth,
  change,
  chartPaths,
  distribution,
  formatMoney,
  paidTotal,
  parseMoney,
  totalsBy,
  valueOf,
  type RecordValue,
  type ValueSnapshot,
} from '../lib/value'
import { Cover, PriceCoverage } from './Collection'

const TOP = 10
const card = 'rounded-2xl bg-white ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800'
const up = 'text-emerald-600 dark:text-emerald-400'
const down = 'text-red-600 dark:text-red-400'

type Valued = { item: LibraryItem; value: RecordValue }
type Money = (n: number, whole?: boolean) => string

export function Value() {
  const { client, username } = useSignedIn()
  const currency = useCurrency()
  const items = useLiveQuery(() => db.collection.toArray(), [])
  const history = useLiveQuery(() => db.valueHistory.orderBy('date').toArray(), [])
  const prices = useFreshPrices(currency)
  const matches = useFieldMatches()
  const current = useAsync(
    () => (currency ? recordCollectionValue(client, username, currency) : Promise.resolve(undefined)),
    [client, username, currency],
  )

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

  return (
    <Screen title="Value" width="wide">
      <PriceCoverage items={items} prices={prices} currency={currency} />
      <div className="lg:grid lg:grid-cols-2 lg:gap-x-8">
        <div>
          <Section>
            <div className={`${card} p-4`}>
              <p className="text-sm text-stone-500">Estimated value</p>
              {current.data ? (
                <>
                  <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums">{current.data.raw.median}</p>
                  {series.length >= 2 && (
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

          <Section title="Over time">
            <Card>
              {series.length >= 2 ? (
                <Chart series={series} money={(n) => money(n, true)} />
              ) : (
                <p className="text-sm text-stone-500">Check back in a couple of days. Platter saves the value once a day to draw this.</p>
              )}
            </Card>
          </Section>

          <PaidVsNow items={items} valued={valued} paidField={paidField} money={money} />

          <Section title="By month">
            <Monthly items={items} paidField={paidField} dateField={dateField} money={money} />
          </Section>
        </div>

        <div>
          {valued.length > 0 && (
            <>
              <Section title="Most valuable">
                <ul className={`divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 ${card}`}>
                  {valued.slice(0, TOP).map(({ item, value }) => (
                    <li key={item.instanceId}>
                      <RecordRow item={item}>
                        <span className="block text-sm font-semibold tabular-nums">{money(value.amount)}</span>
                        {/* only worth saying when the list mixes both kinds */}
                        {anySuggested && (
                          <span className="block text-xs text-stone-500">
                            {value.basis === 'suggested' ? 'suggested' : 'lowest listing'}
                          </span>
                        )}
                      </RecordRow>
                    </li>
                  ))}
                </ul>
                <p className="px-1 text-xs text-stone-500">
                  {anySuggested
                    ? "Prices are Discogs' suggestion for each copy's condition, or the cheapest listing if the copy isn't graded."
                    : "These are the cheapest listings, which can be in worse shape than yours. Fill in your seller settings on Discogs and you'll get suggested prices by condition instead."}
                </p>
              </Section>

              <Section title="By price">
                <Breakdown valued={valued} money={money} />
              </Section>

              <Section title="Where the value is">
                <GroupTotals valued={valued} folders={folders} money={money} />
              </Section>
            </>
          )}
        </div>
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
    </Screen>
  )
}

const pct = (n: number, of: number) => `${of > 0 ? Math.max(2, (n / of) * 100) : 0}%`
const shortDate = (s: ValueSnapshot) => new Date(`${s.date}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

function Delta({ abs, pct: ratio, money, suffix }: { abs: number; pct?: number; money: (n: number) => string; suffix?: string }) {
  const rising = abs >= 0
  const Icon = rising ? TrendingUp : TrendingDown
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold whitespace-nowrap tabular-nums ${
          rising ? 'bg-emerald-500/15 ' + up : 'bg-red-500/15 ' + down
        }`}
      >
        <Icon size={14} aria-hidden />
        {rising ? '+' : '−'}
        {money(Math.abs(abs))}
        {ratio !== undefined && <span className="font-medium opacity-80">· {Math.abs(Math.round(ratio * 100))}%</span>}
      </span>
      {suffix && <span className="text-stone-500">{suffix}</span>}
    </span>
  )
}

function Chart({ series, money }: { series: ValueSnapshot[]; money: (n: number) => string }) {
  const W = 320
  const H = 140
  const paths = chartPaths(series, W, H)!
  const [hover, setHover] = useState<number | null>(null)
  const first = series[0]
  const shown = series[hover ?? series.length - 1]
  const rising = series.at(-1)!.median >= first.median
  const color = rising ? 'emerald' : 'red'
  const point = hover !== null ? paths.points[hover] : null

  function scrub(e: React.PointerEvent) {
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    let best = 0
    paths.points.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs(paths.points[best].x - x)) best = i
    })
    setHover(best)
  }

  return (
    <figure>
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span>
          <span className="text-xl font-bold tabular-nums">{money(shown.median)}</span>{' '}
          <span className="text-sm text-stone-500">{hover === null ? 'today' : shortDate(shown)}</span>
        </span>
        {/* the card above already shows the overall change */}
        {hover !== null && <Delta {...change(first.median, shown.median)} money={money} suffix={`since ${shortDate(first)}`} />}
      </figcaption>
      <div className="relative touch-pan-y" onPointerMove={scrub} onPointerDown={scrub} onPointerLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-40 w-full overflow-visible"
          preserveAspectRatio="none"
          role="img"
          aria-label="Collection value over time"
        >
          <defs>
            <linearGradient id="value-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" className={rising ? 'text-emerald-500' : 'text-red-500'} stopColor="currentColor" stopOpacity={0.25} />
              <stop offset="100%" className={rising ? 'text-emerald-500' : 'text-red-500'} stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={paths.area} fill="url(#value-fill)" />
          <path
            d={paths.line}
            className={`fill-none ${color === 'emerald' ? 'stroke-emerald-500' : 'stroke-red-500'}`}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        </svg>
        {point && (
          <>
            <span
              className="pointer-events-none absolute inset-y-0 w-px bg-stone-300 dark:bg-stone-700"
              style={{ left: `${(point.x / W) * 100}%` }}
            />
            <span
              className={`pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white dark:border-stone-900 ${
                rising ? 'bg-emerald-500' : 'bg-red-500'
              }`}
              style={{ left: `${(point.x / W) * 100}%`, top: `${(point.y / H) * 100}%` }}
            />
          </>
        )}
      </div>
      <div className="mt-1 flex justify-between text-xs text-stone-500">
        <span>{shortDate(first)}</span>
        <span>{shortDate(series.at(-1)!)}</span>
      </div>
    </figure>
  )
}

function PaidVsNow({ items, valued, paidField, money }: { items: LibraryItem[]; valued: Valued[]; paidField?: number; money: Money }) {
  const paid = paidTotal(items, paidField)
  if (!paid.count || paidField === undefined) return null

  const rows = valued
    .map((v) => ({ ...v, paid: parseMoney(v.item.fields[paidField]) }))
    .filter((v): v is Valued & { paid: number } => v.paid !== undefined)
    .map((v) => ({ ...v, diff: v.value.amount - v.paid }))
  const spent = rows.reduce((n, r) => n + r.paid, 0)
  const worth = rows.reduce((n, r) => n + r.value.amount, 0)
  const gains = rows.filter((r) => r.diff > 0).sort((a, b) => b.diff - a.diff)
  const losses = rows.filter((r) => r.diff < 0).sort((a, b) => a.diff - b.diff)
  const most = Math.max(spent, worth)
  const rising = worth >= spent

  return (
    <Section title="Paid vs now">
      <Card>
        {rows.length ? (
          <>
            <Delta {...change(spent, worth)} money={money} />
            {rows.length < paid.count && (
              <p className="mt-2 text-sm text-stone-500">
                {rows.length} of {paid.count} records so far
              </p>
            )}
            <div className="mt-4 space-y-2.5">
              <BarLine label="Paid" amount={money(spent)} width={pct(spent, most)} className="bg-stone-400 dark:bg-stone-600" />
              <BarLine label="Now" amount={money(worth)} width={pct(worth, most)} className={rising ? 'bg-emerald-500' : 'bg-red-500'} />
            </div>
          </>
        ) : (
          <>
            <p className="text-2xl font-bold tabular-nums">{money(paid.total)}</p>
            <p className="text-sm text-stone-500">
              paid for {paid.count} record{paid.count === 1 ? '' : 's'}. Current prices show up here once they're in.
            </p>
          </>
        )}
      </Card>
      {gains.length > 0 && <Movers title="Biggest gains" rows={gains.slice(0, 3)} money={money} />}
      {losses.length > 0 && <Movers title="Biggest drops" rows={losses.slice(0, 3)} money={money} />}
    </Section>
  )
}

function BarLine({ label, amount, width, className }: { label: string; amount: string; width: string; className: string }) {
  return (
    <div className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 text-sm">
      <span className="text-stone-500">{label}</span>
      <span className="h-3 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
        <span className={`block h-full rounded-full ${className}`} style={{ width }} />
      </span>
      <span className="font-medium tabular-nums">{amount}</span>
    </div>
  )
}

function Movers({ title, rows, money }: { title: string; rows: (Valued & { paid: number; diff: number })[]; money: Money }) {
  return (
    <div className={`overflow-hidden ${card}`}>
      <p className="px-4 pt-3 pb-1 text-xs font-semibold text-stone-500">{title}</p>
      <ul className="divide-y divide-stone-200 dark:divide-stone-800">
        {rows.map((r) => (
          <li key={r.item.instanceId}>
            <RecordRow item={r.item} detail={`${money(r.paid)} → ${money(r.value.amount)}`}>
              <span className={`text-sm font-semibold tabular-nums ${r.diff >= 0 ? up : down}`}>
                {r.diff >= 0 ? '+' : '−'}
                {money(Math.abs(r.diff))}
              </span>
            </RecordRow>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RecordRow({ item, detail, children }: { item: LibraryItem; detail?: string; children: ReactNode }) {
  return (
    <Link
      href={`/collection/${item.instanceId}`}
      className="flex items-center gap-3 px-3 py-2 hover:bg-stone-50 dark:hover:bg-stone-800/50"
    >
      <Cover item={item} small className="size-11 shrink-0 rounded-md" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        <span className="block truncate text-xs text-stone-500">{detail ?? item.artist}</span>
      </span>
      <span className="shrink-0 text-right">{children}</span>
    </Link>
  )
}

// Records per price range, with what each range adds up to
function Breakdown({ valued, money }: { valued: Valued[]; money: Money }) {
  const buckets = distribution(
    valued.map((v) => v.value.amount),
    (n) => money(n, true),
  )
  const most = Math.max(...buckets.map((b) => b.count))
  return (
    <Card>
      <div className="flex h-36 items-end gap-2">
        {buckets.map((b) => (
          <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs font-semibold tabular-nums">{b.count || ''}</span>
            <span className="w-full rounded-t-lg bg-accent-500/80" style={{ height: b.count ? pct(b.count, most) : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2 border-t border-stone-200 pt-1.5 dark:border-stone-800">
        {buckets.map((b) => (
          <div key={b.label} className="flex-1 text-center">
            <p className="text-[0.6875rem] leading-tight text-stone-500">{b.label}</p>
            <p className="text-[0.6875rem] font-medium tabular-nums">{b.count ? money(b.total, true) : ''}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

function BarList({ rows }: { rows: { label: string; amount: number; text: string }[] }) {
  const most = Math.max(...rows.map((r) => r.amount))
  return (
    <Card className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="text-sm">
          <div className="mb-1 flex justify-between gap-3">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{r.text}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
            <div className="h-full rounded-full bg-accent-500" style={{ width: pct(r.amount, most) }} />
          </div>
        </div>
      ))}
    </Card>
  )
}

function Toggle<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="mb-4 inline-flex gap-1 rounded-lg bg-stone-100 p-0.5 dark:bg-stone-800">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
            value === v ? 'bg-white shadow-sm dark:bg-stone-950' : 'text-stone-600 dark:text-stone-400'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

type Grouping = 'genre' | 'decade' | 'crate'

function GroupTotals({ valued, folders, money }: { valued: Valued[]; folders: Folder[]; money: Money }) {
  const [by, setBy] = useState<Grouping>('genre')
  const crate = new Map(folders.map((f) => [f.id, f.name]))
  const keys: Record<Grouping, (i: LibraryItem) => string[]> = {
    genre: (i) => (i.genres.length ? i.genres : ['No genre']),
    decade: (i) => [i.year ? `${Math.floor(i.year / 10) * 10}s` : 'Unknown'],
    crate: (i) => [crate.get(i.folderId) ?? 'Uncategorized'],
  }
  const rows = totalsBy(
    valued.map((v) => ({ row: v.item, amount: v.value.amount })),
    keys[by],
  )
  return (
    <Card>
      <Toggle
        options={[
          ['genre', 'Genre'],
          ['decade', 'Decade'],
          ['crate', 'Crate'],
        ]}
        value={by}
        onChange={setBy}
      />
      <BarList rows={rows.map((g) => ({ label: g.label, amount: g.total, text: money(g.total, true) }))} />
    </Card>
  )
}

// Money spent (purchase price by purchase date, or date added) or records added, per month
function Monthly({ items, paidField, dateField, money }: { items: LibraryItem[]; paidField?: number; dateField?: number; money: Money }) {
  const canSpend = paidField !== undefined
  const [show, setShow] = useState<'spent' | 'added'>(canSpend ? 'spent' : 'added')
  const rows =
    show === 'spent' && paidField !== undefined
      ? items.flatMap((i) => {
          const amount = parseMoney(i.fields[paidField])
          const date = (dateField !== undefined && i.fields[dateField]) || i.dateAdded
          return amount !== undefined ? [{ date, amount }] : []
        })
      : items.map((i) => ({ date: i.dateAdded, amount: 1 }))
  const months = byMonth(rows, 12)
  const most = Math.max(...months.map((m) => m.total))
  const sum = months.reduce((n, m) => n + m.total, 0)
  const text = (n: number) => (show === 'spent' ? money(n, true) : String(n))
  return (
    <Card>
      {canSpend && (
        <Toggle
          options={[
            ['spent', 'Spent'],
            ['added', 'Records added'],
          ]}
          value={show}
          onChange={setShow}
        />
      )}
      <p className="mb-3 text-sm">
        <span className="text-xl font-bold tabular-nums">{text(sum)}</span>{' '}
        <span className="text-stone-500">{show === 'spent' ? 'spent' : 'added'} in the last 12 months</span>
      </p>
      <div className="flex h-28 items-end gap-1">
        {months.map((m) => (
          <div key={m.month} className="group flex h-full flex-1 flex-col justify-end" title={`${m.label}: ${text(m.total)}`}>
            <span
              className="w-full rounded-t-md bg-accent-500/80 group-hover:bg-accent-500"
              style={{ height: m.total ? pct(m.total, most) : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 border-t border-stone-200 pt-1 dark:border-stone-800">
        {months.map((m, i) => (
          <span key={m.month} className="flex-1 text-center text-[0.625rem] text-stone-500">
            {i % 2 === 1 ? m.label : ''}
          </span>
        ))}
      </div>
    </Card>
  )
}
