import { Dices } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'wouter'
import { DiscogsCredit } from '../components/ReleaseCardView'
import { ChartColumns, MonthBars, RecordList, Tile } from '../components/stats'
import { buttonClass, Card, Notice, Section, Spinner } from '../components/ui'
import { useListening, usePlayFields } from '../hooks/plays'
import { useSignedIn } from '../hooks/session'
import { plural } from '../lib/format'
import { listeningStats } from '../lib/plays'
import { dayAgo, localDate } from '../lib/time'
import { byMonth } from '../lib/value'
import { PlayPicker } from './collection/PlayPicker'
import { Stylus } from './listening/Stylus'
import { listeningLayout, type ListeningKey } from '../lib/statsLayout'

const TOP = 8

// The Listening view of the Stats tab
export function ListeningStats() {
  const data = useListening()
  const { username } = useSignedIn()
  const ids = usePlayFields()
  const [picking, setPicking] = useState(false)
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

  const nudge = ids && (ids.count === undefined || ids.last === undefined) && (
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

  const sections: Record<ListeningKey, ReactNode> = {
    totals: (
      <Section>
        <div className="grid grid-cols-3 gap-3">
          <Tile label="This month" value={months.at(-1)!.total} />
          <Tile label="This year" value={thisYear} />
          <Tile label={`of ${rows.length} played`} value={playedCount} />
        </div>
      </Section>
    ),
    month: (
      <Section title="Plays by month">
        <Card>
          <MonthBars months={months} text={(n) => plural(n, 'play')} short={String} now />
        </Card>
      </Section>
    ),
    most: (
      <Section title="Most played">
        <RecordList rows={stats.mostPlayed.slice(0, TOP).map((r) => ({ item: r.item, right: plural(r.count, 'play') }))} />
      </Section>
    ),
    stylus: <Stylus />,
    recent: (
      <Section title="Recently played">
        <RecordList rows={stats.recent.slice(0, TOP).map((r) => ({ item: r.item, right: dayAgo(r.last!) }))} />
      </Section>
    ),
    dusty: forgotten.length > 0 && (
      <Section title="Not played in a year">
        {stats.dusty.length > 0 && <RecordList rows={stats.dusty.slice(0, TOP).map((r) => ({ item: r.item, right: dayAgo(r.last!) }))} />}
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-sm text-stone-500">{stats.never.length > 0 && `${stats.never.length} never played`}</p>
          <button type="button" onClick={() => setPicking(true)} className={buttonClass('secondary', 'min-h-9 shrink-0 px-3 text-sm')}>
            <Dices size={16} aria-hidden />
            Pick one
          </button>
        </div>
        {picking && (
          <PlayPicker
            items={forgotten.map((r) => r.item)}
            scope={`${plural(forgotten.length, 'record')} not played in a year`}
            onClose={() => setPicking(false)}
          />
        )}
      </Section>
    ),
  }

  return (
    <ChartColumns store={listeningLayout} sections={sections} first={nudge && <div className="mb-4">{nudge}</div>}>
      <p className="lg:col-span-2">
        <DiscogsCredit url={`https://www.discogs.com/user/${encodeURIComponent(username)}/collection`} />
      </p>
    </ChartColumns>
  )
}
