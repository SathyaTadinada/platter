import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { searchReleases } from '../api/discogs/endpoints'
import type { SearchParams, SearchResult } from '../api/discogs/types'
import { coverArtUrl, searchMbBarcode, type MbRelease } from '../api/musicbrainz'
import { AddSheet } from '../components/AddSheet'
import { RunoutMatch, RunoutPanel } from '../components/RunoutPanel'
import { ReleaseCardView } from '../components/ReleaseCardView'
import { buttonClass, Notice, Screen, Spinner } from '../components/ui'
import { db } from '../db/db'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { toCard, type ReleaseCard } from '../lib/format'
import { lookupBarcode, type LookupResult } from '../lib/lookup'
import type { Ranked } from '../lib/runout'
import { computeOwnership } from '../lib/ownership'
import { rememberSearch } from '../lib/recent'

function describeQuery(p: URLSearchParams): string {
  if (p.get('barcode')) return p.get('barcode')!
  if (p.get('catno')) return p.get('catno')!
  return [p.get('artist'), p.get('title')].filter(Boolean).join(' – ')
}

export function Results() {
  const { client } = useSignedIn()
  const qs = useSearch()
  const params = new URLSearchParams(qs)
  const [, navigate] = useLocation()
  const [picked, setPicked] = useState<ReleaseCard | null>(null)
  const [ranked, setRanked] = useState<Ranked<SearchResult>[] | null>(null)

  useEffect(() => {
    const p = new URLSearchParams(qs)
    const kind = p.get('barcode') ? 'barcode' : p.get('catno') ? 'catno' : 'title'
    const label = describeQuery(p)
    if (label) rememberSearch({ kind, label, url: `/results?${qs}` })
  }, [qs])

  const search = (p: SearchParams) => searchReleases(client, p).then((r) => r.results)

  const state = useAsync<LookupResult | { kind: 'search'; results: Awaited<ReturnType<typeof search>> }>(async () => {
    const barcode = params.get('barcode')
    if (barcode) return lookupBarcode(barcode, { searchDiscogs: search, searchMb: (b) => searchMbBarcode(b) })
    const catno = params.get('catno')
    const p: SearchParams = catno
      ? { catno }
      : { artist: params.get('artist') ?? undefined, release_title: params.get('title') ?? undefined }
    return { kind: 'search', results: await search(p) }
  }, [qs, client])

  const results = useMemo(() => (state.data && 'results' in state.data ? state.data.results : []), [state.data])
  const cards = useMemo(() => results.map(toCard), [results])
  const matchOf = useMemo(() => new Map(ranked?.map((r) => [r.item.id, r.result])), [ranked])
  // in runout order once something has been typed
  const shown = ranked ? ranked.map((r) => cards.find((c) => c.id === r.item.id)!) : cards

  // badges come from the local index, so they update live after an add
  const own = useLiveQuery(async () => {
    if (!cards.length) return new Map()
    const [owned, wants] = await Promise.all([db.collection.toArray(), db.wants.toArray()])
    return new Map(cards.map((c) => [c.id, computeOwnership(c.id, c.masterId, owned, wants)]))
  }, [state.data])

  return (
    <Screen title={describeQuery(params) || 'Results'} back={params.get('barcode') ? '/scan' : '/search'} width="wide">
      {state.loading && <Spinner label="Searching Discogs" />}
      {state.error && <Notice tone="error">{state.error.message}</Notice>}

      {state.data?.kind === 'musicbrainz' && <MbNotice mb={state.data.mb} />}

      {state.data?.kind === 'none' && <NothingFound barcode={state.data.barcode} mb={state.data.mb} />}
      {state.data?.kind === 'search' && !cards.length && <Notice tone="info">No results. Try fewer words or check the spelling.</Notice>}

      {cards.length > 0 && (
        <>
          <p className="mb-3 text-sm text-stone-500">{resultsLine(cards.length, Boolean(params.get('barcode')))}</p>
          {cards.length > 1 && <RunoutPanel candidates={results} onRanked={setRanked} />}
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((c) => (
              <ReleaseCardView
                key={c.id}
                card={c}
                own={own?.get(c.id)}
                onPick={() => setPicked(c)}
                extra={matchOf.get(c.id) && <RunoutMatch result={matchOf.get(c.id)!} />}
              />
            ))}
          </ul>
        </>
      )}

      {picked && <AddSheet card={picked} onClose={() => setPicked(null)} onScanNext={() => navigate('/scan')} />}
    </Screen>
  )
}

function resultsLine(n: number, barcode: boolean): string {
  if (n === 1) return barcode ? 'One release has this barcode.' : '1 result'
  return barcode ? `${n} releases share this barcode.` : `${n} results`
}

function MbNotice({ mb }: { mb: MbRelease }) {
  return (
    <div className="mb-4 flex gap-3 rounded-2xl bg-stone-100 p-3 dark:bg-stone-900">
      <img
        src={coverArtUrl(mb.mbid)}
        alt=""
        className="size-16 shrink-0 rounded-lg object-cover"
        onError={(e) => (e.currentTarget.hidden = true)}
      />
      <p className="text-sm text-stone-700 dark:text-stone-300">
        This barcode isn't on Discogs. Showing results for <b>{mb.artist}</b> – <b>{mb.title}</b>
        {mb.date ? ` (${mb.date.slice(0, 4)})` : ''} from MusicBrainz.
      </p>
    </div>
  )
}

function NothingFound({ barcode, mb }: { barcode: string; mb: MbRelease[] }) {
  const guess = mb[0]
  const titleSearch = new URLSearchParams({ mode: 'title', ...(guess ? { artist: guess.artist, title: guess.title } : {}) })
  return (
    <div className="space-y-4">
      <Notice tone="info">
        No match on Discogs for {barcode}.
        {guess ? ` MusicBrainz lists it as ${guess.artist} – ${guess.title}, but that isn't on Discogs either.` : ''}
      </Notice>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Older records often aren't listed by barcode. Try the catalog number from the spine or label.
      </p>
      <div className="grid gap-2">
        <Link href="/search?mode=catno" className={buttonClass('primary')}>
          Search by catalog number
        </Link>
        <Link href={`/search?${titleSearch}`} className={buttonClass('secondary')}>
          Search by artist and title
        </Link>
        <Link href="/scan" className={buttonClass('ghost')}>
          Scan again
        </Link>
      </div>
    </div>
  )
}
