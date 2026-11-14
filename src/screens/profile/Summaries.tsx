import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'wouter'
import { Cover } from '../../components/Cover'
import { MonthBars, RecordRow, statCard } from '../../components/stats'
import { Card, Section } from '../../components/ui'
import type { ProfileBrief, ProfileStats, ProfileYear } from '../../lib/profile'
import { dayAgo, formatDay } from '../../lib/time'
import { localDate, type MonthTotal } from '../../lib/value'
import { BarList } from '../value/Breakdowns'

// Someone else's Stats and Your year, drawn from what their devices published. The same pieces as
// the Listening view and the Your year page, with nothing about prices.

const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`
const columns = 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8'

// Their records open the release here, which says whether you have it too
const row = (b: ProfileBrief) => ({ instanceId: b.id, title: b.title, artist: b.artist, thumb: b.thumb })
const releaseOf = (b: ProfileBrief) => `/release/${b.id}`

// Month names in the visitor's language, not the owner's
const relabel = (months: MonthTotal[]) =>
  months.map((m) => {
    const [y, mo] = m.month.split('-').map(Number)
    return { ...m, label: new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'short' }) }
  })

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className={`${statCard} p-3`}>
      <p className="truncate text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-stone-500">{label}</p>
    </div>
  )
}

function Records({ rows }: { rows: { item: ProfileBrief; right: string }[] }) {
  return (
    <ul className={`divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 ${statCard}`}>
      {rows.map(({ item, right }) => (
        <li key={item.id}>
          <RecordRow item={row(item)} href={releaseOf(item)}>
            <span className="text-sm font-medium text-stone-600 tabular-nums dark:text-stone-300">{right}</span>
          </RecordRow>
        </li>
      ))}
    </ul>
  )
}

export function StatsView({ stats }: { stats: ProfileStats }) {
  const months = relabel(stats.playsByMonth)
  const now = localDate(Date.now())
  const thisMonth = months.find((m) => m.month === now.slice(0, 7))?.total ?? 0
  const thisYear = months.filter((m) => m.month.startsWith(now.slice(0, 4))).reduce((n, m) => n + m.total, 0)
  const played = stats.mostPlayed.length > 0

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
                <MonthBars months={months} text={(n) => plural(n, 'play')} short={String} />
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
            <MonthBars months={relabel(stats.addedByMonth)} text={(n) => plural(n, 'record')} short={String} />
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

// One year at a time, newest first, stepped through like the Your year page
export function YearView({ years }: { years: ProfileYear[] }) {
  const newestFirst = [...years].sort((a, b) => b.year - a.year)
  const [at, setAt] = useState(0)
  const r = newestFirst[Math.min(at, newestFirst.length - 1)]
  const thisYear = new Date().getFullYear()
  const hours = r.hours < 10 ? r.hours.toFixed(1) : Math.round(r.hours).toLocaleString()
  const day = (iso: string) => formatDay(localDate(Date.parse(iso)))
  const facts = [
    r.decade !== undefined && { label: 'Mostly from', value: `the ${r.decade}s` },
    r.genre && { label: 'Top genre added', value: r.genre },
    r.busiestDay !== undefined && { label: 'Busiest day', value: DAYS[r.busiestDay] },
    r.first && { label: 'First in', item: r.first.item, value: day(r.first.date) },
    r.latest && { label: 'Latest', item: r.latest.item, value: day(r.latest.date) },
    r.oldest && { label: 'Oldest album added', item: r.oldest.item, value: String(r.oldest.year) },
  ].filter(Boolean) as { label: string; value: string; item?: ProfileBrief }[]

  return (
    <div>
      <Section>
        <div className="flex items-center justify-between rounded-xl bg-stone-200 p-1 lg:max-w-[26rem] dark:bg-stone-800">
          <YearButton label="Earlier year" disabled={at >= newestFirst.length - 1} onClick={() => setAt(at + 1)}>
            <ChevronLeft size={18} />
          </YearButton>
          <span className="text-sm font-semibold tabular-nums">
            {r.year}
            {r.year === thisYear && <span className="font-normal text-stone-500"> so far</span>}
          </span>
          <YearButton label="Later year" disabled={at <= 0} onClick={() => setAt(at - 1)}>
            <ChevronRight size={18} />
          </YearButton>
        </div>
      </Section>
      <Section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label={r.added === 1 ? 'record added' : 'records added'} value={r.added.toLocaleString()} />
          <Tile label={r.plays === 1 ? 'play' : 'plays'} value={r.plays.toLocaleString()} />
          <Tile label="hours listened" value={hours} />
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
                <ol className={`divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 ${statCard}`}>
                  {r.topArtists.map((a, i) => (
                    <li key={a.name} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <span className="w-4 text-stone-500 tabular-nums">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
                      <span className="shrink-0 font-medium text-stone-600 tabular-nums dark:text-stone-300">
                        {plural(a.count, 'play')}
                      </span>
                    </li>
                  ))}
                </ol>
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
                  <Link key={b.id} href={releaseOf(b)} title={`${b.title} · ${b.artist}`}>
                    <Cover item={b} small className="aspect-square w-full rounded-lg" />
                  </Link>
                ))}
              </div>
            </Section>
          )}
          {facts.length > 0 && (
            <Section title="Highlights">
              <ul className={`divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 ${statCard}`}>
                {facts.map(({ label, value, item }) =>
                  item ? (
                    <li key={label}>
                      <RecordRow item={row(item)} href={releaseOf(item)}>
                        <span className="block text-xs text-stone-500">{label}</span>
                        <span className="block text-sm font-medium tabular-nums">{value}</span>
                      </RecordRow>
                    </li>
                  ) : (
                    <li key={label} className="flex min-h-14 items-center justify-between gap-3 px-4 text-sm">
                      <span className="text-stone-500">{label}</span>
                      <span className="font-medium">{value}</span>
                    </li>
                  ),
                )}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}
