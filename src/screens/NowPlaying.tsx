import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ScanBarcode } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearch } from 'wouter'
import { addToFolder, getRelease, searchReleases } from '../api/discogs/endpoints'
import type { SearchResult } from '../api/discogs/types'
import { searchMbBarcode } from '../api/musicbrainz'
import { pickDefaultFolder } from '../components/AddForm'
import { inline, Row } from '../components/CopyDetails'
import { Cover } from '../components/Cover'
import { CrateSelect } from '../components/CrateSelect'
import { PlaySummary } from '../components/PlayButton'
import { DiscogsCredit } from '../components/ReleaseCardView'
import { RecordRow, statCard } from '../components/stats'
import { Button, buttonClass, List, Notice, Screen, Section, Spinner } from '../components/ui'
import { db, getSetting, setSetting, type LibraryItem } from '../db/db'
import { invalidateCollectionMeta, useCollectionMeta } from '../hooks/useCollectionMeta'
import { useLogPlay } from '../hooks/plays'
import { useSignedIn } from '../hooks/session'
import { useSearchCovers } from '../hooks/useSearchCovers'
import { useAsync } from '../hooks/useAsync'
import { formatBarcodeInput } from '../lib/barcode'
import { rememberBarcode, rememberRelease, releasesWithBarcode } from '../lib/barcodes'
import { rememberLength } from '../lib/stylus'
import { toCard, type ReleaseCard } from '../lib/format'
import { itemFromRelease } from '../lib/library'
import { lookupBarcode } from '../lib/lookup'

const rows = `divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 ${statCard}`
const where = (c: ReleaseCard) => [c.country, c.year].filter(Boolean).join(' · ')

// Laid out like a record page: the cover, and beside it on wide screens (under it on phones)
// what was found and what to do next
function Layout({
  cover,
  status,
  title,
  artist,
  children,
}: {
  cover: Pick<LibraryItem, 'cover' | 'thumb'>
  status: ReactNode
  title: string
  artist: string
  children: ReactNode
}) {
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,17rem)_1fr] lg:gap-8 xl:grid-cols-[minmax(0,22rem)_1fr] xl:gap-10">
      <Cover item={cover} className="mx-auto aspect-square w-full max-w-sm rounded-2xl shadow-xl ring-1 ring-black/10" />
      <div className="mt-6 min-w-0 lg:mt-0">
        <p className="text-sm font-medium text-stone-500">{status}</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight lg:text-3xl">{title}</h2>
        <p className="text-lg text-stone-600 dark:text-stone-300">{artist}</p>
        {children}
      </div>
    </div>
  )
}

// Scan in Play mode lands here: find the copy you own and log a play, or add it first
export function NowPlaying() {
  const { client, session, username } = useSignedIn()
  const barcode = new URLSearchParams(useSearch()).get('barcode') ?? ''
  const { log } = useLogPlay()
  const meta = useCollectionMeta()
  const [chosen, setChosen] = useState<number | null>(null)
  const [playId, setPlayId] = useState<number | null>(null)
  const [folderId, setFolderId] = useState<number>()
  const [adding, setAdding] = useState<number | null>(null)
  const [addedTo, setAddedTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const logged = useRef<string | null>(null)

  const found = useAsync(async () => {
    // a barcode seen before can be matched to the collection without asking Discogs
    const known = await releasesWithBarcode(barcode)
    const mine = known.length ? await db.collection.where('releaseId').anyOf(known).toArray() : []
    if (mine.length) return { results: [] as SearchResult[], copies: mine, pressings: [] as LibraryItem[] }

    const lookup = await lookupBarcode(barcode, {
      searchDiscogs: (p) => searchReleases(client, p).then((r) => r.results),
      searchMb: (b) => searchMbBarcode(b),
    })
    const results = 'results' in lookup ? lookup.results : []
    await rememberBarcode(
      barcode,
      results.map((r) => r.id),
    )
    const copies = await db.collection
      .where('releaseId')
      .anyOf(results.map((r) => r.id))
      .toArray()
    // barcodes differ between pressings, so the record in hand may be another pressing of an
    // album that's in the collection
    const masters = results.map((r) => r.master_id).filter((m): m is number => Boolean(m))
    const pressings = copies.length || !masters.length ? [] : await db.collection.where('masterId').anyOf(masters).toArray()
    return { results, copies, pressings }
  }, [barcode, client])

  // the demo searches signed out, which leaves out images; look those up
  const results = found.data?.results ?? []
  const covers = useSearchCovers(
    results.filter((r) => !r.thumb).map((r) => r.id),
    session.kind === 'demo',
  )
  const cards = results.map((r) => {
    const c = toCard(r)
    return c.thumb || !covers.has(c.id) ? c : { ...c, thumb: covers.get(c.id), cover: covers.get(c.id) }
  })

  // the crate an addition goes to: the last one used, as on a release page
  const folders = meta.data?.folders ?? []
  useEffect(() => {
    if (!folders.length || folderId) return
    getSetting<number>('lastFolderId').then((last) => setFolderId((f) => f ?? pickDefaultFolder(folders, last)))
  }, [folders, folderId])

  async function play(i: LibraryItem) {
    setChosen(i.instanceId)
    const p = await log(i)
    setPlayId(p?.id ?? null)
  }

  // one copy: log it straight away, once per barcode
  const copies = found.data?.copies
  useEffect(() => {
    if (copies?.length !== 1 || logged.current === barcode) return
    logged.current = barcode
    play(copies[0])
  }, [copies, barcode]) // play only needs to run once per barcode

  const item = useLiveQuery(() => (chosen ? db.collection.get(chosen) : undefined), [chosen])
  // undone from the toast: the play is gone
  const undone = useLiveQuery(async () => (playId ? !(await db.plays.get(playId)) : false), [playId])

  async function addAndPlay(r: SearchResult) {
    if (!folderId) return
    setAdding(r.id)
    setError(null)
    try {
      const release = await getRelease(client, r.id)
      const { instance_id } = await addToFolder(client, username, folderId, r.id)
      const added = itemFromRelease(release, instance_id, folderId)
      await db.collection.put(added)
      await setSetting('lastFolderId', folderId)
      rememberRelease(release)
      rememberLength(release)
      invalidateCollectionMeta()
      setAddedTo(folders.find((f) => f.id === folderId)?.name ?? 'your collection')
      await play(added)
    } catch (e) {
      setError(`Couldn't add it: ${(e as Error).message}`)
    } finally {
      setAdding(null)
    }
  }

  const scanLink = (label: string, variant: 'primary' | 'secondary' = 'primary') => (
    <Link href="/scan?mode=play" className={buttonClass(variant)}>
      <ScanBarcode size={18} aria-hidden />
      {label}
    </Link>
  )
  const buttons = 'mt-6 grid max-w-md grid-cols-2 gap-2'

  let body
  let backdrop: string | undefined
  if (found.loading) body = <Spinner label="Looking for your copy" />
  else if (found.error) body = <Notice tone="error">{found.error.message}</Notice>
  else if (item) {
    backdrop = item.cover ?? item.thumb
    body = (
      <Layout
        cover={item}
        title={item.title}
        artist={item.artist}
        status={
          undone ? (
            'Play undone'
          ) : (
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <Check size={16} aria-hidden />
              {addedTo ? `Added to ${addedTo} and logged` : 'Logged'}
            </span>
          )
        }
      >
        <PlaySummary item={item} className="mt-2 text-sm text-stone-500" />
        <div className={buttons}>
          {undone ? (
            <Button variant="secondary" onClick={() => play(item)}>
              Log it again
            </Button>
          ) : (
            <Link href={`/collection/${item.instanceId}`} className={buttonClass('secondary')}>
              Open record
            </Link>
          )}
          {scanLink('Scan next')}
        </div>
        <p className="mt-4">
          <DiscogsCredit url={`https://www.discogs.com/release/${item.releaseId}`} />
        </p>
      </Layout>
    )
  } else if (copies && copies.length > 1) {
    backdrop = copies[0].cover ?? copies[0].thumb
    body = (
      <Layout cover={copies[0]} title={copies[0].title} artist={copies[0].artist} status="You have more than one copy">
        <div className="mt-6">
          <Section title="Which one's on?">
            <ul className={rows}>
              {copies.map((c) => (
                <li key={c.instanceId}>
                  <RecordRow item={c} detail={[c.format, c.year || null].filter(Boolean).join(' · ')} onClick={() => play(c)} />
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </Layout>
    )
  } else if (cards.length) {
    const card = cards[0]
    const pressings = found.data?.pressings ?? []
    const several = cards.length > 1
    backdrop = card.cover ?? card.thumb
    body = (
      <Layout
        cover={card}
        title={card.title}
        artist={card.artist}
        status={pressings.length ? 'You have a different pressing' : 'Not in your collection'}
      >
        <p className="mt-1 text-sm text-stone-500">
          {several ? `${cards.length} pressings have this barcode` : [card.label, card.catno, where(card)].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-6 space-y-6">
          {pressings.length > 0 && (
            <Section title="In your collection">
              <ul className={rows}>
                {pressings.map((p) => (
                  <li key={p.instanceId}>
                    <RecordRow item={p} detail={[p.format, p.year || null].filter(Boolean).join(' · ')} onClick={() => play(p)}>
                      <span className="text-sm font-semibold">Log play</span>
                    </RecordRow>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section title="Add to your collection">
            <div className="space-y-3">
              <List>
                <Row label="Crate">
                  <CrateSelect
                    value={folderId}
                    folders={folders}
                    onChange={setFolderId}
                    onCreated={invalidateCollectionMeta}
                    disabled={!folders.length || adding !== null}
                    className={`${inline} cursor-pointer appearance-none [text-align-last:right]`}
                  />
                </Row>
              </List>
              {several ? (
                <>
                  <p className="px-1 text-sm text-stone-500">Which pressing is it? Tap yours to add it and log the play.</p>
                  <ul className={rows}>
                    {cards.map((c, i) => (
                      <li key={c.id}>
                        <RecordRow
                          item={{ instanceId: c.id, title: where(c) || c.title, artist: '', thumb: c.thumb }}
                          detail={[c.format, c.catno].filter(Boolean).join(' · ')}
                          onClick={() => addAndPlay(results[i])}
                        >
                          {adding === c.id ? (
                            <span className="block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            <span className="text-sm font-semibold">Add</span>
                          )}
                        </RecordRow>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <Button className="w-full max-w-md" disabled={!folderId || adding !== null} onClick={() => addAndPlay(results[0])}>
                  {adding !== null ? 'Adding…' : 'Add and log the play'}
                </Button>
              )}
              {error && <Notice tone="error">{error}</Notice>}
            </div>
          </Section>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {scanLink('Scan another', 'secondary')}
            <Link href={`/results?barcode=${barcode}`} className="text-sm text-stone-500 underline underline-offset-2">
              {several ? 'Compare the pressings' : 'Open the release'}
            </Link>
          </div>
        </div>
      </Layout>
    )
  } else {
    body = (
      <div className="max-w-md space-y-4">
        <Notice tone="info">Discogs doesn't know the barcode {formatBarcodeInput(barcode)}.</Notice>
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/results?barcode=${barcode}`} className={buttonClass('secondary')}>
            Look it up
          </Link>
          {scanLink('Scan another')}
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
