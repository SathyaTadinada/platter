import { Disc3 } from 'lucide-react'
import type { LibraryItem } from '../db/db'
import { useListening, useLogPlay } from '../hooks/plays'
import { dayAgo } from '../lib/time'

// "Played 3 times, last yesterday"
export function usePlaySummary(item: LibraryItem) {
  const row = useListening()?.rows.find((r) => r.item.instanceId === item.instanceId)
  return row?.count
    ? `Played ${row.count === 1 ? 'once' : `${row.count} times`}${row.last ? `, last ${dayAgo(row.last)}` : ''}`
    : row?.last
      ? `Last played ${dayAgo(row.last)}`
      : 'No plays yet'
}

export function PlaySummary({ item, className }: { item: LibraryItem; className?: string }) {
  return <p className={className}>{usePlaySummary(item)}</p>
}

export function PlayButton({ item }: { item: LibraryItem }) {
  const { log, busy } = useLogPlay()
  const summary = usePlaySummary(item)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => log(item)}
        className="inline-flex min-h-10 items-center gap-2 rounded-full bg-stone-900 px-4 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50 dark:bg-accent-500 dark:text-stone-950"
      >
        <Disc3 size={18} className={busy ? 'animate-spin' : ''} aria-hidden />
        Log a play
      </button>
      <span className="text-sm text-stone-500">{summary}</span>
    </div>
  )
}
