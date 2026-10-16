import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ScanBarcode } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearch } from 'wouter'
import { searchReleases } from '../api/discogs/endpoints'
import { searchMbBarcode } from '../api/musicbrainz'
import { PlaySummary } from '../components/PlayButton'
import { DiscogsCredit } from '../components/ReleaseCardView'
import { RecordRow, statCard } from '../components/stats'
import { buttonClass, Notice, Screen, Spinner } from '../components/ui'
import { db, type LibraryItem } from '../db/db'
import { useLogPlay } from '../hooks/plays'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { lookupBarcode } from '../lib/lookup'
import { Cover } from '../components/Cover'

// Scan in Play mode lands here: find the copy you own and log a play
export function NowPlaying() {
  const { client } = useSignedIn()
  const barcode = new URLSearchParams(useSearch()).get('barcode') ?? ''
  const { log } = useLogPlay()
  const [chosen, setChosen] = useState<number | null>(null)
  const logged = useRef<string | null>(null)

  const owned = useAsync(async () => {
    const found = await lookupBarcode(barcode, {
      searchDiscogs: (p) => searchReleases(client, p).then((r) => r.results),
      searchMb: (b) => searchMbBarcode(b),
    })
    if (!('results' in found)) return []
    const ids = found.results.map((r) => r.id)
    return db.collection.where('releaseId').anyOf(ids).toArray()
  }, [barcode, client])

  // one copy: log it straight away, once per barcode
  const copies = owned.data
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
    body = (
      <div className="max-w-xl space-y-3">
        <Notice tone="info">That one isn't in your collection.</Notice>
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/results?barcode=${barcode}`} className={buttonClass('secondary')}>
            Look it up
          </Link>
          <Link href="/scan?mode=play" className={buttonClass('primary')}>
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
