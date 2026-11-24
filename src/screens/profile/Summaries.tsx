import { useState } from 'react'
import { Link } from 'wouter'
import { Cover } from '../../components/Cover'
import { Highlights, MonthBars, RecordList, Tile, TopArtists, YearStepper, type Highlight } from '../../components/stats'
import { Card, Section } from '../../components/ui'
import type { ProfileBrief, ProfileStats, ProfileYear } from '../../lib/profile'
import { hoursText, plural } from '../../lib/format'
import { dayAgo, DAYS, formatDay, localDate } from '../../lib/time'
import { type MonthTotal } from '../../lib/value'
import { BarList } from '../value/Breakdowns'
import { useRecordHref } from './recordHref'

// Someone else's Stats and Your year, drawn from what their devices published. The same pieces as
// the Listening view and the Your year page, with nothing about prices.

const columns = 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8'

const row = (b: ProfileBrief) => ({ instanceId: b.id, title: b.title, artist: b.artist, thumb: b.thumb })

// Month names in the visitor's language, not the owner's
const relabel = (months: MonthTotal[]) =>
  months.map((m) => {
    const [y, mo] = m.month.split('-').map(Number)
    return { ...m, label: new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'short' }) }
  })

function Records({ rows }: { rows: { item: ProfileBrief; right: string }[] }) {
  const hrefOf = useRecordHref()
  return <RecordList rows={rows.map(({ item, right }) => ({ item: row(item), href: hrefOf(item.id), right }))} />
}

export function StatsView({ stats }: { stats: ProfileStats }) {
  const months = relabel(stats.playsByMonth)
  const now = localDate(Date.now())
  const thisMonth = months.find((m) => m.month === now.slice(0, 7))?.total ?? 0
  const thisYear = months.filter((m) => m.month.startsWith(now.slice(0, 4))).reduce((n, m) => n + m.total, 0)
  const played = stats.mostPlayed.length > 0
  const added = relabel(stats.addedByMonth)
  // this month stands out, as on your own Stats, but only when the owner's summary reaches it
  const current = (list: MonthTotal[]) => list.at(-1)?.month === now.slice(0, 7)

  return (
    <div className={columns}>
      <div>
        {played && (
          <>
            <Section>
              <div className="grid grid-cols-3 gap-3">
                <Tile label="This month" value={thisMonth} />
                <Tile label="This year" value={thisYear} />
                <Tile label={`of ${stats.records.toLocaleString()} played`} value={stats.played} />
              </div>
            </Section>
            <Section title="Plays by month">
              <Card>
                <MonthBars months={months} text={(n) => plural(n, 'play')} short={String} now={current(months)} />
              </Card>
            </Section>
            <Section title="Most played">
              <Records rows={stats.mostPlayed.map((m) => ({ item: m.item, right: plural(m.count, 'play') }))} />
            </Section>
          </>
        )}
        {stats.genres.length > 0 && (
          <Section title="By genre">
            <Card>
              <BarList rows={stats.genres.map((g) => ({ label: g.label, amount: g.count, text: g.count.toLocaleString() }))} />
            </Card>
          </Section>
        )}
      </div>
      <div>
        {stats.recent.length > 0 && (
          <Section title="Recently played">
            <Records rows={stats.recent.map((r) => ({ item: r.item, right: dayAgo(r.at) }))} />
          </Section>
        )}
        <Section title="Added by month">
          <Card>
            <MonthBars months={added} text={(n) => plural(n, 'record')} short={String} now={current(added)} />
          </Card>
        </Section>
        {stats.decades.length > 0 && (
          <Section title="By decade">
            <Card>
              <BarList rows={stats.decades.map((d) => ({ label: d.label, amount: d.count, text: d.count.toLocaleString() }))} />
            </Card>
          </Section>
        )}
      </div>
    </div>
  )
}

// One year at a time, newest first, stepped through like the Your year page
export function YearView({ years }: { years: ProfileYear[] }) {
  const newestFirst = [...years].sort((a, b) => b.year - a.year)
  const [at, setAt] = useState(0)
  const r = newestFirst[Math.min(at, newestFirst.length - 1)]
  const hrefOf = useRecordHref()
  const day = (iso: string) => formatDay(localDate(Date.parse(iso)))
  const open = (b: ProfileBrief) => ({ item: row(b), href: hrefOf(b.id) })
  const facts = [
    r.decade !== undefined && { label: 'Mostly from', value: `the ${r.decade}s` },
    r.genre && { label: 'Top genre added', value: r.genre },
    r.busiestDay !== undefined && { label: 'Busiest day', value: DAYS[r.busiestDay] },
    r.first && { label: 'First in', record: open(r.first.item), value: day(r.first.date) },
    r.latest && { label: 'Latest', record: open(r.latest.item), value: day(r.latest.date) },
    r.oldest && { label: 'Oldest album added', record: open(r.oldest.item), value: String(r.oldest.year) },
  ].filter(Boolean) as Highlight[]

  return (
    <div>
      <Section>
        <YearStepper
          year={r.year}
          onEarlier={at < newestFirst.length - 1 ? () => setAt(at + 1) : undefined}
          onLater={at > 0 ? () => setAt(at - 1) : undefined}
        />
      </Section>
      <Section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label={r.added === 1 ? 'record added' : 'records added'} value={r.added.toLocaleString()} />
          <Tile label={r.plays === 1 ? 'play' : 'plays'} value={r.plays.toLocaleString()} />
          <Tile label="hours listened" value={hoursText(r.hours)} />
          <Tile label={r.played === 1 ? 'record played' : 'different records played'} value={r.played.toLocaleString()} />
        </div>
      </Section>
      <div className={columns}>
        <div>
          {r.plays > 0 && (
            <>
              <Section title="Plays by month">
                <Card>
                  <MonthBars months={relabel(r.playsByMonth)} text={(n) => plural(n, 'play')} short={String} />
                </Card>
              </Section>
              <Section title="Most played">
                <Records rows={r.topRecords.map((t) => ({ item: t.item, right: plural(t.count, 'play') }))} />
              </Section>
              <Section title="Top artists">
                <TopArtists artists={r.topArtists} text={(n) => plural(n, 'play')} />
              </Section>
            </>
          )}
          {r.added > 0 && (
            <Section title="Added by month">
              <Card>
                <MonthBars months={relabel(r.addedByMonth)} text={(n) => plural(n, 'record')} short={String} />
              </Card>
            </Section>
          )}
        </div>
        <div>
          {r.newest.length > 0 && (
            <Section title={`New in ${r.year}`}>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {r.newest.map((b) => (
                  <Link key={b.id} href={hrefOf(b.id)} title={`${b.title} · ${b.artist}`}>
                    <Cover item={b} small className="aspect-square w-full rounded-lg" />
                  </Link>
                ))}
              </div>
            </Section>
          )}
          {facts.length > 0 && (
            <Section title="Highlights">
              <Highlights facts={facts} />
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}
