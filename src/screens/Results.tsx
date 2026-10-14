import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { searchReleases } from '../api/discogs/endpoints'
import type { SearchParams, SearchResult } from '../api/discogs/types'
import { coverArtUrl, searchMbBarcode, type MbRelease } from '../api/musicbrainz'
import { RunoutMatch, RunoutPanel } from '../components/RunoutPanel'
import { DiscogsCredit, ReleaseCardView } from '../components/ReleaseCardView'
import { buttonClass, Notice, Screen, Spinner } from '../components/ui'
import { db } from '../db/db'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { toCard, type ReleaseCard } from '../lib/format'
import { lookupBarcode, type LookupResult } from '../lib/lookup'
import type { Ranked } from '../lib/runout'
import { computeOwnership, type Ownership } from '../lib/ownership'
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
  const [show, setShow] = useState<Show>('all')
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
  // digital releases are rarely the one in your hands, so they go last
  const ordered = (ranked ? ranked.map((r) => cards.find((c) => c.id === r.item.id)!) : cards)
    .map((c, i) => ({ c, i, file: isDigital(c) }))
    .sort((a, b) => Number(a.file) - Number(b.file) || a.i - b.i)
    .map(({ c }) => c)

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
          <ShowFilter cards={cards} own={own} value={show} onChange={setShow} />
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ordered
              .filter((c) => show === 'all' || kindOf(own?.get(c.id)) === show)
              .map((c) => (
                <ReleaseCardView
                  key={c.id}
                  card={c}
                  own={own?.get(c.id)}
                  onPick={() => navigate(`/release/${c.id}`)}
                  extra={matchOf.get(c.id) && <RunoutMatch result={matchOf.get(c.id)!} />}
                />
              ))}
          </ul>
          <p className="mt-4">
            <DiscogsCredit url={`https://www.discogs.com/search/?q=${encodeURIComponent(describeQuery(params))}&type=release`} />
          </p>
        </>
      )}
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

type Show = 'all' | 'mine' | 'other' | 'new'

const kindOf = (o?: Ownership): Exclude<Show, 'all'> => (o?.exactCopies ? 'mine' : o?.otherPressings ? 'other' : 'new')

// Narrow a long list down by what's already in the collection; only shown when it helps
function ShowFilter({
  cards,
  own,
  value,
  onChange,
}: {
  cards: ReleaseCard[]
  own?: Map<number, Ownership>
  value: Show
  onChange: (s: Show) => void
}) {
  if (!own || cards.length < 4) return null
  const count = (k: Show) => (k === 'all' ? cards.length : cards.filter((c) => kindOf(own.get(c.id)) === k).length)
  if (count('new') === cards.length && value === 'all') return null
  const options: [Show, string][] = [
    ['all', 'All'],
    ['mine', 'You own'],
    ['other', 'Other pressing owned'],
    ['new', 'Not owned'],
  ]
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {options.map(([k, label]) => {
        const n = count(k)
        if (!n && k !== value) return null
        const on = k === value
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(k)}
            className={`rounded-full px-3 py-1.5 text-sm transition ${
              on
                ? 'bg-stone-900 text-white dark:bg-accent-500 dark:text-stone-950'
                : 'bg-stone-200 text-stone-800 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700'
            }`}
          >
            {label} <span className={on ? 'opacity-70' : 'text-stone-500'}>{n}</span>
          </button>
        )
      })}
    </div>
  )
}

const isDigital = (c: ReleaseCard) => {
  const names = c.raw.formats?.map((f) => f.name) ?? c.raw.format ?? []
  return names.length > 0 && names[0] === 'File' && !names.some((n) => n === 'Vinyl' || n === 'CD' || n === 'Cassette')
}
