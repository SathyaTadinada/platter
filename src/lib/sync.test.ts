import { beforeAll, describe, expect, it } from 'vitest'
import page from '../../tests/fixtures/collection-page.json'
import wants from '../../tests/fixtures/wants.json'
import { fakeAuth, fakeClock, json, routeFetch } from '../../tests/helpers'
import { DiscogsClient, RateLimiter } from '../api/discogs/client'
import { db, getSetting, type LibraryItem } from '../db/db'
import { setPlayFields } from './plays'
import { isStale, refreshReleases, syncCollection, syncWants } from './sync'

const makeClient = (fn: typeof fetch) => {
  const k = fakeClock(Date.now())
  return new DiscogsClient(fakeAuth, fn, new RateLimiter(55, 60_000, k.now, k.sleep), k.sleep, k.now)
}

describe('sync', () => {
  beforeAll(() => setPlayFields({ count: 8, last: 9 }))

  it('indexes every page of the collection', async () => {
    const p2 = { ...page, pagination: { ...page.pagination, page: 2, pages: 2 } }
    const p1 = { ...page, pagination: { ...page.pagination, pages: 2 } }
    p2.releases = page.releases.map((r) => ({ ...r, instance_id: r.instance_id + 100 }))
    const { fn } = routeFetch([
      ['&page=1', () => json(p1)],
      ['&page=2', () => json(p2)],
    ])
    const c = makeClient(fn)
    const progress: number[] = []
    expect(await syncCollection(c, 'platter-test', (d) => progress.push(d))).toBe(6)
    expect(progress).toEqual([1, 2])
    expect(await db.collection.where('releaseId').equals(249504).count()).toBe(2)
    expect(await isStale('collectionSyncedAt')).toBe(false)
  })

  it('notices plays logged elsewhere since the last refresh', async () => {
    const today = new Date().toLocaleDateString('en-CA')
    const r = page.releases[0]
    await db.plays.clear()
    await db.collection.clear()
    await db.collection.put({ instanceId: r.instance_id, releaseId: r.id, fields: { 8: '1' } } as unknown as LibraryItem)
    await db.settings.put({ key: 'collectionSyncedAt', value: Date.now() - 60 * 60 * 1000 })
    const played = { ...r, notes: [...(r.notes ?? []), { field_id: 8, value: '2' }, { field_id: 9, value: today }] }
    const { fn } = routeFetch([['&page=1', () => json({ ...page, releases: [played] })]])
    await syncCollection(makeClient(fn), 'platter-test')
    expect((await db.plays.toArray()).map((p) => [p.instanceId, p.uid, p.noticed])).toEqual([
      [r.instance_id, `seen:${r.instance_id}:2`, true],
    ])
  })

  it('fetches just a few added records, when that beats reloading every page', async () => {
    await db.collection.clear()
    const one = { ...page, releases: page.releases.slice(0, 1) }
    const { fn } = routeFetch([['/collection/releases/', () => json(one)]])
    const c = makeClient(fn)
    expect(await refreshReleases(c, 'platter-test', [one.releases[0].id])).toBe(false) // nothing here yet: one page anyway
    await db.collection.bulkPut(Array.from({ length: 250 }, (_, i) => ({ instanceId: 10_000 + i, releaseId: i }) as unknown as LibraryItem))
    expect(await refreshReleases(c, 'platter-test', [one.releases[0].id])).toBe(true)
    expect(await db.collection.get(one.releases[0].instance_id)).toMatchObject({ releaseId: one.releases[0].id })
  })

  it('indexes the wantlist', async () => {
    const want = {
      id: 5,
      date_added: '2026-10-01T10:00:00-07:00',
      basic_information: {
        id: 5,
        master_id: 50,
        title: 'Invisible Touch',
        year: 1986,
        thumb: 'https://i.discogs.com/t.jpg',
        artists: [{ name: 'Genesis' }],
        labels: [],
        formats: [{ name: 'Vinyl', qty: '1', descriptions: ['LP', 'Album'] }],
      },
    }
    const withOne = { ...wants, wants: [want] }
    const { fn } = routeFetch([['/wants', () => json(withOne)]])
    const c = makeClient(fn)
    await syncWants(c, 'platter-test')
    expect(await db.wants.get(5)).toMatchObject({
      releaseId: 5,
      masterId: 50,
      title: 'Invisible Touch',
      artist: 'Genesis',
      year: 1986,
      format: 'Vinyl, LP, Album',
      dateAdded: '2026-10-01T10:00:00-07:00',
    })
    expect(await getSetting('wantsSyncedAt')).toBeTypeOf('number')
  })
})
