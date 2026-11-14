import { OfflineError } from '../api/discogs/client'
import type { InstanceTarget } from '../api/discogs/endpoints'
import type { SearchResult } from '../api/discogs/types'
import { db, type LibraryItem, type QueueItem, type ReleaseSummary } from '../db/db'
import { digitsOnly } from './barcode'
import { deviceId } from './device'
import { rememberBarcode } from './barcodes'
import { fieldValueFits, type ImportPlan, type ImportRow } from './csv'
import { sentences, toCard } from './format'
import { itemFromSearch } from './library'
import type { FieldMatch } from './fields'
import type { LookupResult } from './lookup'
import { mergeMetadata, planFieldWrites, type Metadata } from './metadata'

function summaryFromSearch(r: SearchResult): ReleaseSummary {
  const c = toCard(r)
  return {
    id: c.id,
    masterId: c.masterId,
    title: c.title,
    artist: c.artist,
    thumb: c.thumb,
    label: c.label,
    catno: c.catno,
    year: c.year,
    format: c.format,
  }
}

// ---- adding to the queue ----

export async function enqueueBarcode(raw: string, source: 'scan' | 'typed', now = Date.now()): Promise<number> {
  return db.queue.add({ createdAt: now, source, status: 'pending', barcode: digitsOnly(raw) }) as Promise<number>
}

export async function enqueueCsv(rows: ImportRow[], plan: ImportPlan, now = Date.now()): Promise<number> {
  const items: QueueItem[] = rows.map((r, i) => {
    const fields: Record<number, string> = {}
    for (const [name, value] of Object.entries(r.fields)) {
      const f = plan.fieldMap[name]
      if (f && fieldValueFits(f, value)) fields[f.id] = value
    }
    return {
      createdAt: now + i, // keeps file order
      source: 'csv',
      status: 'ready',
      release: {
        id: r.releaseId,
        title: r.title || `Release ${r.releaseId}`,
        artist: r.artist,
        label: r.label,
        catno: r.catno,
        year: r.year,
        format: r.format,
      },
      folderId: r.folderName ? plan.folderMap[r.folderName]?.id : undefined,
      rating: r.rating,
      fields,
    }
  })
  await db.queue.bulkAdd(items)
  await seedMasterYears(rows, now)
  return items.length
}

// Years that came with the file, for albums Platter doesn't have one for yet
// What a file can add to copies already in the collection: values for fields that are empty on the
// copy, and a rating where it has none. With replace, values that differ from the copy's are taken
// too, and the copy's are kept in `was` to show what changes. A file's rows pair up with copies of the
// same release in the order they were added; extra rows have no copy to fill.
export function planFills(
  rows: ImportRow[],
  plan: ImportPlan,
  copies: LibraryItem[],
  { replace = false, now = Date.now() } = {},
): QueueItem[] {
  const free = new Map<number, LibraryItem[]>()
  for (const c of [...copies].sort((a, b) => a.dateAdded.localeCompare(b.dateAdded))) {
    free.set(c.releaseId, [...(free.get(c.releaseId) ?? []), c])
  }
  const fills: QueueItem[] = []
  for (const [i, r] of rows.entries()) {
    const copy = free.get(r.releaseId)?.shift()
    if (!copy) continue
    const fields: Record<number, string> = {}
    const was: NonNullable<QueueItem['was']> = { fields: {} }
    for (const [name, value] of Object.entries(r.fields)) {
      const f = plan.fieldMap[name]
      if (!f) continue
      const mine = copy.fields[f.id]?.trim()
      if (!value.trim() || value.trim() === mine || !fieldValueFits(f, value)) continue
      if (!mine) fields[f.id] = value
      else if (replace) {
        fields[f.id] = value
        was.fields[f.id] = mine
      }
    }
    let rating: number | undefined
    if (r.rating && r.rating !== copy.rating && (!copy.rating || replace)) {
      rating = r.rating
      if (copy.rating) was.rating = copy.rating
    }
    if (!Object.keys(fields).length && !rating) continue
    fills.push({
      createdAt: now + i,
      source: 'csv',
      status: 'ready',
      fill: true,
      instanceId: copy.instanceId,
      folderId: copy.folderId,
      release: {
        id: copy.releaseId,
        masterId: copy.masterId || undefined,
        title: copy.title,
        artist: copy.artist,
        thumb: copy.thumb,
        label: copy.label,
        catno: copy.catno,
        year: copy.year ? String(copy.year) : undefined,
        format: copy.format,
      },
      rating,
      fields,
      ...(Object.keys(was.fields).length || was.rating ? { was } : {}),
    })
  }
  return fills
}

// Records already waiting in the batch, so importing the same file twice doesn't queue them twice:
// releases waiting to be added, and copies waiting to be filled in
// Records picked from someone's profile, as Batch items: like an import, the release is known, but
// there are no details to copy, since a profile doesn't share them. Ones already waiting in the batch
// are left out, and ones already in the collection unless another copy is wanted. Returns how many
// went in.
export async function enqueueFromProfile(
  picked: { id: number; title: string; artist: string; year?: number; label?: string; format?: string; thumb?: string }[],
  from: string,
  { copies = false, now = Date.now() } = {},
): Promise<number> {
  const waiting = await waitingInBatch()
  const owned = new Set((await db.collection.toArray()).map((c) => c.releaseId))
  const seen = new Set<number>()
  const items: QueueItem[] = []
  for (const r of picked) {
    if (waiting.releases.has(r.id) || seen.has(r.id) || (!copies && owned.has(r.id))) continue
    seen.add(r.id)
    items.push({
      createdAt: now + items.length,
      source: 'csv',
      from,
      status: 'ready',
      release: {
        id: r.id,
        title: r.title,
        artist: r.artist,
        year: r.year ? String(r.year) : undefined,
        label: r.label,
        format: r.format,
        thumb: r.thumb,
      },
      fields: {},
    })
  }
  await db.queue.bulkAdd(items)
  return items.length
}

export async function waitingInBatch(): Promise<{ releases: Set<number>; copies: Set<number> }> {
  const waiting = (await db.queue.toArray()).filter((i) => i.status !== 'added')
  return {
    releases: new Set(waiting.filter((i) => !i.fill && i.release).map((i) => i.release!.id)),
    copies: new Set(waiting.filter((i) => i.fill && i.instanceId).map((i) => i.instanceId!)),
  }
}

async function seedMasterYears(rows: ImportRow[], now: number) {
  const known = new Set((await db.masters.toArray()).map((m) => m.masterId))
  const seeds = new Map<number, number>()
  for (const r of rows) if (r.masterId && r.originalYear && !known.has(r.masterId)) seeds.set(r.masterId, r.originalYear)
  await db.masters.bulkPut([...seeds].map(([masterId, year]) => ({ masterId, year, at: now })))
}

export async function chooseRelease(id: number, r: SearchResult) {
  await db.queue.update(id, { status: 'ready', release: summaryFromSearch(r), raw: r, error: undefined })
}

// After a reload, anything mid-flight goes back to where it can safely restart. With cloud sync,
// a record another device is adding is left to that device.
export async function resetInterrupted(me = deviceId()) {
  await db.queue.where('status').equals('looking').modify({ status: 'pending' })
  await db.queue
    .where('status')
    .equals('adding')
    .filter((i) => !i.addingBy || i.addingBy === me)
    .modify({ status: 'ready', addingBy: undefined })
}

// How long a record can sit on another device's "adding" before this one may take it over
export const STUCK_AFTER = 15 * 60 * 1000

export const addingElsewhere = (i: QueueItem, me = deviceId()) => i.status === 'adding' && Boolean(i.addingBy) && i.addingBy !== me

// Takes over a record another device started adding and never finished. Its start time stays, so
// the add checks Discogs for a copy that device may have added before stopping.
export async function takeOver(id: number) {
  await db.queue.update(id, { status: 'ready', addingBy: undefined })
}

const byAge = (status: QueueItem['status']) => db.queue.where('status').equals(status).sortBy('createdAt')

// left: for adds, how many Discogs requests the records still to go will take
type Progress = (done: number, total: number, left?: number) => void
type RunOpts = { onProgress?: Progress; shouldStop?: () => boolean }
export type RunEnd = 'done' | 'offline' | 'stopped'

// ---- looking up barcodes ----

export async function lookupPending(lookup: (barcode: string) => Promise<LookupResult>, opts: RunOpts = {}): Promise<RunEnd> {
  let done = 0
  for (;;) {
    if (opts.shouldStop?.()) return 'stopped'
    const [item] = await byAge('pending')
    if (!item) return 'done'
    const total = done + (await db.queue.where('status').equals('pending').count())
    opts.onProgress?.(done, total)
    await db.queue.update(item.id!, { status: 'looking' })
    try {
      const r = await lookup(item.barcode ?? '')
      const results = r.kind === 'none' ? [] : r.results
      const guess =
        r.kind === 'musicbrainz'
          ? `${r.mb.artist} – ${r.mb.title}`
          : r.kind === 'none' && r.mb[0]
            ? `${r.mb[0].artist} – ${r.mb[0].title}`
            : undefined
      const via = r.kind === 'none' ? undefined : r.kind
      if (results.length === 1) {
        await db.queue.update(item.id!, {
          status: 'ready',
          candidates: results,
          via,
          guess,
          release: summaryFromSearch(results[0]),
          raw: results[0],
        })
      } else if (results.length > 1) {
        await db.queue.update(item.id!, { status: 'choose', candidates: results, via, guess })
      } else {
        await db.queue.update(item.id!, { status: 'notfound', guess })
      }
    } catch (e) {
      if (e instanceof OfflineError) {
        await db.queue.update(item.id!, { status: 'pending' })
        return 'offline'
      }
      await db.queue.update(item.id!, { status: 'failed', error: (e as Error).message })
    }
    done++
    opts.onProgress?.(done, total)
  }
}

// ---- adding to the collection ----

export type AddDeps = {
  addToFolder: (folderId: number, releaseId: number) => Promise<number>
  setField: (t: InstanceTarget, fieldId: number, value: string) => Promise<unknown>
  setRating: (t: InstanceTarget, rating: number) => Promise<unknown>
  removeWant: (releaseId: number) => Promise<unknown>
  ownedInstances: (releaseId: number) => Promise<{ instance_id: number; date_added: string; folder_id: number }[]>
}

export type AddOpts = RunOpts & {
  folderId: number
  removeFromWantlist: boolean
  wants: Set<number>
  // with cloud sync: false when another device has started on this record
  claim?: (item: QueueItem, startedAt: number) => Promise<boolean>
}

// What adding a record costs in Discogs requests: the add itself, one per field (Discogs sets them
// one at a time), the rating, and taking it off the wantlist. Most of a batch's time goes on these,
// at the rate Discogs allows.
export function requestsFor(item: QueueItem, opts: Pick<AddOpts, 'removeFromWantlist' | 'wants'>): number {
  const wanted = !item.fill && opts.removeFromWantlist && item.release && opts.wants.has(item.release.id)
  return (item.instanceId ? 0 : 1) + Object.keys(item.fields ?? {}).length + (item.rating ? 1 : 0) + (wanted ? 1 : 0)
}

// missing: releases added without a search result to build their collection entries from (CSV rows, and
// records picked on another device or someone's profile), to fetch from Discogs afterwards
export async function addReady(deps: AddDeps, opts: AddOpts): Promise<{ end: RunEnd; added: number; failed: number; missing: number[] }> {
  const items = await byAge('ready')
  const costs = items.map((i) => requestsFor(i, opts))
  let left = costs.reduce((a, b) => a + b, 0)
  let added = 0
  let failed = 0
  const missing: number[] = []
  for (const [i, item] of items.entries()) {
    if (opts.shouldStop?.()) return { end: 'stopped', added, failed, missing }
    opts.onProgress?.(i, items.length, left)
    left -= costs[i]
    const release = item.release!
    const folderId = item.folderId ?? opts.folderId
    const startedAt = item.addStartedAt ?? Date.now()
    if (opts.claim && !(await opts.claim(item, startedAt))) continue
    await db.queue.update(item.id!, { status: 'adding', addStartedAt: startedAt, addingBy: opts.claim ? deviceId() : undefined })
    try {
      let instanceId = item.instanceId
      if (!instanceId && item.addStartedAt) {
        // interrupted last time: it may already be in the collection
        const owned = await deps.ownedInstances(release.id)
        instanceId = owned.find((o) => new Date(o.date_added).getTime() >= item.addStartedAt! - 60_000)?.instance_id
      }
      if (!instanceId) instanceId = await deps.addToFolder(folderId, release.id)
      await db.queue.update(item.id!, { instanceId })
      const target = { folderId, releaseId: release.id, instanceId }

      // extras are best effort: the record is in the collection either way
      const problems = (item.dropped ?? []).map((d) => `${d} had no field`)
      const saved: Record<number, string> = {}
      for (const [fieldId, value] of Object.entries(item.fields ?? {})) {
        await deps.setField(target, Number(fieldId), value).then(
          () => (saved[Number(fieldId)] = value),
          (e: Error) => problems.push(e.message),
        )
      }
      let rated = false
      if (item.rating)
        await deps.setRating(target, item.rating).then(
          () => (rated = true),
          (e: Error) => problems.push(e.message),
        )
      if (!item.fill && opts.removeFromWantlist && opts.wants.has(release.id)) {
        await deps.removeWant(release.id).then(
          () => db.wants.delete(release.id),
          (e: Error) => problems.push(e.message),
        )
      }

      if (item.raw) await db.collection.put({ ...itemFromSearch(item.raw, instanceId, folderId), fields: saved })
      else if (!item.fill && !missing.includes(release.id)) missing.push(release.id)
      if (item.fill) {
        const copy = await db.collection.get(instanceId)
        if (copy) {
          await db.collection.update(instanceId, { fields: { ...copy.fields, ...saved }, ...(rated ? { rating: item.rating } : {}) })
        }
      }
      if (item.barcode) await rememberBarcode(item.barcode, [release.id])
      await db.queue.update(item.id!, {
        status: 'added',
        warning: problems.length
          ? `${item.fill ? 'Some' : 'Added, but some'} details didn't save: ${sentences(problems.slice(0, 1))}`
          : undefined,
      })
      added++
    } catch (e) {
      if (e instanceof OfflineError) {
        await db.queue.update(item.id!, { status: 'ready' })
        return { end: 'offline', added, failed, missing }
      }
      await db.queue.update(item.id!, { status: 'failed', error: (e as Error).message })
      failed++
    }
  }
  opts.onProgress?.(items.length, items.length, 0)
  return { end: 'done', added, failed, missing }
}

// Turns the batch's shared details plus each record's own into field values.
// CSV rows already carry their own fields and are left alone.
export async function applyBatchDetails(shared: Metadata, matches: FieldMatch[], currency: string) {
  const ready = await db.queue
    .where('status')
    .equals('ready')
    .filter((i) => i.source !== 'csv')
    .toArray()
  for (const item of ready) {
    const plan = planFieldWrites(mergeMetadata(shared, item.meta), matches, { currency })
    await db.queue.update(item.id!, { fields: plan.writes, dropped: plan.dropped })
  }
}

// Retry: failed lookups go back to pending, failed adds back to ready
export async function retryFailed() {
  const failed = await db.queue.where('status').equals('failed').toArray()
  for (const f of failed) await db.queue.update(f.id!, { status: f.release ? 'ready' : 'pending', error: undefined })
}
