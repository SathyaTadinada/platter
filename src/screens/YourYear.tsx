import { useLiveQuery } from 'dexie-react-hooks'
import { Share, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'wouter'
import { ChartsSheet } from '../components/ChartsSheet'
import { Cover } from '../components/Cover'
import { DiscogsCredit } from '../components/ReleaseCardView'
import { ChartColumns, Highlights, MonthBars, RecordList, Tile, TopArtists, YearStepper, type Highlight } from '../components/stats'
import { ShareSheet } from '../components/ShareSheet'
import { Card, IconButton, Screen, Section, Spinner } from '../components/ui'
import { db, type LibraryItem } from '../db/db'
import { useCurrency } from '../hooks/prices'
import { useSignedIn } from '../hooks/session'
import { useFieldMatches } from '../hooks/useFields'
import { fieldFor } from '../lib/fields'
import { hoursText, plural } from '../lib/format'
import { libraryItems } from '../lib/masters'
import { replaceAddress } from '../lib/nav'
import { DAYS, formatDay, localDate } from '../lib/time'
import { formatMoney } from '../lib/value'
import { yearLayout, type YearKey } from '../lib/statsLayout'
import { reviewYears, yearCard, yearReview, type YearReview } from '../lib/yearReview'

const COVERS = 6

export function YourYear({ year: asked }: { year?: string }) {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(Number(asked) || thisYear)
  const { username } = useSignedIn()
  const currency = useCurrency()
  const matches = useFieldMatches()
  const [sharing, setSharing] = useState(false)
  const [choosing, setChoosing] = useState(false)
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
    <YearStepper
      year={year}
      onEarlier={data && at >= 0 && at < years.length - 1 ? () => go(years[at + 1]) : undefined}
      onLater={data && at > 0 ? () => go(years[at - 1]) : undefined}
    />
  )

  return (
    <Screen
      title="Your year"
      back="/stats"
      width="wide"
      toolbar={toolbar}
      actions={
        !empty && (
          <>
            <IconButton label="Choose charts" onClick={() => setChoosing(true)}>
              <SlidersHorizontal size={20} />
            </IconButton>
            <IconButton label="Share" onClick={() => setSharing(true)}>
              <Share size={20} />
            </IconButton>
          </>
        )
      }
    >
      {!r || !currency ? <Spinner /> : <Review r={r} currency={currency} username={username} />}
      {sharing && <ShareSheet card={card} name={`${username}-${year}`} onClose={() => setSharing(false)} />}
      {choosing && <ChartsSheet store={yearLayout} onClose={() => setChoosing(false)} />}
    </Screen>
  )
}

function Review({ r, currency, username }: { r: YearReview; currency: string; username: string }) {
  const { year } = r
  if (!r.added.length && !r.plays) {
    return (
      <Card className="max-w-xl">
        <p className="font-semibold">Nothing in {year} yet</p>
        <p className="mt-1 text-sm text-stone-500">Records you add and plays you log this year show up here.</p>
      </Card>
    )
  }

  const first = r.added[0]
  const latest = r.added.at(-1)
  const day = (iso: string) => formatDay(localDate(Date.parse(iso)))
  // plain facts first, then the ones about a particular record
  const facts = [
    r.decade !== undefined && { label: 'Mostly from', value: `the ${r.decade}s` },
    r.genres[0] && { label: 'Top genre added', value: r.genres[0].name },
    r.busiestDay !== undefined && { label: 'Busiest day', value: DAYS[r.busiestDay] },
    first && { label: 'First in', record: { item: first }, value: day(first.dateAdded) },
    latest && latest !== first && { label: 'Latest', record: { item: latest }, value: day(latest.dateAdded) },
    r.biggestBuy && { label: 'Biggest buy', record: { item: r.biggestBuy.item }, value: formatMoney(r.biggestBuy.amount, currency) },
    r.oldest && r.added.length > 1 && { label: 'Oldest album added', record: { item: r.oldest.item }, value: String(r.oldest.year) },
  ].filter(Boolean) as Highlight[]

  const sections: Record<YearKey, ReactNode> = {
    month: r.plays > 0 && (
      <Section title="Plays by month">
        <Card>
          <MonthBars months={r.playsByMonth} text={(n) => plural(n, 'play')} short={String} />
        </Card>
      </Section>
    ),
    most: r.plays > 0 && (
      <Section title="Most played">
        <RecordList rows={r.topRecords.map(({ item, count }) => ({ item, right: plural(count, 'play') }))} />
      </Section>
    ),
    artists: r.plays > 0 && (
      <Section title="Top artists">
        <TopArtists artists={r.topArtists} text={(n) => plural(n, 'play')} />
      </Section>
    ),
    added: r.added.length > 0 && (
      <Section title="Added by month">
        <Card>
          <MonthBars months={r.addedByMonth} text={(n) => plural(n, 'record')} short={String} />
        </Card>
      </Section>
    ),
    new: r.added.length > 0 && <NewRecords added={r.added} year={year} />,
    highlights: facts.length > 0 && (
      <Section title="Highlights">
        <Highlights facts={facts} />
      </Section>
    ),
  }

  return (
    <div>
      <Section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label={r.added.length === 1 ? 'record added' : 'records added'} value={r.added.length.toLocaleString()} />
          <Tile label={r.plays === 1 ? 'play' : 'plays'} value={r.plays.toLocaleString()} />
          <Tile label="hours listened" value={hoursText(r.hours)} />
          {r.spent && r.spent.count > 0 ? (
            <Tile label={`spent on ${plural(r.spent.count, 'record')}`} value={formatMoney(r.spent.total, currency, { whole: true })} />
          ) : (
            <Tile label={r.played === 1 ? 'record played' : 'different records played'} value={r.played.toLocaleString()} />
          )}
        </div>
      </Section>

      <ChartColumns store={yearLayout} sections={sections} />
      <p className="mt-2">
        <DiscogsCredit url={`https://www.discogs.com/user/${encodeURIComponent(username)}/collection`} />
      </p>
    </div>
  )
}

// The newest few covers, with the rest a tap away
function NewRecords({ added, year }: { added: LibraryItem[]; year: number }) {
  const [all, setAll] = useState(false)
  const newest = [...added].reverse()
  return (
    <Section title={`New in ${year}`}>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {(all ? newest : newest.slice(0, COVERS)).map((item) => (
          <Link key={item.instanceId} href={`/collection/${item.instanceId}`} title={`${item.title} · ${item.artist}`}>
            <Cover item={item} small className="aspect-square w-full rounded-lg" />
          </Link>
        ))}
      </div>
      {added.length > COVERS && (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => setAll(!all)}
          className="rounded-full px-1 text-sm font-medium text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"
        >
          {all ? 'Show fewer' : `Show all ${added.length.toLocaleString()}`}
        </button>
      )}
    </Section>
  )
}
