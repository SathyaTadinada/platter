import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Heart, ScanBarcode } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'wouter'
import { addWant, getOwnedInstances, getRelease, removeWant } from '../api/discogs/endpoints'
import { AddForm, type Added } from '../components/AddForm'
import { DiscogsCredit } from '../components/ReleaseCardView'
import { Identifiers } from '../components/Identifiers'
import { ListenLinks } from '../components/ListenLinks'
import { MarketPrice } from '../components/MarketPrice'
import { PhotosSheet } from '../components/PhotosSheet'
import { ShareButton } from '../components/ShareButton'
import { toast } from '../components/Toaster'
import { RecordRow, statCard } from '../components/stats'
import { buttonClass, IconButton, Notice, Screen, Section, Spinner, useBack } from '../components/ui'
import { db } from '../db/db'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { cleanLabel, discogsUrl } from '../lib/format'
import { joinArtists, wantFromRelease } from '../lib/library'
import { Cover } from '../components/Cover'
import { Tracklist } from './Record'

// A Discogs release you looked up: everything the record page shows, plus adding it
export function Release({ id }: { id: string }) {
  const releaseId = Number(id)
  const { client, username } = useSignedIn()
  const back = useBack('/search')
  const release = useAsync(() => getRelease(client, releaseId), [client, releaseId])
  const [added, setAdded] = useState<Added | null>(null)
  const [wantBusy, setWantBusy] = useState(false)
  const [viewingPhotos, setViewingPhotos] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const r = release.data
  const own = useLiveQuery(async () => {
    const copies = await db.collection.where('releaseId').equals(releaseId).toArray()
    const pressings = r?.master_id
      ? (await db.collection.where('masterId').equals(r.master_id).toArray()).filter((p) => p.releaseId !== releaseId)
      : []
    const wanted = Boolean(await db.wants.get(releaseId))
    return { copies, pressings, wanted }
  }, [releaseId, r?.master_id])
  // the local index might be a few hours old; check this one live too
  const live = useAsync(() => getOwnedInstances(client, username, releaseId).catch(() => null), [releaseId])
  const copyCount = Math.max(own?.copies.length ?? 0, live.data?.releases.length ?? 0)

  async function toggleWant() {
    if (!r) return
    setWantBusy(true)
    setError(null)
    try {
      if (own?.wanted) {
        await removeWant(client, username, releaseId)
        await db.wants.delete(releaseId)
        toast('Removed from your wantlist')
      } else {
        await addWant(client, username, releaseId)
        await db.wants.put(wantFromRelease(r))
        toast('Added to your wantlist', { tone: 'success' })
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setWantBusy(false)
    }
  }

  if (release.loading && !r) {
    return (
      <Screen title="" back={back}>
        <Spinner />
      </Screen>
    )
  }
  if (!r) {
    return (
      <Screen title="Release" back={back}>
        <Notice tone="error">{release.error?.message ?? "Couldn't load this release."}</Notice>
      </Screen>
    )
  }

  const item = { cover: r.images?.[0]?.uri, thumb: r.images?.[0]?.uri150 ?? r.thumb }
  const label = r.labels?.[0]
  const digital = (r.formats ?? []).length > 0 && r.formats.every((f) => f.name === 'File')
  const where = [r.country, r.released?.slice(0, 4) || r.year || null].filter(Boolean).join(' · ')
  const format = r.formats
    ?.map((f) =>
      [f.qty && Number(f.qty) > 1 ? `${f.qty}× ${f.name}` : f.name, ...(f.descriptions ?? []), f.text].filter(Boolean).join(', '),
    )
    .join(' + ')

  const tracklist = (
    <Section title="Tracklist">
      <Tracklist release={r} />
    </Section>
  )

  return (
    <Screen
      title={r.title}
      back={back}
      width="wide"
      backdrop={item.cover ?? item.thumb}
      actions={
        <>
          <IconButton
            label={own?.wanted ? 'Remove from wantlist' : 'Add to wantlist'}
            aria-pressed={own?.wanted}
            disabled={wantBusy}
            onClick={toggleWant}
          >
            <Heart size={20} className={own?.wanted ? 'fill-current text-red-500' : ''} />
          </IconButton>
          <ShareButton url={discogsUrl(r.uri)} title={`${joinArtists(r.artists)} – ${r.title}`} />
        </>
      }
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,17rem)_1fr] lg:gap-8 xl:grid-cols-[minmax(0,22rem)_1fr] xl:gap-10">
        <div className="space-y-6">
          <div>
            <Cover item={item} className="mx-auto aspect-square w-full max-w-sm rounded-2xl shadow-xl ring-1 ring-black/10" />
            {(r.images?.length ?? 0) > 1 && (
              <button
                type="button"
                onClick={() => setViewingPhotos(true)}
                className="mx-auto mt-3 block rounded-full bg-stone-900/5 px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-900/10 dark:bg-white/10 dark:text-stone-300 dark:hover:bg-white/15"
              >
                {r.images!.length} photos
              </button>
            )}
          </div>
          <div className="hidden lg:block">{tracklist}</div>
        </div>

        <div className="mt-6 min-w-0 lg:mt-0">
          <h2 className="text-2xl font-bold tracking-tight lg:text-3xl">{r.title}</h2>
          <p className="text-lg text-stone-600 dark:text-stone-300">{joinArtists(r.artists)}</p>
          <div className="mt-2 space-y-0.5 text-sm text-stone-500">
            {label && <p>{[cleanLabel(label.name), label.catno !== 'none' && label.catno].filter(Boolean).join(' · ')}</p>}
            {where && <p>{where}</p>}
            {format && <p>{format}</p>}
          </div>
          {(r.genres?.length || r.styles?.length) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[...(r.genres ?? []), ...(r.styles ?? [])].map((g) => (
                <span key={g} className="rounded-full bg-stone-900/5 px-2.5 py-1 text-xs font-medium dark:bg-white/10">
                  {g}
                </span>
              ))}
            </div>
          )}

          {copyCount > 0 && (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent-100 px-3 py-1.5 text-sm font-medium text-accent dark:bg-accent/20">
              <Check size={16} aria-hidden />
              {copyCount > 1 ? `You own ${copyCount} copies` : 'You own this'}
            </p>
          )}
          <div className="mt-4">
            <ListenLinks releaseId={releaseId} artist={joinArtists(r.artists)} title={r.title} identifiers={r.identifiers} />
          </div>
          {error && (
            <div className="mt-3">
              <Notice tone="error">{error}</Notice>
            </div>
          )}

          <div className="mt-6">
            {own?.copies.length || own?.pressings.length ? (
              <Section title="In your collection">
                <ul className={`divide-y divide-stone-200 overflow-hidden dark:divide-stone-800 ${statCard}`}>
                  {[...own.copies, ...own.pressings].map((o) => (
                    <li key={o.instanceId}>
                      <RecordRow
                        item={o}
                        detail={
                          o.releaseId === releaseId
                            ? 'This pressing'
                            : [o.label, o.catno, o.year || null].filter(Boolean).join(' · ') || 'Another pressing'
                        }
                      />
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            <Section title={copyCount ? 'Add another copy' : 'Add to your collection'}>
              {added ? (
                <div className="space-y-3">
                  <Notice tone="success">Added to {added.folder}.</Notice>
                  {added.problems.length > 0 && <Notice tone="warn">Some details didn't save: {added.problems.join('; ')}</Notice>}
                  {own?.wanted && (
                    <Notice tone="info">
                      This was on your wantlist.{' '}
                      <button type="button" disabled={wantBusy} onClick={toggleWant} className="font-semibold underline">
                        Remove it
                      </button>
                    </Notice>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Link href={`/collection/${added.instanceId}`} className={buttonClass('secondary')}>
                      Open it
                    </Link>
                    <Link href="/scan" className={buttonClass('primary')}>
                      <ScanBarcode size={18} aria-hidden />
                      Scan next
                    </Link>
                  </div>
                </div>
              ) : (
                <AddForm release={r} onAdded={setAdded} />
              )}
            </Section>

            <Section title="Market">
              {digital ? (
                <p className="px-1 text-sm text-stone-500">Digital releases can't be sold on Discogs.</p>
              ) : (
                <MarketPrice releaseId={releaseId} />
              )}
            </Section>

            {(r.identifiers?.length ?? 0) > 0 && (
              <Section title="Identifiers">
                <Identifiers identifiers={r.identifiers} />
              </Section>
            )}

            <div className="lg:hidden">{tracklist}</div>

            <Section>
              <DiscogsCredit url={discogsUrl(r.uri)} />
            </Section>
          </div>
        </div>
      </div>
      {viewingPhotos && <PhotosSheet release={r} onClose={() => setViewingPhotos(false)} />}
    </Screen>
  )
}
