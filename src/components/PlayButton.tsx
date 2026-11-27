import { ChevronDown, Disc3 } from 'lucide-react'
import type { Track } from '../api/discogs/types'
import type { LibraryItem } from '../db/db'
import { useListening, useLogPlay } from '../hooks/plays'
import { discsOf, sidesOf } from '../lib/sides'
import { recordSeconds } from '../lib/stylus'
import { dayAgo } from '../lib/time'
import { Menu } from './Menu'

// "Played 3 times, last yesterday"
function usePlaySummary(item: LibraryItem) {
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

const pill = 'bg-stone-900 text-white transition disabled:opacity-50 dark:bg-accent dark:text-accent-fg'

// The whole record in one tap. Records with sides also get a menu for logging only some of them,
// so the stylus and scrobbles count what was actually played.
export function PlayButton({ item, tracklist }: { item: LibraryItem; tracklist?: Track[] }) {
  const { log, busy } = useLogPlay()
  const summary = usePlaySummary(item)
  const sides = sidesOf(tracklist)
  const logSides = (s: string[]) => log(item, { sides: s, seconds: recordSeconds(tracklist, s).seconds })
  const choices = [...discsOf(sides), ...sides.map((s) => [s])]
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center">
        <button
          type="button"
          disabled={busy}
          onClick={() => log(item)}
          className={`inline-flex min-h-10 items-center gap-2 text-sm font-semibold active:scale-95 ${pill} ${sides.length ? 'rounded-l-full pr-3 pl-4' : 'rounded-full px-4'}`}
        >
          <Disc3 size={18} className={busy ? 'animate-spin' : ''} aria-hidden />
          Log a play
        </button>
        {sides.length > 0 && (
          <Menu
            label="Log some sides"
            align="left"
            buttonClassName={`inline-flex min-h-10 items-center rounded-r-full border-l border-white/20 pr-3 pl-2 dark:border-black/15 ${pill}`}
            button={<ChevronDown size={16} aria-hidden />}
            items={choices.map((s) => ({
              label: s.length === 1 ? `Side ${s[0]}` : `Sides ${s.join(' and ')}`,
              disabled: busy,
              onSelect: () => logSides(s),
            }))}
          />
        )}
      </div>
      <span className="text-sm text-stone-500">{summary}</span>
    </div>
  )
}
