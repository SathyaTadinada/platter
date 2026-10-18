import { OfflineError } from '../api/discogs/client'
import type { InstanceTarget } from '../api/discogs/endpoints'
import type { SearchResult } from '../api/discogs/types'
import { db, type QueueItem, type ReleaseSummary } from '../db/db'
import { digitsOnly } from './barcode'
import { rememberBarcode } from './barcodes'
import { fieldValueFits, type ImportPlan, type ImportRow } from './csv'
import { toCard } from './format'
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
async function seedMasterYears(rows: ImportRow[], now: number) {
  const known = new Set((await db.masters.toArray()).map((m) => m.masterId))
  const seeds = new Map<number, number>()
  for (const r of rows) if (r.masterId && r.originalYear && !known.has(r.masterId)) seeds.set(r.masterId, r.originalYear)
  await db.masters.bulkPut([...seeds].map(([masterId, year]) => ({ masterId, year, at: now })))
}

export async function chooseRelease(id: number, r: SearchResult) {
  await db.queue.update(id, { status: 'ready', release: summaryFromSearch(r), raw: r, error: undefined })
}

// After a reload, anything mid-flight goes back to where it can safely restart
export async function resetInterrupted() {
  await db.queue.where('status').equals('looking').modify({ status: 'pending' })
  await db.queue.where('status').equals('adding').modify({ status: 'ready' })
}

const byAge = (status: QueueItem['status']) => db.queue.where('status').equals(status).sortBy('createdAt')

type Progress = (done: number, total: number) => void
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

export type AddOpts = RunOpts & { folderId: number; removeFromWantlist: boolean; wants: Set<number> }

export async function addReady(deps: AddDeps, opts: AddOpts): Promise<{ end: RunEnd; added: number; failed: number }> {
  const items = await byAge('ready')
  let added = 0
  let failed = 0
  for (const [i, item] of items.entries()) {
    if (opts.shouldStop?.()) return { end: 'stopped', added, failed }
    opts.onProgress?.(i, items.length)
    const release = item.release!
    const folderId = item.folderId ?? opts.folderId
    const startedAt = item.addStartedAt ?? Date.now()
    await db.queue.update(item.id!, { status: 'adding', addStartedAt: startedAt })
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
      if (item.rating) await deps.setRating(target, item.rating).catch((e: Error) => problems.push(e.message))
      if (opts.removeFromWantlist && opts.wants.has(release.id)) {
        await deps.removeWant(release.id).then(
          () => db.wants.delete(release.id),
          (e: Error) => problems.push(e.message),
        )
      }

      if (item.raw) await db.collection.put({ ...itemFromSearch(item.raw, instanceId, folderId), fields: saved })
      if (item.barcode) await rememberBarcode(item.barcode, [release.id])
      await db.queue.update(item.id!, {
        status: 'added',
        warning: problems.length ? `Added, but some details didn't save: ${problems[0]}` : undefined,
      })
      added++
    } catch (e) {
      if (e instanceof OfflineError) {
        await db.queue.update(item.id!, { status: 'ready' })
        return { end: 'offline', added, failed }
      }
      await db.queue.update(item.id!, { status: 'failed', error: (e as Error).message })
      failed++
    }
  }
  opts.onProgress?.(items.length, items.length)
  return { end: 'done', added, failed }
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
