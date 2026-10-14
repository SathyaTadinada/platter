import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { addToFolder, getFolders, getOwnedInstances, removeWant, setFieldValue } from '../api/discogs/endpoints'
import type { Folder } from '../api/discogs/types'
import { db, getSetting, setSetting } from '../db/db'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { useFieldMatches } from '../hooks/useFields'
import { hasMetadata, planFieldWrites, type Metadata } from '../lib/metadata'
import { CrateSelect } from './CrateSelect'
import { MetadataForm } from './MetadataForm'
import { useProfile } from './Profile'
import type { ReleaseCard } from '../lib/format'
import { itemFromSearch } from '../lib/library'
import { checkOwnership } from '../lib/ownership'
import { Cover, DiscogsCredit, ReleaseSummary } from './ReleaseCardView'
import { Button, Notice } from './ui'

type Props = { card: ReleaseCard; onClose: () => void; onScanNext: () => void }

type Done = { folder: string; instanceId: number; wantRemoved: boolean; inNotes: string[]; problems: string[] }

// "Purchase details and location" rather than listing every field name
function inNotesText(labels: string[]) {
  const purchase = labels.some((l) => l.startsWith('Purchase'))
  const parts = [purchase && 'Purchase details', labels.includes('Location') && (purchase ? 'location' : 'Location')].filter(Boolean)
  return parts.join(' and ')
}

const DETAILS_OPEN = 'platter.addDetailsOpen'
const RECENT = 'recentDetails' // store/date/location from the last add, reused for a few hours
const RECENT_FOR = 12 * 60 * 60 * 1000

function detailsOpen() {
  try {
    return localStorage.getItem(DETAILS_OPEN) === '1'
  } catch {
    return false
  }
}

function pickDefaultFolder(folders: Folder[], last?: number): number | undefined {
  if (last && folders.some((f) => f.id === last)) return last
  return (folders.find((f) => f.name === 'Uncategorized') ?? folders[0])?.id
}

export function AddSheet({ card, onClose, onScanNext }: Props) {
  const { client, username } = useSignedIn()
  const ref = useRef<HTMLDialogElement>(null)
  const [folderId, setFolderId] = useState<number>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [meta, setMeta] = useState<Metadata>({})
  const [more, setMore] = useState(detailsOpen)
  const matches = useFieldMatches()
  const currency = useProfile()?.curr_abbr ?? 'USD'

  // a stack bought together usually shares store, date and shelf
  useEffect(() => {
    getSetting<{ meta: Metadata; at: number }>(RECENT).then((r) => {
      if (r && Date.now() - r.at < RECENT_FOR) setMeta(r.meta)
    })
  }, [])

  function toggleMore() {
    setMore(!more)
    try {
      localStorage.setItem(DETAILS_OPEN, more ? '0' : '1')
    } catch {
      // not important
    }
  }

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal()
  }, [])

  const folders = useAsync(async () => {
    const r = await getFolders(client, username)
    const list = r.folders.filter((f) => f.id !== 0) // "All" can't be added to
    setFolderId(pickDefaultFolder(list, await getSetting<number>('lastFolderId')))
    return list
  }, [client, username])

  // Local index covers other pressings and the wantlist; the exact-copy
  // count is checked live in case something was added on discogs.com.
  const own = useAsync(async () => {
    const [local, live] = await Promise.all([
      checkOwnership(card.id, card.masterId),
      getOwnedInstances(client, username, card.id).catch(() => null),
    ])
    return { ...local, exactCopies: Math.max(local.exactCopies, live?.releases.length ?? 0) }
  }, [card.id])

  async function add() {
    if (!folderId) return
    setBusy(true)
    setError(null)
    try {
      const { instance_id } = await addToFolder(client, username, folderId, card.id)
      const target = { folderId, releaseId: card.id, instanceId: instance_id }

      // details are best effort: the record is in the collection either way
      const plan = matches ? planFieldWrites(meta, matches, { currency }) : { writes: {}, inNotes: [], dropped: [] }
      const saved: Record<number, string> = {}
      const problems = plan.dropped.map((d) => `${d} wasn't saved`)
      for (const [fieldId, value] of Object.entries(plan.writes)) {
        try {
          await setFieldValue(client, username, target, Number(fieldId), value)
          saved[Number(fieldId)] = value
        } catch (e) {
          problems.push((e as Error).message)
        }
      }

      await db.collection.put({ ...itemFromSearch(card.raw, instance_id, folderId), fields: saved })
      await setSetting('lastFolderId', folderId)
      const { store, date, location } = meta
      if (store || date || location) await setSetting(RECENT, { meta: { store, date, location }, at: Date.now() })
      const folder = folders.data?.find((f) => f.id === folderId)?.name ?? 'your collection'
      setDone({ folder, instanceId: instance_id, wantRemoved: false, inNotes: plan.inNotes, problems })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function dropWant() {
    setBusy(true)
    setError(null)
    try {
      await removeWant(client, username, card.id)
      await db.wants.delete(card.id)
      setDone((d) => d && { ...d, wantRemoved: true })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const o = own.data

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="add-title"
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-3xl bg-white p-0 text-stone-900 sm:m-auto sm:max-w-lg sm:rounded-3xl dark:bg-stone-900 dark:text-stone-100"
    >
      <div className="space-y-4 p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
        <div className="mx-auto h-1 w-10 rounded-full bg-stone-300 sm:hidden dark:bg-stone-700" />
        <div className="flex gap-3">
          <Cover src={card.cover ?? card.thumb} size="size-24" />
          <div className="min-w-0">
            <h2 id="add-title" className="sr-only">
              Add {card.title}
            </h2>
            <ReleaseSummary card={card} />
            <DiscogsCredit url={card.discogsUrl} />
          </div>
        </div>

        {done ? (
          <>
            <Notice tone="success">
              Added to {done.folder}.{done.inNotes.length > 0 && ` ${inNotesText(done.inNotes)} went into Notes.`}
            </Notice>
            {done.problems.length > 0 && <Notice tone="warn">Some details didn't save: {done.problems.join('; ')}</Notice>}
            {o?.inWantlist && !done.wantRemoved && (
              <Notice tone="info">
                <p>This was on your wantlist.</p>
                <button type="button" disabled={busy} onClick={dropWant} className="mt-1 font-semibold underline">
                  Remove it from your wantlist
                </button>
              </Notice>
            )}
            {done.wantRemoved && <Notice tone="success">Removed from your wantlist.</Notice>}
            {error && <Notice tone="error">{error}</Notice>}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={onClose}>
                Done
              </Button>
              <Button onClick={onScanNext}>Scan next</Button>
            </div>
          </>
        ) : (
          <>
            {o?.exactCopies ? (
              <Notice tone="warn">
                You already have this pressing{o.exactCopies > 1 ? ` (${o.exactCopies} copies)` : ''}. Adding it again creates another copy.
              </Notice>
            ) : null}
            {!o?.exactCopies && o?.otherPressings ? (
              <Notice tone="info">
                You own {o.otherPressings === 1 ? 'another pressing' : `${o.otherPressings} other pressings`} of this release.
              </Notice>
            ) : null}
            {o?.inWantlist && <Notice tone="success">On your wantlist</Notice>}
            {!o?.inWantlist && o?.wantsOtherPressing && <Notice tone="info">Another pressing is on your wantlist</Notice>}

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Crate</span>
              <CrateSelect
                className="min-h-12 w-full rounded-xl border border-stone-300 bg-transparent px-3 dark:border-stone-700"
                value={folderId}
                folders={folders.data ?? []}
                onChange={setFolderId}
                onCreated={folders.reload}
                disabled={!folders.data}
              />
            </label>

            <MetadataForm value={meta} onChange={setMeta} matches={matches} currency={currency} parts={['conditions']} />

            <div>
              <button type="button" onClick={toggleMore} aria-expanded={more} className="flex w-full items-center justify-between py-1 text-sm font-medium">
                <span>
                  More details
                  {!more && hasMetadata({ ...meta, mediaCondition: undefined, sleeveCondition: undefined }) && <span className="text-stone-500"> · filled in</span>}
                </span>
                <ChevronDown size={18} className={`transition ${more ? 'rotate-180' : ''}`} aria-hidden />
              </button>
              {more && (
                <div className="pt-2">
                  <MetadataForm value={meta} onChange={setMeta} matches={matches} currency={currency} parts={['price', 'date', 'store', 'location', 'notes']} />
                </div>
              )}
            </div>

            {(error || folders.error) && <Notice tone="error">{error ?? folders.error?.message}</Notice>}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={add} disabled={busy || !folderId}>
                {busy ? 'Adding…' : 'Add to collection'}
              </Button>
            </div>
          </>
        )}
      </div>
    </dialog>
  )
}
