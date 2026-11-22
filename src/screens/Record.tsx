import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useLocation } from 'wouter'
import { deleteInstance, editInstance, getRelease, removeWant, setFieldValue } from '../api/discogs/endpoints'
import type { CollectionField } from '../api/discogs/types'
import { CopyDetails } from '../components/CopyDetails'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MarketPrice } from '../components/MarketPrice'
import { PlayButton } from '../components/PlayButton'
import { RecordLayout, YourCopies } from '../components/RecordLayout'
import { ShareButton } from '../components/ShareButton'
import { useProfile } from '../components/Profile'
import { Stars } from '../components/Stars'
import { Button, Notice, Screen, Section, Spinner, useBack } from '../components/ui'
import { db, type LibraryItem } from '../db/db'
import { invalidateCollectionMeta, useCollectionMeta } from '../hooks/useCollectionMeta'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { useFieldMatches } from '../hooks/useFields'
import { fieldFor } from '../lib/fields'
import { discogsUrl } from '../lib/format'
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
  const wanted = useLiveQuery(async () => (item ? Boolean(await db.wants.get(item.releaseId)) : false), [item?.releaseId])

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

  async function dropWant() {
    setError(null)
    try {
      await removeWant(client, username, item!.releaseId)
      await db.wants.delete(item!.releaseId)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Screen
      title={item.title}
      back={back}
      width="wide"
      backdrop={item.cover ?? item.thumb}
      actions={<ShareButton url={url} title={`${item.artist} – ${item.title}`} />}
    >
      <RecordLayout
        releaseId={item.releaseId}
        release={r}
        loading={release.loading}
        loadPhotos={() => getRelease(client, item.releaseId, { photos: true })}
        cover={item}
        own={item}
        title={item.title}
        artist={item.artist}
        details={[(item.label || item.catno) && [item.label, item.catno].filter(Boolean).join(' · '), where, item.format]}
        tags={[
          ...item.genres.map((g) => ({ label: g, href: `/?genre=${encodeURIComponent(g)}` })),
          ...item.styles.map((s) => ({ label: s, href: `/?style=${encodeURIComponent(s)}` })),
        ]}
        extra={
          <>
            <Stars value={item.rating} onChange={setRating} />
            <PlayButton item={item} />
          </>
        }
        error={error}
        url={url}
        after={
          <Section>
            <Button variant="destructive" className="w-full" onClick={() => setConfirmRemove(true)}>
              Remove from collection
            </Button>
          </Section>
        }
      >
        {/* owning it now, it may still be on the wantlist from before */}
        {wanted && (
          <Section>
            <Notice tone="info">
              This is still on your wantlist.{' '}
              <button type="button" onClick={dropWant} className="font-semibold underline">
                Take it off
              </button>
            </Notice>
          </Section>
        )}
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

        <YourCopies
          title="Also in your collection"
          items={[...(related?.copies ?? []), ...(related?.pressings ?? [])]}
          releaseId={item.releaseId}
          same="Another copy of this pressing"
        />
      </RecordLayout>
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
