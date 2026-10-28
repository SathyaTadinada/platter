import { useLiveQuery } from 'dexie-react-hooks'
import { ExternalLink as ExternalIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { deleteInstance, editInstance, getRelease, setFieldValue } from '../api/discogs/endpoints'
import type { CollectionField, Release } from '../api/discogs/types'
import { CopyDetails } from '../components/CopyDetails'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { CoverSheet } from '../components/CoverSheet'
import { Identifiers } from '../components/Identifiers'
import { ListenLinks } from '../components/ListenLinks'
import { MarketPrice } from '../components/MarketPrice'
import { PlayButton } from '../components/PlayButton'
import { ShareButton } from '../components/ShareButton'
import { useProfile } from '../components/Profile'
import { Stars } from '../components/Stars'
import { Button, List, Notice, Screen, Section, Spinner, useBack } from '../components/ui'
import { db, type LibraryItem } from '../db/db'
import { invalidateCollectionMeta, useCollectionMeta } from '../hooks/useCollectionMeta'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { useFieldMatches } from '../hooks/useFields'
import { fieldFor } from '../lib/fields'
import { discogsUrl } from '../lib/format'
import { Cover } from '../components/Cover'
import { rememberRelease } from '../lib/barcodes'
import { rememberLength } from '../lib/stylus'

export function Record({ id }: { id: string }) {
  const instanceId = Number(id)
  const { client, username } = useSignedIn()
  const back = useBack('/')
  const [, navigate] = useLocation()
  const item = useLiveQuery(() => db.collection.get(instanceId), [instanceId])
  const original = useLiveQuery(async () => (item?.masterId ? (await db.masters.get(item.masterId))?.year : 0), [item?.masterId])
  const meta = useCollectionMeta()
  const matches = useFieldMatches()
  const currency = useProfile()?.curr_abbr ?? 'USD'
  const mediaField = matches ? fieldFor(matches, 'mediaCondition')?.id : undefined
  const release = useAsync(async () => {
    if (!item) return undefined
    const r = await getRelease(client, item.releaseId)
    rememberRelease(r) // so scanning this record later in Play mode needs no search
    rememberLength(r)
    return r
  }, [item?.releaseId])
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [pickingCover, setPickingCover] = useState(false)

  // other copies of this release, and other pressings of the same album
  const related = useLiveQuery(async () => {
    if (!item) return { copies: [] as LibraryItem[], pressings: [] as LibraryItem[] }
    const copies = await db.collection.where('releaseId').equals(item.releaseId).toArray()
    const pressings = item.masterId ? await db.collection.where('masterId').equals(item.masterId).toArray() : []
    return {
      copies: copies.filter((c) => c.instanceId !== item.instanceId),
      pressings: pressings.filter((p) => p.releaseId !== item.releaseId),
    }
  }, [item?.instanceId, item?.releaseId, item?.masterId])

  if (item === undefined) {
    return (
      <Screen title="" back={back} width="full">
        <Spinner />
      </Screen>
    )
  }
  if (item === null || !item) {
    return (
      <Screen title="Not found" back={back}>
        <Notice tone="info">This record isn't in your collection anymore.</Notice>
      </Screen>
    )
  }

  const target = { folderId: item.folderId, releaseId: item.releaseId, instanceId: item.instanceId }

  // Optimistic: update locally, roll back if Discogs says no
  async function save(patch: Partial<LibraryItem>, send: () => Promise<unknown>) {
    const before = { ...item! }
    setError(null)
    await db.collection.update(instanceId, patch)
    try {
      await send()
    } catch (e) {
      await db.collection.put(before)
      setError((e as Error).message)
    }
  }

  const setRating = (rating: number) => save({ rating }, () => editInstance(client, username, target, { rating }))
  const moveTo = (folderId: number) =>
    save({ folderId }, async () => {
      await editInstance(client, username, target, { folder_id: folderId })
      invalidateCollectionMeta()
    })
  const lastPlayed = matches ? fieldFor(matches, 'lastPlayed')?.id : undefined
  const setField = (field: CollectionField, value: string) => {
    const changes: Record<number, string> = { [field.id]: value }
    // a play count turned down to 0 hasn't been played, so it has no last-played date
    if (
      field.id === (matches ? fieldFor(matches, 'playCount')?.id : undefined) &&
      (!value || value === '0') &&
      lastPlayed &&
      item.fields[lastPlayed]
    )
      changes[lastPlayed] = ''
    return save({ fields: { ...item.fields, ...changes } }, async () => {
      for (const [id, v] of Object.entries(changes)) await setFieldValue(client, username, target, Number(id), v)
    })
  }

  async function remove() {
    setError(null)
    setRemoving(true)
    try {
      await deleteInstance(client, username, target)
      await db.collection.delete(instanceId)
      invalidateCollectionMeta()
      navigate('/', { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setConfirmRemove(false)
    } finally {
      setRemoving(false)
    }
  }

  const r = release.data
  const url = discogsUrl(r?.uri ?? `/release/${item.releaseId}`)
  const pressed = Number(r?.released?.slice(0, 4)) || item.year
  // a reissue's year is when it was pressed; the album's own year goes beside it
  const first = original && original !== pressed ? original : 0
  const when = pressed ? (first ? `${pressed} (originally ${first})` : String(pressed)) : first ? `originally ${first}` : null
  const where = [r?.country, when].filter(Boolean).join(' · ')
  const canPickCover = (r?.images?.length ?? 0) > 1 || Boolean(item.originalCover)

  const tracklist = (
    <Section title="Tracklist">
      {release.loading && !r ? (
        <Spinner label="Loading tracklist" />
      ) : r ? (
        <Tracklist release={r} />
      ) : (
        <p className="text-sm text-stone-500">Tracklist isn't available right now.</p>
      )}
    </Section>
  )

  return (
    <Screen
      title={item.title}
      back={back}
      width="wide"
      backdrop={item.cover ?? item.thumb}
      actions={<ShareButton url={url} title={`${item.artist} – ${item.title}`} />}
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,17rem)_1fr] lg:gap-8 xl:grid-cols-[minmax(0,22rem)_1fr] xl:gap-10">
        {/* on wide screens the tracklist sits under the cover so the column isn't empty */}
        <div className="space-y-6">
          <div>
            <Cover item={item} className="mx-auto aspect-square w-full max-w-sm rounded-2xl shadow-xl ring-1 ring-black/10" />
            {canPickCover && (
              <button
                type="button"
                onClick={() => setPickingCover(true)}
                className="mx-auto mt-3 block rounded-full bg-stone-900/5 px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-900/10 dark:bg-white/10 dark:text-stone-300 dark:hover:bg-white/15"
              >
                Change cover
              </button>
            )}
          </div>
          <div className="hidden lg:block">{tracklist}</div>
        </div>

        <div className="mt-6 min-w-0 lg:mt-0">
          <h2 className="text-2xl font-bold tracking-tight lg:text-3xl">{item.title}</h2>
          <p className="text-lg text-stone-600 dark:text-stone-300">{item.artist}</p>
          <div className="mt-2 space-y-0.5 text-sm text-stone-500">
            {(item.label || item.catno) && <p>{[item.label, item.catno].filter(Boolean).join(' · ')}</p>}
            {where && <p>{where}</p>}
            {item.format && <p>{item.format}</p>}
          </div>

          {(item.genres.length > 0 || item.styles.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[...item.genres.map((g) => ['genre', g]), ...item.styles.map((s) => ['style', s])].map(([k, v]) => (
                <Link
                  key={`${k}${v}`}
                  href={`/?${k}=${encodeURIComponent(v)}`}
                  className="rounded-full bg-stone-900/5 px-2.5 py-1 text-xs font-medium hover:bg-stone-900/10 dark:bg-white/10 dark:hover:bg-white/15"
                >
                  {v}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-4 space-y-3">
            <Stars value={item.rating} onChange={setRating} />
            <PlayButton item={item} />
            <ListenLinks releaseId={item.releaseId} artist={item.artist} title={item.title} identifiers={r?.identifiers} />
          </div>

          {error && (
            <div className="mt-4">
              <Notice tone="error">{error}</Notice>
            </div>
          )}

          <div className="mt-6">
            <Section title="Your copy">
              {meta.data ? (
                <CopyDetails
                  item={item}
                  folders={meta.data.folders}
                  fields={meta.data.fields}
                  matches={matches}
                  currency={currency}
                  onMove={moveTo}
                  onSetField={setField}
                />
              ) : (
                <Spinner label="Loading your fields" />
              )}
            </Section>

            <Section title="Market">
              <MarketPrice releaseId={item.releaseId} mediaCondition={mediaField !== undefined ? item.fields[mediaField] : undefined} />
            </Section>

            {related?.copies.length || related?.pressings.length ? (
              <Section title="Also in your collection">
                <List>
                  {[...related.copies, ...related.pressings].map((o) => (
                    <li key={o.instanceId}>
                      <Link
                        href={`/collection/${o.instanceId}`}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50"
                      >
                        <Cover item={o} small className="size-11 shrink-0 rounded-md" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {o.releaseId === item.releaseId ? 'Another copy of this pressing' : o.format || 'Another pressing'}
                          </p>
                          <p className="truncate text-xs text-stone-500">
                            {[o.label, o.catno, o.year || null].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </List>
              </Section>
            ) : null}

            {/* shown even when empty, so a pressing with nothing listed doesn't look like a missing section */}
            {r && (
              <Section title="Identifiers">
                <Identifiers identifiers={r.identifiers ?? []} />
              </Section>
            )}

            <div className="lg:hidden">{tracklist}</div>

            <Section>
              <a
                href={url}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 text-sm text-stone-500 underline underline-offset-2"
              >
                Data provided by Discogs.
                <ExternalIcon size={14} aria-hidden />
              </a>
            </Section>

            <Section>
              <Button variant="destructive" className="w-full" onClick={() => setConfirmRemove(true)}>
                Remove from collection
              </Button>
            </Section>
          </div>
        </div>
      </div>
      {pickingCover && <CoverSheet item={item} release={r} onClose={() => setPickingCover(false)} />}
      {confirmRemove && (
        <ConfirmDialog
          title="Remove this record?"
          action="Remove"
          busy={removing ? 'Removing…' : null}
          onConfirm={remove}
          onCancel={() => setConfirmRemove(false)}
        >
          This removes it from your Discogs collection, including its notes and other details.
        </ConfirmDialog>
      )}
    </Screen>
  )
}

export function Tracklist({ release }: { release: Release }) {
  const tracks = release.tracklist ?? []
  if (!tracks.length) return <p className="text-sm text-stone-500">No tracklist on Discogs.</p>
  return (
    <ol className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      {tracks.map((t, i) =>
        t.type_ === 'heading' ? (
          <li key={i} className="bg-stone-50 px-4 py-2 text-xs font-semibold tracking-wide text-stone-500 uppercase dark:bg-stone-950/50">
            {t.title}
          </li>
        ) : (
          <li key={i} className="flex gap-3 border-t border-stone-100 px-4 py-2 text-sm first:border-t-0 dark:border-stone-800">
            <span className="w-8 shrink-0 text-stone-500 tabular-nums">{t.position}</span>
            <span className="min-w-0 flex-1">{t.title}</span>
            {t.duration && <span className="shrink-0 text-stone-500 tabular-nums">{t.duration}</span>}
          </li>
        ),
      )}
    </ol>
  )
}
