import { useState } from 'react'
import { Card } from '../../components/ui'
import type { Folder } from '../../api/discogs/types'
import type { LibraryItem } from '../../db/db'
import { decadeOf, yearOf } from '../../lib/library'
import { distribution, totalsBy } from '../../lib/value'
import { pct, Toggle } from '../../components/stats'
import type { Money, Valued } from './shared'

// Records per price range, with what each range adds up to
export function Breakdown({ valued, money }: { valued: Valued[]; money: Money }) {
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
            <span className="w-full rounded-t-lg bg-accent/80" style={{ height: b.count ? pct(b.count, most) : 0 }} />
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

export function BarList({ rows }: { rows: { label: string; amount: number; text: string }[] }) {
  const most = Math.max(...rows.map((r) => r.amount))
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="text-sm">
          <div className="mb-1 flex justify-between gap-3">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{r.text}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
            <div className="h-full rounded-full bg-accent" style={{ width: pct(r.amount, most) }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export type Grouping = 'genre' | 'decade' | 'crate'

export function GroupTotals({ valued, folders, money }: { valued: Valued[]; folders: Folder[]; money: Money }) {
  const [by, setBy] = useState<Grouping>('genre')
  const crate = new Map(folders.map((f) => [f.id, f.name]))
  const keys: Record<Grouping, (i: LibraryItem) => string[]> = {
    genre: (i) => (i.genres.length ? i.genres : ['No genre']),
    decade: (i) => [yearOf(i) ? `${decadeOf(yearOf(i))}s` : 'Unknown'],
    crate: (i) => [crate.get(i.folderId) ?? 'Uncategorized'],
  }
  const amounts = valued.map((v) => ({ row: v.item, amount: v.value.amount }))
  // decades read best in order, with Unknown at the end; the others go biggest first
  const rows =
    by === 'decade'
      ? totalsBy(amounts, keys.decade, Infinity).sort(
          (a, b) => Number(a.label === 'Unknown') - Number(b.label === 'Unknown') || parseInt(b.label) - parseInt(a.label),
        )
      : totalsBy(amounts, keys[by])
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
