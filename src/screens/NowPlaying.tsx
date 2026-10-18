import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ScanBarcode } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { searchReleases } from '../api/discogs/endpoints'
import { searchMbBarcode } from '../api/musicbrainz'
import { PlaySummary } from '../components/PlayButton'
import { DiscogsCredit, ReleaseCardView } from '../components/ReleaseCardView'
import { RecordRow, statCard } from '../components/stats'
import { buttonClass, Notice, Screen, Spinner } from '../components/ui'
import { db, type LibraryItem } from '../db/db'
import { useLogPlay } from '../hooks/plays'
import { useSignedIn } from '../hooks/session'
import { useSearchCovers } from '../hooks/useSearchCovers'
import { useAsync } from '../hooks/useAsync'
import { formatBarcodeInput } from '../lib/barcode'
import { toCard } from '../lib/format'
import { lookupBarcode } from '../lib/lookup'
import { Cover } from '../components/Cover'

// Scan in Play mode lands here: find the copy you own and log a play
export function NowPlaying() {
  const { client, session } = useSignedIn()
  const barcode = new URLSearchParams(useSearch()).get('barcode') ?? ''
  const [, navigate] = useLocation()
  const { log } = useLogPlay()
  const [chosen, setChosen] = useState<number | null>(null)
  const logged = useRef<string | null>(null)

  const owned = useAsync(async () => {
    const found = await lookupBarcode(barcode, {
      searchDiscogs: (p) => searchReleases(client, p).then((r) => r.results),
      searchMb: (b) => searchMbBarcode(b),
    })
    const results = 'results' in found ? found.results : []
    const copies = await db.collection
      .where('releaseId')
      .anyOf(results.map((r) => r.id))
      .toArray()
    // barcodes differ between pressings, so the record in hand may be another pressing of
    // an album that's in the collection
    const masters = results.map((r) => r.master_id).filter((m): m is number => Boolean(m))
    const pressings = copies.length || !masters.length ? [] : await db.collection.where('masterId').anyOf(masters).toArray()
    return { results, copies, pressings }
  }, [barcode, client])

  // what was scanned, when it's not in the collection (the demo needs its cover looked up)
  const first = owned.data?.results[0]
  const covers = useSearchCovers(first && !first.thumb ? [first.id] : [], session.kind === 'demo')

  // one copy: log it straight away, once per barcode
  const copies = owned.data?.copies
  useEffect(() => {
    if (copies?.length === 1 && logged.current !== barcode) {
      logged.current = barcode
      setChosen(copies[0].instanceId)
      log(copies[0])
    }
  }, [copies, barcode, log])

  const item = useLiveQuery(() => (chosen ? db.collection.get(chosen) : undefined), [chosen])

  function pick(i: LibraryItem) {
    setChosen(i.instanceId)
    log(i)
  }

  let body
  if (owned.loading) body = <Spinner label="Looking for your copy" />
  else if (owned.error) body = <Notice tone="error">{owned.error.message}</Notice>
  else if (item) {
    body = (
      <div className="mx-auto max-w-sm text-center">
        <Cover item={item} className="mx-auto aspect-square w-full rounded-2xl shadow-xl ring-1 ring-black/10" />
        <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
          <Check size={16} aria-hidden /> Logged
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">{item.title}</h2>
        <p className="text-stone-600 dark:text-stone-300">{item.artist}</p>
        <PlaySummary item={item} className="mt-2 text-sm text-stone-500" />
        <p className="mt-1">
          <DiscogsCredit url={`https://www.discogs.com/release/${item.releaseId}`} />
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <Link href={`/collection/${item.instanceId}`} className={buttonClass('secondary')}>
            Open record
          </Link>
          <Link href="/scan?mode=play" className={buttonClass('primary')}>
            <ScanBarcode size={18} aria-hidden />
            Scan next
          </Link>
        </div>
      </div>
    )
  } else if (copies && copies.length > 1) {
    body = (
      <div className="max-w-xl space-y-3">
        <p className="text-sm text-stone-500">You have more than one of these. Which one's on?</p>
        <ul className={`divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 ${statCard}`}>
          {copies.map((c) => (
            <li key={c.instanceId}>
              <RecordRow item={c} detail={[c.format, c.year || null].filter(Boolean).join(' · ')} onClick={() => pick(c)} />
            </li>
          ))}
        </ul>
      </div>
    )
  } else {
    const { results = [], pressings = [] } = owned.data ?? {}
    const card = results[0] && { ...toCard(results[0]), ...(covers.has(results[0].id) && { thumb: covers.get(results[0].id) }) }
    body = (
      <div className="max-w-xl space-y-4">
        {card && (
          <ul>
            <ReleaseCardView card={card} onPick={() => navigate(`/release/${card.id}`)} />
          </ul>
        )}
        {pressings.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-stone-500">
              That pressing isn't in your collection, but {pressings.length === 1 ? 'this one is' : 'these are'}. Log the play on yours?
            </p>
            <ul className={`divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 ${statCard}`}>
              {pressings.map((p) => (
                <li key={p.instanceId}>
                  <RecordRow item={p} detail={[p.format, p.year || null].filter(Boolean).join(' · ')} onClick={() => pick(p)} />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <Notice tone="info">
            {card ? "That one isn't in your collection." : `Discogs doesn't know the barcode ${formatBarcodeInput(barcode)}.`}
          </Notice>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/results?barcode=${barcode}`} className={buttonClass('secondary')}>
            {results.length > 1 ? `See all ${results.length}` : 'Look it up'}
          </Link>
          <Link href="/scan?mode=play" className={buttonClass('primary')}>
            <ScanBarcode size={18} aria-hidden />
            Scan another
          </Link>
        </div>
      </div>
    )
  }

  return (
    <Screen title="Now playing" back="/scan" width="wide">
      {body}
    </Screen>
  )
}
