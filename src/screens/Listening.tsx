import { Shuffle } from 'lucide-react'
import { Link, useLocation } from 'wouter'
import { MonthBars, RecordRow, statCard } from '../components/stats'
import { buttonClass, Card, Notice, Section, Spinner } from '../components/ui'
import { useListening, usePlayFields } from '../hooks/plays'
import { listeningStats, type Listening } from '../lib/plays'
import { dayAgo } from '../lib/time'
import { byMonth, localDate } from '../lib/value'

const TOP = 8

// The Listening view of the Stats tab
export function ListeningStats() {
  const data = useListening()
  const ids = usePlayFields()
  const [, navigate] = useLocation()
  if (!data) return <Spinner />

  const { rows, plays } = data
  const stats = listeningStats(rows)
  const months = byMonth(
    plays.map((p) => ({ date: localDate(p.at), amount: 1 })),
    12,
  )
  const year = new Date().getFullYear()
  const thisYear = plays.filter((p) => new Date(p.at).getFullYear() === year).length
  const playedCount = rows.length - stats.never.length
  const forgotten = [...stats.dusty, ...stats.never]

  const nudge = (ids.count === undefined || ids.last === undefined) && (
    <Notice tone="info">
      Plays are only kept on this device until you add Play Count and Last Played fields on Discogs.{' '}
      <Link href="/setup" className="font-medium underline underline-offset-2">
        Set them up
      </Link>
    </Notice>
  )

  if (!stats.recent.length && !stats.mostPlayed.length) {
    return (
      <div className="max-w-xl space-y-4">
        {nudge}
        <Card className="space-y-3">
          <p className="font-semibold">Nothing played yet</p>
          <p className="text-sm text-stone-500">Tap Log a play on a record, or scan one in Play mode when you put it on.</p>
          <Link href="/scan?mode=play" className={buttonClass('secondary', 'w-full')}>
            Scan what's playing
          </Link>
        </Card>
      </div>
    )
  }

  function pickForgotten() {
    const pick = forgotten[Math.floor(Math.random() * forgotten.length)]
    if (pick) navigate(`/collection/${pick.item.instanceId}`)
  }

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-x-8">
      <div>
        {nudge && <div className="mb-4">{nudge}</div>}
        <Section>
          <div className="grid grid-cols-3 gap-3">
            <Tile label="This month" value={months.at(-1)!.total} />
            <Tile label="This year" value={thisYear} />
            <Tile label={`of ${rows.length} played`} value={playedCount} />
          </div>
        </Section>

        <Section title="Plays by month">
          <Card>
            <MonthBars months={months} text={(n) => `${n} play${n === 1 ? '' : 's'}`} />
          </Card>
        </Section>

        <Section title="Most played">
          <List rows={stats.mostPlayed.slice(0, TOP)} right={(r) => `${r.count}×`} />
        </Section>
      </div>

      <div>
        <Section title="Recently played">
          <List rows={stats.recent.slice(0, TOP)} right={(r) => dayAgo(r.last!)} />
        </Section>

        {forgotten.length > 0 && (
          <Section title="Not played in a year">
            {stats.dusty.length > 0 && <List rows={stats.dusty.slice(0, TOP)} right={(r) => dayAgo(r.last!)} />}
            {stats.never.length > 0 && (
              <p className="px-1 text-sm text-stone-500">
                {stats.never.length} record{stats.never.length === 1 ? ' has' : 's have'} never been played.
              </p>
            )}
            <button type="button" onClick={pickForgotten} className={buttonClass('secondary', 'w-full')}>
              <Shuffle size={18} aria-hidden />
              Pick one of these
            </button>
          </Section>
        )}
      </div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className={`${statCard} p-3`}>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-stone-500">{label}</p>
    </div>
  )
}

function List({ rows, right }: { rows: Listening[]; right: (r: Listening) => string }) {
  return (
    <ul className={`divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 ${statCard}`}>
      {rows.map((r) => (
        <li key={r.item.instanceId}>
          <RecordRow item={r.item}>
            <span className="text-sm font-medium text-stone-600 tabular-nums dark:text-stone-300">{right(r)}</span>
          </RecordRow>
        </li>
      ))}
    </ul>
  )
}
