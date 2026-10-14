import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ExternalLink as ExternalIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { deleteInstance, editInstance, getRelease, setFieldValue } from '../api/discogs/endpoints'
import type { CollectionField, Release } from '../api/discogs/types'
import { Stars } from '../components/Stars'
import { Button, Notice, Screen, Section, Spinner, useBack } from '../components/ui'
import { db, type LibraryItem } from '../db/db'
import { invalidateCollectionMeta, useCollectionMeta } from '../hooks/useCollectionMeta'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { discogsUrl } from '../lib/format'
import { Cover } from './Library'

export function Record({ id }: { id: string }) {
  const instanceId = Number(id)
  const { client, username } = useSignedIn()
  const back = useBack('/')
  const [, navigate] = useLocation()
  const item = useLiveQuery(() => db.collection.get(instanceId), [instanceId])
  const meta = useCollectionMeta()
  const release = useAsync(() => (item ? getRelease(client, item.releaseId) : Promise.resolve(undefined)), [item?.releaseId])
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

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

  if (item === undefined) return <Spinner />
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
  const setField = (field: CollectionField, value: string) =>
    save({ fields: { ...item.fields, [field.id]: value } }, () => setFieldValue(client, username, target, field.id, value))

  async function remove() {
    setError(null)
    try {
      await deleteInstance(client, username, target)
      await db.collection.delete(instanceId)
      invalidateCollectionMeta()
      navigate('/', { replace: true })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const r = release.data
  const url = discogsUrl(r?.uri ?? `/release/${item.releaseId}`)
  const where = [r?.country, r?.released?.slice(0, 4) || item.year || null].filter(Boolean).join(' · ')
  const added = new Date(item.dateAdded)

  return (
    <Screen title={item.title} back={back} width="wide">
      <div className="lg:grid lg:grid-cols-[22rem_1fr] lg:gap-10">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Cover item={item} className="mx-auto aspect-square w-full max-w-sm rounded-2xl shadow-md ring-1 ring-black/5" />
        </div>

        <div className="mt-5 min-w-0 lg:mt-0">
          <h2 className="text-2xl font-bold tracking-tight">{item.title}</h2>
          <p className="text-lg text-stone-600 dark:text-stone-400">{item.artist}</p>
          <div className="mt-2 space-y-0.5 text-sm text-stone-500">
            {(item.label || item.catno) && <p>{[item.label, item.catno].filter(Boolean).join(' · ')}</p>}
            {where && <p>{where}</p>}
            {item.format && <p>{item.format}</p>}
          </div>

          {(item.genres.length > 0 || item.styles.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.genres.map((g) => (
                <Link key={g} href={`/?genre=${encodeURIComponent(g)}`} className="rounded-full bg-stone-200 px-2.5 py-1 text-xs font-medium dark:bg-stone-800">
                  {g}
                </Link>
              ))}
              {item.styles.map((s) => (
                <Link key={s} href={`/?style=${encodeURIComponent(s)}`} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs dark:bg-stone-900">
                  {s}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-4">
            <Stars value={item.rating} onChange={setRating} />
          </div>

          {error && (
            <div className="mt-4">
              <Notice tone="error">{error}</Notice>
            </div>
          )}

          <div className="mt-6">
            <Section title="Your copy">
              <div className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
                <FieldRow label="Folder">
                  <select
                    value={item.folderId}
                    onChange={(e) => moveTo(Number(e.target.value))}
                    className="max-w-[60%] truncate bg-transparent text-right text-stone-600 dark:text-stone-300"
                  >
                    {(meta.data?.folders ?? [{ id: item.folderId, name: 'Current folder', count: 0 }]).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </FieldRow>
                <FieldRow label="Added">
                  <span className="text-stone-600 dark:text-stone-300">
                    {Number.isNaN(added.getTime()) ? '' : added.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </FieldRow>
                {meta.data?.fields.map((f) => <FieldEditor key={f.id} field={f} value={item.fields[f.id] ?? ''} onSave={(v) => setField(f, v)} />)}
              </div>
              {meta.loading && !meta.data && <p className="text-sm text-stone-500">Loading your fields…</p>}
            </Section>

            {(related?.copies.length || related?.pressings.length) ? (
              <Section title="Also in your collection">
                <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
                  {[...related.copies, ...related.pressings].map((o) => (
                    <li key={o.instanceId}>
                      <Link href={`/library/${o.instanceId}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50">
                        <Cover item={o} small className="size-11 shrink-0 rounded-md" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{o.releaseId === item.releaseId ? 'Another copy of this pressing' : o.format || 'Another pressing'}</p>
                          <p className="truncate text-xs text-stone-500">{[o.label, o.catno, o.year || null].filter(Boolean).join(' · ')}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            <Section title="Tracklist">
              {release.loading && !r ? <Spinner label="Loading tracklist" /> : r ? <Tracklist release={r} /> : <p className="text-sm text-stone-500">Couldn't load the tracklist.</p>}
            </Section>

            <Section>
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <a href={url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
                  View on Discogs <ExternalIcon size={14} aria-hidden />
                </a>
                <a href={url} target="_blank" rel="noopener" className="text-stone-500 underline underline-offset-2">
                  Data provided by Discogs.
                </a>
              </div>
            </Section>

            <Section>
              {confirmRemove ? (
                <div className="space-y-3 rounded-2xl bg-red-50 p-4 dark:bg-red-950/40">
                  <p className="text-sm">Remove this copy from your Discogs collection? Its field values go with it.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
                      Cancel
                    </Button>
                    <Button variant="danger" onClick={remove}>
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" className="w-full text-red-600! dark:text-red-400!" onClick={() => setConfirmRemove(true)}>
                  Remove from collection
                </Button>
              )}
            </Section>
          </div>
        </div>
      </div>
    </Screen>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
      <span className="shrink-0">{label}</span>
      {children}
    </div>
  )
}

// Dropdown fields save on change, text fields when you leave them
function FieldEditor({ field, value, onSave }: { field: CollectionField; value: string; onSave: (v: string) => Promise<void> }) {
  const [draft, setDraft] = useState(value)
  const [saved, setSaved] = useState(false)
  useEffect(() => setDraft(value), [value])

  async function commit(v: string) {
    if (v === value) return
    await onSave(v)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <FieldRow label={field.name}>
      <span className="flex min-w-0 items-center gap-1.5">
        {saved && <Check size={16} className="shrink-0 text-emerald-600" aria-label="Saved" />}
        {field.type === 'dropdown' ? (
          <select
            value={value}
            onChange={(e) => commit(e.target.value)}
            className="max-w-full truncate bg-transparent text-right text-stone-600 dark:text-stone-300"
            aria-label={field.name}
          >
            <option value="">Not set</option>
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(draft.trim())}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder="Add"
            aria-label={field.name}
            className="w-full min-w-0 bg-transparent text-right text-stone-600 placeholder:text-stone-400 dark:text-stone-300"
          />
        )}
      </span>
    </FieldRow>
  )
}

function Tracklist({ release }: { release: Release }) {
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
