import { beforeEach, describe, expect, it, vi } from 'vitest'
import search from '../../tests/fixtures/search-barcode.json'
import { OfflineError } from '../api/discogs/client'
import type { CollectionField, SearchResponse } from '../api/discogs/types'
import { db } from '../db/db'
import { parseDiscogsExport, planImport } from './csv'
import type { LookupResult } from './lookup'
import { matchFields } from './fields'
import {
  addReady,
  applyBatchDetails,
  chooseRelease,
  enqueueBarcode,
  enqueueCsv,
  lookupPending,
  resetInterrupted,
  retryFailed,
  type AddDeps,
} from './queue'

const results = (search as SearchResponse).results

const deps = (over: Partial<AddDeps> = {}): AddDeps => ({
  addToFolder: vi.fn(async () => 777),
  setField: vi.fn(async () => null),
  setRating: vi.fn(async () => null),
  removeWant: vi.fn(async () => null),
  ownedInstances: vi.fn(async () => []),
  ...over,
})

const addOpts = { folderId: 1, removeFromWantlist: false, wants: new Set<number>() }

beforeEach(async () => {
  await db.queue.clear()
  await db.collection.clear()
  await db.wants.clear()
})

describe('lookupPending', () => {
  it('resolves one match, asks about several, and notes misses', async () => {
    await enqueueBarcode('111', 'scan', 1)
    await enqueueBarcode('222', 'scan', 2)
    await enqueueBarcode('333', 'scan', 3)
    const answers: Record<string, LookupResult> = {
      '111': { kind: 'discogs', barcode: '111', results: [results[0]] },
      '222': { kind: 'discogs', barcode: '222', results },
      '333': { kind: 'none', barcode: '333', mb: [{ mbid: 'x', artist: 'Someone', title: 'Something' }] },
    }
    const progress: number[] = []
    expect(await lookupPending(async (b) => answers[b], { onProgress: (d) => progress.push(d) })).toBe('done')

    const q = await db.queue.orderBy('createdAt').toArray()
    expect(q.map((i) => i.status)).toEqual(['ready', 'choose', 'notfound'])
    expect(q[0].release).toMatchObject({ id: results[0].id, artist: 'Genesis' })
    expect(q[1].candidates).toHaveLength(results.length)
    expect(q[2].guess).toBe('Someone – Something')
    expect(progress.at(-1)).toBe(3)
  })

  it('stops and keeps the scan pending when offline', async () => {
    await enqueueBarcode('111', 'scan')
    expect(
      await lookupPending(async () => {
        throw new OfflineError()
      }),
    ).toBe('offline')
    expect((await db.queue.toArray())[0].status).toBe('pending')
  })

  it('marks other errors as failed, and retry puts them back', async () => {
    await enqueueBarcode('111', 'scan')
    await lookupPending(async () => {
      throw new Error('boom')
    })
    expect((await db.queue.toArray())[0]).toMatchObject({ status: 'failed', error: 'boom' })
    await retryFailed()
    expect((await db.queue.toArray())[0].status).toBe('pending')
  })
})

describe('addReady', () => {
  it('adds, writes fields and rating, and fills in the library', async () => {
    const id = await enqueueBarcode('111', 'scan')
    await chooseRelease(id, results[0])
    await db.queue.update(id, { fields: { 3: 'note' }, rating: 4 })
    const d = deps()
    expect(await addReady(d, addOpts)).toEqual({ end: 'done', added: 1, failed: 0 })
    expect(d.addToFolder).toHaveBeenCalledWith(1, results[0].id)
    expect(d.setField).toHaveBeenCalledWith({ folderId: 1, releaseId: results[0].id, instanceId: 777 }, 3, 'note')
    expect(d.setRating).toHaveBeenCalledWith(expect.anything(), 4)
    expect((await db.queue.get(id))?.status).toBe('added')
    expect(await db.collection.get(777)).toMatchObject({ releaseId: results[0].id })
  })

  it('keeps the record when a field fails, with a warning', async () => {
    const id = await enqueueBarcode('111', 'scan')
    await chooseRelease(id, results[0])
    await db.queue.update(id, { fields: { 3: 'note' } })
    await addReady(deps({ setField: async () => Promise.reject(new Error('bad value')) }), addOpts)
    expect(await db.queue.get(id)).toMatchObject({ status: 'added', warning: expect.stringContaining('bad value') })
  })

  it('removes wantlist entries when asked', async () => {
    const id = await enqueueBarcode('111', 'scan')
    await chooseRelease(id, results[0])
    await db.wants.put({ releaseId: results[0].id, masterId: 0 })
    const d = deps()
    await addReady(d, { ...addOpts, removeFromWantlist: true, wants: new Set([results[0].id]) })
    expect(d.removeWant).toHaveBeenCalledWith(results[0].id)
    expect(await db.wants.count()).toBe(0)
  })

  it("doesn't add twice after an interruption", async () => {
    const id = await enqueueBarcode('111', 'scan')
    await chooseRelease(id, results[0])
    const started = Date.now() - 5_000
    await db.queue.update(id, { status: 'adding', addStartedAt: started })
    await resetInterrupted()
    const d = deps({ ownedInstances: async () => [{ instance_id: 555, folder_id: 1, date_added: new Date(started + 1000).toISOString() }] })
    await addReady(d, addOpts)
    expect(d.addToFolder).not.toHaveBeenCalled()
    expect((await db.queue.get(id))?.instanceId).toBe(555)
  })

  it('pauses when offline and leaves the item ready', async () => {
    const id = await enqueueBarcode('111', 'scan')
    await chooseRelease(id, results[0])
    const r = await addReady(
      deps({
        addToFolder: async () => {
          throw new OfflineError()
        },
      }),
      addOpts,
    )
    expect(r.end).toBe('offline')
    expect((await db.queue.get(id))?.status).toBe('ready')
  })
})

describe('applyBatchDetails', () => {
  const fields = [
    { id: 1, name: 'Media Condition', type: 'dropdown', position: 1, public: false, options: ['Mint (M)', 'Very Good Plus (VG+)'] },
    { id: 3, name: 'Notes', type: 'textarea', position: 3, public: false },
    { id: 7, name: 'Location', type: 'textarea', position: 7, public: false },
  ] as CollectionField[]

  it('combines shared and per-record details into field values', async () => {
    const a = await enqueueBarcode('111', 'scan', 1)
    const b = await enqueueBarcode('222', 'scan', 2)
    await chooseRelease(a, results[0])
    await chooseRelease(b, results[1])
    await db.queue.update(b, { meta: { mediaCondition: 'Very Good Plus (VG+)', location: 'Crate B', price: '8' } })

    await applyBatchDetails({ store: 'Amoeba', location: 'Shelf 1' }, matchFields(fields), 'USD')

    expect((await db.queue.get(a))?.fields).toEqual({ 3: 'Bought from Amoeba', 7: 'Shelf 1' })
    const fb = (await db.queue.get(b))?.fields
    expect(fb?.[1]).toBe('Very Good Plus (VG+)')
    expect(fb?.[7]).toBe('Crate B') // the record's own value wins
    expect(fb?.[3]).toMatch(/^Bought from Amoeba for .*8\.00$/)
  })

  it('keeps the saved details on the new collection item', async () => {
    const id = await enqueueBarcode('111', 'scan')
    await chooseRelease(id, results[0])
    await applyBatchDetails({ location: 'Shelf 1' }, matchFields(fields), 'USD')
    await addReady(deps(), addOpts)
    expect((await db.collection.get(777))?.fields).toEqual({ 7: 'Shelf 1' })
  })
})

describe('enqueueCsv', () => {
  it('queues rows ready to add, with folders and valid field values', async () => {
    const fields = [
      { id: 1, name: 'Media Condition', type: 'dropdown', position: 1, public: false, options: ['Mint (M)'] },
      { id: 3, name: 'Notes', type: 'textarea', position: 3, public: false },
    ] as CollectionField[]
    const parsed = parseDiscogsExport(
      'release_id,Artist,Title,CollectionFolder,Rating,Collection Media Condition,Collection Notes\n' +
        '1,A,One,Shelf,3,Mint (M),hello\n' +
        '2,B,Two,Elsewhere,,Not a grade,\n',
    )
    const plan = planImport(parsed, fields, [{ id: 7, name: 'Shelf', count: 0 }])
    expect(await enqueueCsv(parsed.rows, plan)).toBe(2)
    const [a, b] = await db.queue.orderBy('createdAt').toArray()
    expect(a).toMatchObject({ status: 'ready', source: 'csv', folderId: 7, rating: 3, fields: { 1: 'Mint (M)', 3: 'hello' } })
    expect(a.release).toMatchObject({ id: 1, artist: 'A', title: 'One' })
    // unknown folder falls back to the batch folder; a value the dropdown doesn't have is dropped
    expect(b.folderId).toBeUndefined()
    expect(b.fields).toEqual({})
  })
})
