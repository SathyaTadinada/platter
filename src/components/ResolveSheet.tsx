import { Search } from 'lucide-react'
import { useState } from 'react'
import { searchReleases } from '../api/discogs/endpoints'
import type { SearchResult } from '../api/discogs/types'
import type { QueueItem } from '../db/db'
import { useSignedIn } from '../hooks/session'
import { formatBarcodeInput } from '../lib/barcode'
import { toCard } from '../lib/format'
import type { Ranked } from '../lib/runout'
import { DiscogsCredit, ReleaseCardView } from './ReleaseCardView'
import { RunoutMatch, RunoutPanel } from './RunoutPanel'
import { Sheet } from './Sheet'
import { Notice, Spinner } from './ui'

// Pick the right release for a batch item: from its barcode matches, or by searching
export function ResolveSheet({ item, onPick, onClose }: { item: QueueItem; onPick: (r: SearchResult) => void; onClose: () => void }) {
  const { client } = useSignedIn()
  const [q, setQ] = useState(item.guess?.replace(' – ', ' ') ?? '')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!q.trim()) return
    setBusy(true)
    setError(null)
    try {
      setResults((await searchReleases(client, { q: q.trim() })).results)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const list = results ?? item.candidates ?? []
  const [ranked, setRanked] = useState<Ranked<SearchResult>[] | null>(null)
  const ordered = ranked && !results ? ranked : list.map((r) => ({ item: r, result: undefined }))

  return (
    <Sheet
      title={item.barcode ? `Which release is ${formatBarcodeInput(item.barcode ?? '')}?` : 'Pick a release'}
      onClose={onClose}
      width="xl"
      bodyClassName="space-y-3 px-4 py-4"
    >
      <form onSubmit={search} className="relative">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-500" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Discogs: artist, title, catalog number"
          aria-label="Search Discogs"
          className="min-h-11 w-full rounded-xl border border-stone-300 bg-white pr-3 pl-10 dark:border-stone-700 dark:bg-stone-900"
        />
      </form>
      {busy && <Spinner label="Searching" />}
      {error && <Notice tone="error">{error}</Notice>}
      {!busy && results && !results.length && <Notice tone="info">Nothing found. Try fewer words.</Notice>}
      {!busy && !results && !list.length && <p className="text-sm text-stone-500">Search by artist and title, or catalog number.</p>}
      {!busy && !results && list.length > 1 && <RunoutPanel candidates={list} onRanked={setRanked} />}
      {!busy && list.length > 0 && (
        <>
          <ul className="grid grid-cols-1 gap-3">
            {ordered.map(({ item: r, result }) => (
              <ReleaseCardView key={r.id} card={toCard(r)} onPick={() => onPick(r)} extra={result && <RunoutMatch result={result} />} />
            ))}
          </ul>
          <DiscogsCredit url={`https://www.discogs.com/search/?q=${encodeURIComponent(q)}&type=release`} />
        </>
      )}
    </Sheet>
  )
}
