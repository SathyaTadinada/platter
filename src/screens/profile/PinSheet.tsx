import { useLiveQuery } from 'dexie-react-hooks'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { Cover } from '../../components/Cover'
import { Sheet } from '../../components/Sheet'
import { List } from '../../components/ui'
import { db } from '../../db/db'
import type { Pinned } from '../../lib/cloud'

const SHOWN = 60

// Picking a record from your own collection to pin to the top of your profile
export function PinSheet({ onPick, onClose }: { onPick: (record: Pinned) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const records = useLiveQuery(() => db.collection.orderBy('dateAdded').reverse().toArray(), [])
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const found = (records ?? []).filter((r) => words.every((w) => `${r.title} ${r.artist}`.toLowerCase().includes(w)))

  return (
    <Sheet title="Pin a record" width="md" bodyClassName="p-4" onClose={onClose}>
      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">Find a record</span>
          <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-500" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a record"
            autoComplete="off"
            className="min-h-11 w-full rounded-xl border border-stone-300 bg-white pr-3 pl-10 text-base dark:border-stone-700 dark:bg-stone-900 [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
        <List>
          {found.slice(0, SHOWN).map((r) => (
            <li key={r.instanceId}>
              <button
                type="button"
                onClick={() => onPick({ id: r.releaseId, title: r.title, artist: r.artist, thumb: r.thumb })}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-stone-50 dark:hover:bg-stone-800/50"
              >
                <Cover item={r} small className="size-11 shrink-0 rounded-md" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.title}</span>
                  <span className="block truncate text-xs text-stone-500">{r.artist}</span>
                </span>
              </button>
            </li>
          ))}
        </List>
        {records && !found.length && <p className="px-1 text-sm text-stone-500">No records match.</p>}
      </div>
    </Sheet>
  )
}
