import { describe, expect, it } from 'vitest'
import page from '../../tests/fixtures/collection-page.json'
import wants from '../../tests/fixtures/wants.json'
import { fakeAuth, fakeClock, json, routeFetch } from '../../tests/helpers'
import { DiscogsClient, RateLimiter } from '../api/discogs/client'
import { db, getSetting } from '../db/db'
import { isStale, syncCollection, syncWants } from './sync'

const makeClient = (fn: typeof fetch) => {
  const k = fakeClock(Date.now())
  return new DiscogsClient(fakeAuth, fn, new RateLimiter(55, 60_000, k.now, k.sleep), k.sleep, k.now)
}

describe('sync', () => {
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
