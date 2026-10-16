import { useLiveQuery } from 'dexie-react-hooks'
import { Disc3 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'wouter'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { CrateSelect } from '../components/CrateSelect'
import { inline } from '../components/CopyDetails'
import { MetadataForm } from '../components/MetadataForm'
import { useProfile } from '../components/Profile'
import { DiscogsCredit } from '../components/ReleaseCardView'
import { ResolveSheet } from '../components/ResolveSheet'
import { Button, buttonClass, List, Notice, Screen, Section } from '../components/ui'
import { db, getSetting, setSetting, type QueueItem } from '../db/db'
import { useCollectionMeta } from '../hooks/useCollectionMeta'
import { useSignedIn } from '../hooks/session'
import { SHARED_KEY, useQueue } from '../hooks/queue'
import { useFieldMatches } from '../hooks/useFields'
import type { Metadata } from '../lib/metadata'
import { chooseRelease, retryFailed } from '../lib/queue'
import { Row } from './batch/BatchRow'
import { DetailsSheet } from './batch/DetailsSheet'

const needsYou = (i: QueueItem) => i.status === 'choose' || i.status === 'notfound' || i.status === 'failed'
const inFlight = (i: QueueItem) => i.status === 'pending' || i.status === 'looking'

export function Batch() {
  const { username } = useSignedIn()
  const items = useLiveQuery(() => db.queue.orderBy('createdAt').toArray(), [])
  const owned = useLiveQuery(async () => {
    const all = await db.collection.toArray()
    return { releases: new Set(all.map((c) => c.releaseId)), masters: new Set(all.map((c) => c.masterId).filter(Boolean)) }
  }, [])
  const wants = useLiveQuery(async () => new Set((await db.wants.toArray()).map((w) => w.releaseId)), [])
  const { run, online, kick, startAdding } = useQueue()
  const meta = useCollectionMeta()
  const [folderId, setFolderId] = useState<number>()
  const [dropWants, setDropWants] = useState(true)
  const [resolving, setResolving] = useState<QueueItem | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [editing, setEditing] = useState<QueueItem | null>(null)
  const matches = useFieldMatches()
  const currency = useProfile()?.curr_abbr ?? 'USD'
  // local copy so fast typing never writes back a stale value; saved as it changes
  const [shared, setShared] = useState<Metadata | null>(null)
  useEffect(() => {
    getSetting<Metadata>(SHARED_KEY).then((m) => setShared(m ?? {}))
  }, [])
  const updateShared = (m: Metadata) => {
    setShared(m)
    setSetting(SHARED_KEY, m)
  }

  const folders = meta.data?.folders ?? []

  useEffect(() => {
    if (folderId !== undefined || !folders.length) return
    getSetting<number>('lastFolderId').then((last) =>
      setFolderId(folders.some((f) => f.id === last) ? last : (folders.find((f) => f.name === 'Uncategorized') ?? folders[0]).id),
    )
  }, [folders, folderId])

  const groups = useMemo(() => {
    const list = items ?? []
    return {
      attention: list.filter(needsYou),
      waiting: list.filter(inFlight),
      ready: list.filter((i) => i.status === 'ready' || i.status === 'adding'),
      added: list.filter((i) => i.status === 'added').reverse(), // newest first
    }
  }, [items])

  // the batch crate first, then any crates individual records were moved to
  const readyByCrate = (() => {
    const by = new Map<number | undefined, QueueItem[]>()
    for (const i of groups.ready) {
      const f = i.folderId ?? folderId
      by.set(f, [...(by.get(f) ?? []), i])
    }
    return [...by]
      .sort(([a], [b]) => Number(b === folderId) - Number(a === folderId))
      .map(([id, items]) => ({ folder: folders.find((f) => f.id === id), items }))
  })()

  // the same barcode twice in one batch is usually a double scan
  const dupes = useMemo(() => {
    const seen = new Map<string, number>()
    for (const i of items ?? []) if (i.barcode && i.status !== 'added') seen.set(i.barcode, (seen.get(i.barcode) ?? 0) + 1)
    return new Set([...seen].filter(([, n]) => n > 1).map(([b]) => b))
  }, [items])

  const readyWanted = groups.ready.filter((i) => i.release && wants?.has(i.release.id)).length
  const adding = run?.kind === 'add'

  async function remove(id: number) {
    await db.queue.delete(id)
  }

  async function clear(which: 'added' | 'all') {
    if (which === 'added') await db.queue.where('status').equals('added').delete()
    else await db.queue.clear()
    // an empty batch starts over, so yesterday's store doesn't carry into today's
    if (!(await db.queue.count())) updateShared({})
    setConfirmClear(false)
  }

  const actions = items?.length ? (
    <>
      {groups.added.length > 0 && (
        <button type="button" onClick={() => clear('added')} className="rounded-lg px-2 py-1.5 text-sm font-medium">
          Clear added
        </button>
      )}
      <button
        type="button"
        onClick={() => setConfirmClear(true)}
        className="rounded-lg px-2 py-1.5 text-sm font-medium text-red-600 dark:text-red-400"
      >
        Clear all
      </button>
    </>
  ) : null

  if (items && !items.length) {
    return (
      <Screen title="Batch" back="/scan" width="full">
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Disc3 size={48} className="text-stone-400" aria-hidden />
          <p className="text-lg font-semibold">Batch is empty</p>
          <p className="max-w-xs text-balance text-stone-500">
            Scan several records in a row and add them together, or import a collection.
          </p>
          <div className="mt-2 flex gap-2">
            <Link href="/scan?mode=batch" className={buttonClass('primary')}>
              Start scanning
            </Link>
            <Link href="/import" className={buttonClass('secondary')}>
              Import collection
            </Link>
          </div>
        </div>
      </Screen>
    )
  }

  return (
    <Screen title="Batch" back="/scan" width="wide" actions={actions} fill>
      {confirmClear && (
        <ConfirmDialog title="Clear the batch?" action="Clear" onConfirm={() => clear('all')} onCancel={() => setConfirmClear(false)}>
          Records already added stay in your collection.
        </ConfirmDialog>
      )}

      {!online && groups.waiting.length > 0 && (
        <div className="mb-4">
          <Notice tone="info">
            Offline. {groups.waiting.length} scan{groups.waiting.length === 1 ? '' : 's'} will be looked up when you reconnect.
          </Notice>
        </div>
      )}

      {groups.attention.length > 0 && (
        <Section title={`Check these (${groups.attention.length})`}>
          <List>
            {groups.attention.map((i) => (
              <Row
                key={i.id}
                item={i}
                dupe={dupes.has(i.barcode ?? '')}
                onResolve={() => setResolving(i)}
                onRemove={() => remove(i.id!)}
                onRetry={() => retryFailed().then(kick)}
              />
            ))}
          </List>
        </Section>
      )}

      {groups.waiting.length > 0 && (
        <Section title={`Looking up (${groups.waiting.length})`}>
          <List>
            {groups.waiting.map((i) => (
              <Row key={i.id} item={i} dupe={dupes.has(i.barcode ?? '')} online={online} onRemove={() => remove(i.id!)} />
            ))}
          </List>
        </Section>
      )}

      {groups.ready.length > 0 && (
        <Section title={`Ready to add (${groups.ready.length})`}>
          {readyByCrate.map(({ folder, items: list }) => (
            <div key={folder?.id ?? 'batch'}>
              {/* only split up once records go to more than one crate */}
              {readyByCrate.length > 1 && (
                <p className="mb-1.5 px-1 text-sm font-medium">
                  {folder?.name ?? 'Crate'} <span className="font-normal text-stone-500">· {list.length}</span>
                </p>
              )}
              <List>
                {list.map((i) => (
                  <Row
                    key={i.id}
                    item={i}
                    dupe={dupes.has(i.barcode ?? '')}
                    ownedExact={Boolean(i.release && owned?.releases.has(i.release.id))}
                    ownedOther={Boolean(
                      i.release?.masterId && owned?.masters.has(i.release.masterId) && !owned?.releases.has(i.release.id),
                    )}
                    wanted={Boolean(i.release && wants?.has(i.release.id))}
                    onResolve={i.candidates && i.candidates.length > 1 ? () => setResolving(i) : undefined}
                    onRemove={adding ? undefined : () => remove(i.id!)}
                    onEdit={adding || i.source === 'csv' ? undefined : () => setEditing(i)}
                    currency={currency}
                  />
                ))}
              </List>
            </div>
          ))}
          {shared && groups.ready.some((i) => i.source !== 'csv') && (
            <div className="pt-3">
              <div className="mb-2 px-1">
                <p className="text-sm font-medium">For all records</p>
                <p className="text-xs text-stone-500">Each record above gets these unless you set its own.</p>
              </div>
              <MetadataForm value={shared} onChange={updateShared} matches={matches} parts={['date', 'store', 'location']} />
            </div>
          )}
        </Section>
      )}

      {groups.added.length > 0 && (
        <Section title={`Added (${groups.added.length})`}>
          <List>
            {groups.added.map((i) => (
              <Row key={i.id} item={i} onRemove={() => remove(i.id!)} />
            ))}
          </List>
        </Section>
      )}

      {groups.ready.length > 0 && (
        <div className="sticky bottom-3 z-10 mt-auto pt-4">
          <div className="mx-auto max-w-lg space-y-3 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-700">
            <label className="flex items-center gap-3 pl-1 text-sm">
              <span className="shrink-0 text-stone-500">{readyByCrate.length > 1 ? 'Default crate' : 'Crate'}</span>
              <CrateSelect
                value={folderId}
                folders={folders}
                onChange={setFolderId}
                disabled={adding || !folders.length}
                className={`${inline} cursor-pointer appearance-none text-base [text-align-last:right]`}
              />
            </label>
            {groups.ready.some((i) => i.source === 'csv' && i.folderId) && (
              <p className="text-xs text-stone-500">Imported records go to the crate named in the file, if you have one by that name.</p>
            )}
            {readyWanted > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={dropWants}
                  onChange={(e) => setDropWants(e.target.checked)}
                  disabled={adding}
                  className="size-4"
                />
                Remove {readyWanted === 1 ? 'it' : `the ${readyWanted}`} from my wantlist
              </label>
            )}
            <Button
              className="w-full"
              disabled={adding || !folderId || !online}
              onClick={() => {
                if (!folderId) return
                setSetting('lastFolderId', folderId)
                startAdding({ folderId, removeFromWantlist: dropWants })
              }}
            >
              {adding
                ? `Adding ${Math.min(run.done + 1, run.total)} of ${run.total}…`
                : !online
                  ? 'Offline'
                  : `Add ${groups.ready.length} to collection`}
            </Button>
          </div>
        </div>
      )}

      {editing && (
        <DetailsSheet
          item={editing}
          shared={shared ?? {}}
          matches={matches}
          onClose={() => setEditing(null)}
          folders={folders}
          onSave={async (meta, crate) => {
            await db.queue.update(editing.id!, { meta, folderId: crate })
            setEditing(null)
          }}
        />
      )}

      {resolving && (
        <ResolveSheet
          item={resolving}
          onClose={() => setResolving(null)}
          onPick={async (r) => {
            await chooseRelease(resolving.id!, r)
            setResolving(null)
          }}
        />
      )}
      <p className="mt-6">
        <DiscogsCredit url={`https://www.discogs.com/user/${encodeURIComponent(username)}/collection`} />
      </p>
    </Screen>
  )
}
