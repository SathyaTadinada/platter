import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ScanBarcode } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearch } from 'wouter'
import { addToFolder, getFolders, getRelease, searchReleases } from '../api/discogs/endpoints'
import type { SearchResult } from '../api/discogs/types'
import { searchMbBarcode } from '../api/musicbrainz'
import { pickDefaultFolder } from '../components/AddForm'
import { Cover } from '../components/Cover'
import { PlaySummary } from '../components/PlayButton'
import { DiscogsCredit } from '../components/ReleaseCardView'
import { RecordRow, statCard } from '../components/stats'
import { Button, buttonClass, Notice, Screen, Spinner } from '../components/ui'
import { db, getSetting, setSetting, type LibraryItem } from '../db/db'
import { invalidateCollectionMeta } from '../hooks/useCollectionMeta'
import { useLogPlay } from '../hooks/plays'
import { useSignedIn } from '../hooks/session'
import { useSearchCovers } from '../hooks/useSearchCovers'
import { useAsync } from '../hooks/useAsync'
import { formatBarcodeInput } from '../lib/barcode'
import { toCard, type ReleaseCard } from '../lib/format'
import { itemFromRelease } from '../lib/library'
import { lookupBarcode } from '../lib/lookup'

const list = `divide-y divide-stone-200 overflow-hidden text-left dark:divide-stone-800 ${statCard}`

// The record big in the middle, then what happens next. Every outcome has the same shape,
// so a scan that needs a choice looks like the same screen as one that went straight through.
function Hero({
  item,
  status,
  title,
  artist,
  children,
}: {
  item: Pick<LibraryItem, 'cover' | 'thumb'>
  status: ReactNode
  title: string
  artist: string
  children: ReactNode
}) {
  return (
    <div className="mx-auto max-w-sm text-center">
      <Cover item={item} className="mx-auto aspect-square w-full rounded-2xl shadow-xl ring-1 ring-black/10" />
      <p className="mt-4 text-sm font-medium text-stone-500">{status}</p>
      <h2 className="mt-1 text-2xl font-bold tracking-tight">{title}</h2>
      <p className="text-stone-600 dark:text-stone-300">{artist}</p>
      {children}
    </div>
  )
}

const pressingLine = (c: ReleaseCard) => [[c.label, c.catno].filter(Boolean).join(' '), c.country, c.year].filter(Boolean).join(' · ')

// Scan in Play mode lands here: find the copy you own and log a play, or add it first
export function NowPlaying() {
  const { client, session, username } = useSignedIn()
  const barcode = new URLSearchParams(useSearch()).get('barcode') ?? ''
  const { log } = useLogPlay()
  const [chosen, setChosen] = useState<number | null>(null)
  const [adding, setAdding] = useState<number | null>(null)
  const [addedTo, setAddedTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
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

  // the demo searches signed out, which leaves out images; look those up
  const results = owned.data?.results ?? []
  const covers = useSearchCovers(
    results.filter((r) => !r.thumb).map((r) => r.id),
    session.kind === 'demo',
  )
  const cards = results.map((r) => {
    const c = toCard(r)
    return c.thumb || !covers.has(c.id) ? c : { ...c, thumb: covers.get(c.id), cover: covers.get(c.id) }
  })

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

  // into the crate last added to, as on a release page, then logged
  async function addAndLog(r: SearchResult) {
    setAdding(r.id)
    setError(null)
    try {
      const folders = (await getFolders(client, username)).folders.filter((f) => f.id !== 0)
      const folderId = pickDefaultFolder(folders, await getSetting<number>('lastFolderId'))
      if (!folderId) throw new Error("There's no crate to add it to.")
      const release = await getRelease(client, r.id)
      const { instance_id } = await addToFolder(client, username, folderId, r.id)
      const added = itemFromRelease(release, instance_id, folderId)
      await db.collection.put(added)
      await setSetting('lastFolderId', folderId)
      invalidateCollectionMeta()
      setAddedTo(folders.find((f) => f.id === folderId)?.name ?? null)
      setChosen(instance_id)
      await log(added)
    } catch (e) {
      setError(`Couldn't add it: ${(e as Error).message}`)
    } finally {
      setAdding(null)
    }
  }

  const scanNext = (label: string, variant: 'primary' | 'secondary' = 'primary') => (
    <Link href="/scan?mode=play" className={buttonClass(variant)}>
      <ScanBarcode size={18} aria-hidden />
      {label}
    </Link>
  )

  let body
  let backdrop: string | undefined
  if (owned.loading) body = <Spinner label="Looking for your copy" />
  else if (owned.error) body = <Notice tone="error">{owned.error.message}</Notice>
  else if (item) {
    backdrop = item.cover ?? item.thumb
    body = (
      <Hero
        item={item}
        title={item.title}
        artist={item.artist}
        status={
          <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <Check size={16} aria-hidden /> {addedTo ? `Added to ${addedTo} and logged` : 'Logged'}
          </span>
        }
      >
        <PlaySummary item={item} className="mt-2 text-sm text-stone-500" />
        <p className="mt-1">
          <DiscogsCredit url={`https://www.discogs.com/release/${item.releaseId}`} />
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <Link href={`/collection/${item.instanceId}`} className={buttonClass('secondary')}>
            Open record
          </Link>
          {scanNext('Scan next')}
        </div>
      </Hero>
    )
  } else if (copies && copies.length > 1) {
    backdrop = copies[0].cover ?? copies[0].thumb
    body = (
      <Hero item={copies[0]} title={copies[0].title} artist={copies[0].artist} status="You have more than one of these">
        <p className="mt-6 mb-2 text-left text-sm text-stone-500">Which one's on?</p>
        <ul className={list}>
          {copies.map((c) => (
            <li key={c.instanceId}>
              <RecordRow item={c} detail={[c.format, c.year || null].filter(Boolean).join(' · ')} onClick={() => pick(c)} />
            </li>
          ))}
        </ul>
      </Hero>
    )
  } else if (cards.length) {
    const card = cards[0]
    const pressings = owned.data?.pressings ?? []
    backdrop = card.cover ?? card.thumb
    body = (
      <Hero item={card} title={card.title} artist={card.artist} status="Not in your collection">
        <p className="mt-1 text-sm text-stone-500">
          {cards.length === 1 ? pressingLine(card) : `${cards.length} pressings share this barcode`}
        </p>
        {error && (
          <div className="mt-4 text-left">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        {pressings.length > 0 && (
          <>
            <p className="mt-6 mb-2 text-left text-sm text-stone-500">
              You have {pressings.length === 1 ? 'another pressing' : 'other pressings'} of it. Log the play on yours?
            </p>
            <ul className={list}>
              {pressings.map((p) => (
                <li key={p.instanceId}>
                  <RecordRow item={p} detail={[p.format, p.year || null].filter(Boolean).join(' · ')} onClick={() => pick(p)} />
                </li>
              ))}
            </ul>
          </>
        )}
        {cards.length > 1 ? (
          <>
            <p className="mt-6 mb-2 text-left text-sm text-stone-500">
              {pressings.length ? 'Or add the one you have:' : 'Which one do you have? It gets added and the play logged.'}
            </p>
            <ul className={list}>
              {cards.map((c, i) => (
                <li key={c.id}>
                  <RecordRow
                    item={{
                      instanceId: c.id,
                      title: [c.country, c.year].filter(Boolean).join(' · ') || c.title,
                      artist: '',
                      thumb: c.thumb,
                    }}
                    detail={[c.format, c.catno].filter(Boolean).join(' · ')}
                    onClick={() => addAndLog(results[i])}
                  >
                    {adding === c.id && (
                      <span className="block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    )}
                  </RecordRow>
                </li>
              ))}
            </ul>
            <div className="mt-6 grid">{scanNext('Scan another')}</div>
          </>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-2">
            {scanNext('Scan another', 'secondary')}
            <Button disabled={adding !== null} onClick={() => addAndLog(results[0])}>
              {adding !== null ? 'Adding…' : 'Add and log it'}
            </Button>
          </div>
        )}
        <p className="mt-4">
          <Link href={`/results?barcode=${barcode}`} className="text-sm text-stone-500 underline underline-offset-2">
            {cards.length > 1 ? 'Compare them in search' : 'See the release'}
          </Link>
        </p>
      </Hero>
    )
  } else {
    body = (
      <div className="mx-auto max-w-sm space-y-4">
        <Notice tone="info">Discogs doesn't know the barcode {formatBarcodeInput(barcode)}.</Notice>
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/results?barcode=${barcode}`} className={buttonClass('secondary')}>
            Look it up
          </Link>
          {scanNext('Scan another')}
        </div>
      </div>
    )
  }

  return (
    <Screen title="Now playing" back="/scan" width="wide" backdrop={backdrop}>
      {body}
    </Screen>
  )
}
