import { ArrowUpRight, Clock, Dices, Disc3 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { Cover } from '../../components/Cover'
import { Sheet } from '../../components/Sheet'
import { Button } from '../../components/ui'
import type { LibraryItem } from '../../db/db'
import { useCollectionMeta } from '../../hooks/useCollectionMeta'
import { yearOf } from '../../lib/library'
import { useListening, useLogPlay } from '../../hooks/plays'
import { pickToPlay } from '../../lib/plays'
import { dayAgo } from '../../lib/time'

// A random pick from the dice button: a pick from the records showing (so it
// follows search and filters), leaning toward ones that haven't been on in a while
export function PlayPicker({ items, scope, onClose }: { items: LibraryItem[]; scope?: string; onClose: () => void }) {
  const listening = useListening()
  const folders = useCollectionMeta().data?.folders
  const { log, busy } = useLogPlay()
  const [offered] = useState(() => new Set<number>())
  const [pickId, setPickId] = useState<number | null>(null)

  const ids = new Set(items.map((i) => i.instanceId))
  const rows = listening?.rows.filter((r) => ids.has(r.item.instanceId)) ?? []
  const next = () => {
    const r = pickToPlay(rows, offered)
    if (!r) return
    offered.add(r.item.instanceId)
    setPickId(r.item.instanceId)
  }
  const ready = Boolean(listening && rows.length)
  useEffect(() => {
    if (ready && pickId === null) next()
  }, [ready]) // just the first pick, once plays have loaded
  const pick = rows.find((r) => r.item.instanceId === pickId)

  async function putOn() {
    if (!pick) return
    await log(pick.item)
    onClose()
  }

  const times = pick?.count ? `Played ${pick.count === 1 ? 'once' : `${pick.count} times`}` : ''
  const when = !pick
    ? ''
    : !pick.count && !pick.last
      ? 'Never played'
      : [times, pick.last && `last ${dayAgo(pick.last)}`].filter(Boolean).join(', ')
  const about = pick && [
    yearOf(pick.item) || undefined,
    pick.item.format.split(', ').slice(0, 2).join(', '),
    folders?.find((f) => f.id === pick.item.folderId && f.id !== 1)?.name,
  ]

  return (
    <Sheet
      title="Up next"
      onClose={onClose}
      bodyClassName="p-5"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={next} disabled={rows.length < 2 || busy}>
            <Dices size={18} aria-hidden />
            Roll again
          </Button>
          <Button onClick={putOn} disabled={!pick || busy}>
            <Disc3 size={18} className={busy ? 'animate-spin' : ''} aria-hidden />
            Play it
          </Button>
        </div>
      }
    >
      {pick && (
        <div className="text-center">
          {/* the cover opens the record */}
          <Link
            href={`/collection/${pick.item.instanceId}`}
            onClick={onClose}
            aria-label={`Open ${pick.item.title}`}
            className="relative mx-auto block w-full max-w-64"
          >
            <Cover item={pick.item} className="aspect-square w-full rounded-2xl shadow-xl ring-1 ring-black/10" />
            <span className="absolute right-2 bottom-2 rounded-full bg-black/50 p-1.5 text-white" aria-hidden>
              <ArrowUpRight size={16} />
            </span>
          </Link>
          <p className="mt-4 text-xl font-bold tracking-tight">{pick.item.title}</p>
          <p className="text-stone-600 dark:text-stone-300">{pick.item.artist}</p>
          <p className="mt-1 text-sm text-stone-500">{about?.filter(Boolean).join(' · ')}</p>
          {when && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-700 dark:bg-stone-800 dark:text-stone-300">
              <Clock size={14} aria-hidden />
              {when}
            </p>
          )}
          {scope && <p className="mt-3 text-xs text-stone-500">From {scope}</p>}
        </div>
      )}
    </Sheet>
  )
}
