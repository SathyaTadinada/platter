import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Share } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'wouter'
import { Cover } from '../components/Cover'
import { formatDay } from '../components/DateInput'
import { MonthBars, RecordRow, statCard } from '../components/stats'
import { ShareSheet } from '../components/ShareSheet'
import { Card, IconButton, Screen, Section, Spinner } from '../components/ui'
import { db, type LibraryItem } from '../db/db'
import { useCurrency } from '../hooks/prices'
import { useSignedIn } from '../hooks/session'
import { useFieldMatches } from '../hooks/useFields'
import { fieldFor } from '../lib/fields'
import { libraryItems } from '../lib/masters'
import { replaceAddress } from '../lib/nav'
import { formatMoney, localDate } from '../lib/value'
import { reviewYears, yearCard, yearReview, type YearReview } from '../lib/yearReview'

const COVERS = 12
const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

export function YourYear({ year: asked }: { year?: string }) {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(Number(asked) || thisYear)
  const { username } = useSignedIn()
  const currency = useCurrency()
  const matches = useFieldMatches()
  const [sharing, setSharing] = useState(false)
  const data = useLiveQuery(async () => {
    const [items, plays, lengths] = await Promise.all([libraryItems(), db.plays.toArray(), db.lengths.toArray()])
    return { items, plays, lengths: new Map(lengths.map((l) => [l.releaseId, l])) }
  }, [])

  const paid = matches ? fieldFor(matches, 'purchasePrice')?.id : undefined
  const date = matches ? fieldFor(matches, 'purchaseDate')?.id : undefined
  const r = useMemo(
    () => (data ? yearReview(year, data.items, data.plays, data.lengths, { paid, date }) : undefined),
    [data, year, paid, date],
  )
  const empty = !r || (!r.added.length && !r.plays)
  const card = useMemo(() => {
    if (!r || !currency) return undefined
    const spent = r.spent?.count ? formatMoney(r.spent.total, currency, { whole: true }) : undefined
    return yearCard(username, r, spent)
  }, [r, currency, username])

  const years = data ? reviewYears(data.items, data.plays) : []
  if (!years.includes(thisYear)) years.unshift(thisYear)
  const at = years.indexOf(year)
  // the same page with another year, not a new one for Back to step through
  const go = (y: number) => {
    setYear(y)
    replaceAddress(`/stats/year/${y}`)
  }

  const toolbar = (
    <div className="flex items-center justify-between rounded-xl bg-stone-200 p-1 lg:max-w-[26rem] dark:bg-stone-800">
      <YearButton label="Earlier year" disabled={!data || at < 0 || at >= years.length - 1} onClick={() => go(years[at + 1])}>
        <ChevronLeft size={18} />
      </YearButton>
      <span className="text-sm font-semibold tabular-nums">
        {year}
        {year === thisYear && <span className="font-normal text-stone-500"> so far</span>}
      </span>
      <YearButton label="Later year" disabled={!data || at <= 0} onClick={() => go(years[at - 1])}>
        <ChevronRight size={18} />
      </YearButton>
    </div>
  )

  return (
    <Screen
      title="Your year"
      back="/stats"
      width="wide"
      toolbar={toolbar}
      actions={
        !empty && (
          <IconButton label="Share" onClick={() => setSharing(true)}>
            <Share size={20} />
          </IconButton>
        )
      }
    >
      {!r || !currency ? <Spinner /> : <Review r={r} currency={currency} />}
      {sharing && <ShareSheet card={card} name={`${username}-${year}`} onClose={() => setSharing(false)} />}
    </Screen>
  )
}

function YearButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-9 min-w-11 items-center justify-center rounded-lg hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-stone-950"
    >
      {children}
    </button>
  )
}

function Review({ r, currency }: { r: YearReview; currency: string }) {
  const { year } = r
  if (!r.added.length && !r.plays) {
    return (
      <Card className="max-w-xl">
        <p className="font-semibold">Nothing in {year} yet</p>
        <p className="mt-1 text-sm text-stone-500">Records you add and plays you log this year show up here.</p>
      </Card>
    )
  }

  const hours = r.hours < 10 ? r.hours.toFixed(1) : Math.round(r.hours).toLocaleString()
  const first = r.added[0]
  const latest = r.added.at(-1)
  const facts = [
    r.decade !== undefined && ['Mostly from', `the ${r.decade}s`],
    r.genres[0] && ['Top genre added', r.genres[0].name],
    first && ['First in', first, first.dateAdded],
    latest && latest !== first && ['Latest', latest, latest.dateAdded],
  ].filter(Boolean) as ([string, string] | [string, LibraryItem, string])[]

  return (
    <div>
      <div>
        <Section>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label={r.added.length === 1 ? 'record added' : 'records added'} value={r.added.length.toLocaleString()} />
            <Tile label={r.plays === 1 ? 'play' : 'plays'} value={r.plays.toLocaleString()} />
            <Tile label="hours listened" value={hours} />
            {r.spent && r.spent.count > 0 ? (
              <Tile label={`spent on ${plural(r.spent.count, 'record')}`} value={formatMoney(r.spent.total, currency, { whole: true })} />
            ) : (
              <Tile label={r.played === 1 ? 'record played' : 'different records played'} value={r.played.toLocaleString()} />
            )}
          </div>
        </Section>
      </div>

      {/* the sections share two columns evenly, so a year with only plays (or only additions)
          doesn't leave one side empty */}
      <div className="lg:columns-2 lg:gap-x-8 [&>*]:inline-block [&>*]:w-full [&>*]:break-inside-avoid [&>*]:align-top">
        {r.plays > 0 && (
          <Section title="Plays by month">
            <Card>
              <MonthBars months={r.playsByMonth} text={(n) => plural(n, 'play')} short={String} />
            </Card>
          </Section>
        )}
        {r.plays > 0 && (
          <Section title="Most played">
            <ul className={`divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 ${statCard}`}>
              {r.topRecords.map(({ item, count }) => (
                <li key={item.instanceId}>
                  <RecordRow item={item}>
                    <span className="text-sm font-medium text-stone-600 tabular-nums dark:text-stone-300">{plural(count, 'play')}</span>
                  </RecordRow>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {r.plays > 0 && (
          <Section title="Top artists">
            <ol className={`divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 ${statCard}`}>
              {r.topArtists.map((a, i) => (
                <li key={a.name} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="w-4 text-stone-500 tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
                  <span className="shrink-0 font-medium text-stone-600 tabular-nums dark:text-stone-300">{plural(a.count, 'play')}</span>
                </li>
              ))}
            </ol>
          </Section>
        )}
        {r.added.length > 0 && (
          <Section title="Added by month">
            <Card>
              <MonthBars months={r.addedByMonth} text={(n) => plural(n, 'record')} short={String} />
            </Card>
          </Section>
        )}
        {r.added.length > 0 && (
          <Section title={`New in ${year}`}>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {r.added
                .slice(-COVERS)
                .reverse()
                .map((item) => (
                  <Link key={item.instanceId} href={`/collection/${item.instanceId}`} title={`${item.title} · ${item.artist}`}>
                    <Cover item={item} small className="aspect-square w-full rounded-lg" />
                  </Link>
                ))}
            </div>
            {r.added.length > COVERS && (
              <p className="px-1 text-sm text-stone-500">And {(r.added.length - COVERS).toLocaleString()} more.</p>
            )}
          </Section>
        )}
        {facts.length > 0 && (
          <Section title="Highlights">
            <ul className={`divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 ${statCard}`}>
              {facts.map(([label, value, when]) =>
                typeof value === 'string' ? (
                  <li key={label} className="flex min-h-14 items-center justify-between gap-3 px-4 text-sm">
                    <span className="text-stone-500">{label}</span>
                    <span className="font-medium">{value}</span>
                  </li>
                ) : (
                  <li key={label}>
                    <RecordRow item={value}>
                      <span className="block text-xs text-stone-500">{label}</span>
                      <span className="block text-sm font-medium">{formatDay(localDate(Date.parse(when!)))}</span>
                    </RecordRow>
                  </li>
                ),
              )}
            </ul>
          </Section>
        )}
      </div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${statCard} p-3`}>
      <p className="truncate text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-stone-500">{label}</p>
    </div>
  )
}
