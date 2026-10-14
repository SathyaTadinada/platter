import { useLiveQuery } from 'dexie-react-hooks'
import { CircleAlert, CircleCheck, Disc3, Loader, Pencil, RotateCw, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'wouter'
import { CrateSelect } from '../components/CrateSelect'
import { MetadataForm } from '../components/MetadataForm'
import { useProfile } from '../components/Profile'
import { ResolveSheet } from '../components/ResolveSheet'
import { Button, buttonClass, Notice, Screen, Section } from '../components/ui'
import { db, getSetting, setSetting, type QueueItem } from '../db/db'
import { useCollectionMeta } from '../hooks/useCollectionMeta'
import { SHARED_KEY, useQueue } from '../hooks/queue'
import { useFieldMatches } from '../hooks/useFields'
import { formatPrice, hasMetadata, type Metadata } from '../lib/metadata'
import { chooseRelease, retryFailed } from '../lib/queue'

const needsYou = (i: QueueItem) => i.status === 'choose' || i.status === 'notfound' || i.status === 'failed'
const inFlight = (i: QueueItem) => i.status === 'pending' || i.status === 'looking'

export function Batch() {
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
      <Screen title="Batch" back="/scan">
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Disc3 size={48} className="text-stone-400" aria-hidden />
          <p className="text-lg font-semibold">Batch is empty</p>
          <p className="max-w-xs text-stone-500">Switch Scan to Batch to scan several records in a row, or import a CSV.</p>
          <div className="mt-2 flex gap-2">
            <Link href="/scan" className={buttonClass('primary')}>
              Start scanning
            </Link>
            <Link href="/import" className={buttonClass('secondary')}>
              Import a CSV
            </Link>
          </div>
        </div>
      </Screen>
    )
  }

  return (
    <Screen title="Batch" back="/scan" width="wide" actions={actions}>
      {confirmClear && (
        <div className="mb-4 space-y-3 rounded-2xl bg-red-50 p-4 dark:bg-red-950/40">
          <p className="text-sm">Clear the batch? Records already added stay in your collection.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => clear('all')}>
              Clear batch
            </Button>
          </div>
        </div>
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
          {shared && groups.ready.some((i) => i.source !== 'csv') && (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
              <p className="mb-3 font-semibold">Same for every record</p>
              <MetadataForm
                value={shared}
                onChange={updateShared}
                matches={matches}
                currency={currency}
                parts={['date', 'store', 'location']}
              />
            </div>
          )}
          <List>
            {groups.ready.map((i) => (
              <Row
                key={i.id}
                item={i}
                dupe={dupes.has(i.barcode ?? '')}
                ownedExact={Boolean(i.release && owned?.releases.has(i.release.id))}
                ownedOther={Boolean(i.release?.masterId && owned?.masters.has(i.release.masterId) && !owned?.releases.has(i.release.id))}
                wanted={Boolean(i.release && wants?.has(i.release.id))}
                onResolve={i.candidates && i.candidates.length > 1 ? () => setResolving(i) : undefined}
                onRemove={adding ? undefined : () => remove(i.id!)}
                onEdit={adding || i.source === 'csv' ? undefined : () => setEditing(i)}
                currency={currency}
              />
            ))}
          </List>
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
        <div className="sticky bottom-3 z-10 mt-4">
          <div className="mx-auto max-w-lg space-y-3 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-700">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="shrink-0 font-medium">Add to crate</span>
              <CrateSelect
                value={folderId}
                folders={folders}
                onChange={setFolderId}
                disabled={adding || !folders.length}
                className="min-h-10 min-w-0 rounded-lg border border-stone-300 bg-transparent px-2 dark:border-stone-700"
              />
            </label>
            {groups.ready.some((i) => i.source === 'csv' && i.folderId) && (
              <p className="text-xs text-stone-500">Imported records keep their crate from the file if you have one with that name.</p>
            )}
            {readyWanted > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={dropWants}
                  onChange={(e) => setDropWants(e.target.checked)}
                  disabled={adding}
                  className="size-4 accent-amber-500"
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
          currency={currency}
          onClose={() => setEditing(null)}
          onSave={async (meta) => {
            await db.queue.update(editing.id!, { meta })
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
    </Screen>
  )
}

function List({ children }: { children: React.ReactNode }) {
  return (
    <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
      {children}
    </ul>
  )
}

function Badge({ tone, children }: { tone: 'warn' | 'good' | 'plain'; children: React.ReactNode }) {
  const cls = {
    warn: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
    good: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200',
    plain: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  }[tone]
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>
}

type RowProps = {
  item: QueueItem
  dupe?: boolean
  online?: boolean
  ownedExact?: boolean
  ownedOther?: boolean
  wanted?: boolean
  onResolve?: () => void
  onRemove?: () => void
  onRetry?: () => void
  onEdit?: () => void
  currency?: string
}

// "Very Good Plus (VG+)" -> "VG+"
const grade = (s?: string) => s?.match(/\(([^)]+)\)/)?.[1].split(' or ')[0] ?? s

function metaSummary(m: Metadata, currency: string): string {
  const cond = [grade(m.mediaCondition), grade(m.sleeveCondition)].filter(Boolean).join('/')
  return [cond, formatPrice(m.price, currency), m.store, m.location].filter(Boolean).join(' · ')
}

function Row({
  item,
  dupe,
  online = true,
  ownedExact,
  ownedOther,
  wanted,
  onResolve,
  onRemove,
  onRetry,
  onEdit,
  currency = 'USD',
}: RowProps) {
  const r = item.release
  const meta = r ? [r.label, r.catno, r.year].filter(Boolean).join(' · ') : ''

  let status: React.ReactNode = null
  switch (item.status) {
    case 'pending':
      status = online ? 'Waiting to look up' : 'Will look up when online'
      break
    case 'looking':
      status = (
        <span className="inline-flex items-center gap-1">
          <Loader size={14} className="animate-spin" aria-hidden /> Looking up
        </span>
      )
      break
    case 'choose':
      status =
        item.via === 'musicbrainz'
          ? `Not on Discogs by barcode. MusicBrainz lists it as ${item.guess}.`
          : `${item.candidates?.length} releases have this barcode`
      break
    case 'notfound':
      status = item.guess ? `Not on Discogs by barcode. MusicBrainz lists it as ${item.guess}.` : 'No match on Discogs'
      break
    case 'failed':
      status = <span className="text-red-600 dark:text-red-400">{item.error}</span>
      break
    case 'adding':
      status = (
        <span className="inline-flex items-center gap-1">
          <Loader size={14} className="animate-spin" aria-hidden /> Adding
        </span>
      )
      break
    case 'added':
      status = item.warning ? (
        <span className="text-amber-700 dark:text-amber-400">{item.warning}</span>
      ) : (
        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
          <CircleCheck size={14} aria-hidden /> Added
        </span>
      )
      break
  }

  const body = (
    <>
      {r?.thumb ? (
        <img src={r.thumb} alt="" loading="lazy" className="size-12 shrink-0 rounded-md bg-stone-200 object-cover dark:bg-stone-800" />
      ) : (
        <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-stone-200 text-stone-400 dark:bg-stone-800">
          {item.status === 'failed' ? <CircleAlert size={20} aria-hidden /> : <Disc3 size={20} aria-hidden />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{r ? r.title : item.barcode}</p>
        {r && <p className="truncate text-sm text-stone-600 dark:text-stone-400">{r.artist}</p>}
        {meta && <p className="truncate text-xs text-stone-500">{meta}</p>}
        {status && <p className="text-xs text-stone-500">{status}</p>}
        {item.meta && hasMetadata(item.meta) && item.status !== 'added' && (
          <p className="truncate text-xs text-stone-600 dark:text-stone-400">{metaSummary(item.meta, currency)}</p>
        )}
        {(dupe || ownedExact || ownedOther || wanted || item.source === 'csv') && item.status !== 'added' && (
          <div className="mt-1 flex flex-wrap gap-1">
            {ownedExact && <Badge tone="warn">Already in collection</Badge>}
            {ownedOther && <Badge tone="plain">You own another pressing</Badge>}
            {wanted && <Badge tone="good">On your wantlist</Badge>}
            {dupe && <Badge tone="warn">Scanned twice</Badge>}
            {item.source === 'csv' && <Badge tone="plain">From CSV</Badge>}
          </div>
        )}
      </div>
    </>
  )

  return (
    <li className="flex items-center gap-1 pr-2">
      {onResolve ? (
        <button
          type="button"
          onClick={onResolve}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-stone-50 dark:hover:bg-stone-800/50"
        >
          {body}
          <span className="shrink-0 text-sm font-semibold text-stone-700 dark:text-stone-300">
            {item.status === 'ready' ? 'Change' : 'Pick'}
          </span>
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">{body}</div>
      )}
      {onEdit && (
        <button
          type="button"
          aria-label="Details"
          onClick={onEdit}
          className="rounded-full p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <Pencil size={17} />
        </button>
      )}
      {onRetry && item.status === 'failed' && (
        <button
          type="button"
          aria-label="Retry"
          onClick={onRetry}
          className="rounded-full p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <RotateCw size={18} />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label="Remove from batch"
          onClick={onRemove}
          className="rounded-full p-2 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X size={18} />
        </button>
      )}
    </li>
  )
}

// Condition, price and anything else for one record; shared values show as placeholders
function DetailsSheet({
  item,
  shared,
  matches,
  currency,
  onSave,
  onClose,
}: {
  item: QueueItem
  shared: Metadata
  matches: ReturnType<typeof useFieldMatches>
  currency: string
  onSave: (m: Metadata) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [meta, setMeta] = useState<Metadata>(item.meta ?? {})
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal()
  }, [])
  const sharedText = [shared.date, shared.store, shared.location].filter(Boolean).join(' · ')

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="details-title"
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-3xl bg-white p-0 text-stone-900 sm:m-auto sm:max-w-lg sm:rounded-3xl dark:bg-stone-900 dark:text-stone-100"
    >
      <div className="space-y-4 p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
        <div>
          <h2 id="details-title" className="truncate text-lg font-bold">
            {item.release?.title}
          </h2>
          <p className="truncate text-sm text-stone-500">{item.release?.artist}</p>
        </div>
        <MetadataForm value={meta} onChange={setMeta} matches={matches} currency={currency} />
        {sharedText && <p className="text-xs text-stone-500">Batch values: {sharedText}. Anything entered here replaces them.</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(meta)}>Save</Button>
        </div>
      </div>
    </dialog>
  )
}
