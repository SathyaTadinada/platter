import { Disc3, Shuffle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { Cover } from '../../components/Cover'
import { Sheet } from '../../components/Sheet'
import { Button, buttonClass } from '../../components/ui'
import type { LibraryItem } from '../../db/db'
import { useListening, useLogPlay } from '../../hooks/plays'
import { pickToPlay } from '../../lib/plays'
import { dayAgo } from '../../lib/time'

// "What should I play?" from the shuffle button: a pick from the records showing (so it
// follows search and filters), leaning toward ones that haven't been on in a while
export function PlayPicker({ items, scope, onClose }: { items: LibraryItem[]; scope?: string; onClose: () => void }) {
  const listening = useListening()
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

  const when = !pick
    ? ''
    : !pick.last
      ? pick.count
        ? `Played ${pick.count === 1 ? 'once' : `${pick.count} times`}`
        : 'Never played'
      : `Last played ${dayAgo(pick.last)}`

  return (
    <Sheet
      title="What should I play?"
      onClose={onClose}
      bodyClassName="p-5"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={next} disabled={rows.length < 2 || busy}>
            <Shuffle size={18} aria-hidden />
            Another
          </Button>
          <Button onClick={putOn} disabled={!pick || busy}>
            <Disc3 size={18} className={busy ? 'animate-spin' : ''} aria-hidden />
            Put it on
          </Button>
        </div>
      }
    >
      {pick && (
        <div className="text-center">
          <Cover item={pick.item} className="mx-auto aspect-square w-full max-w-64 rounded-2xl shadow-xl ring-1 ring-black/10" />
          <p className="mt-4 text-xl font-bold tracking-tight">{pick.item.title}</p>
          <p className="text-stone-600 dark:text-stone-300">{pick.item.artist}</p>
          <p className="mt-1 text-sm text-stone-500">
            {when}
            {scope && ` · from ${scope}`}
          </p>
          <Link
            href={`/collection/${pick.item.instanceId}`}
            onClick={onClose}
            className={buttonClass('ghost', 'mt-3 min-h-9 px-3 text-sm')}
          >
            Open record
          </Link>
        </div>
      )}
    </Sheet>
  )
}
