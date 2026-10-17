import { beforeEach, describe, expect, it } from 'vitest'
import { fakeAuth, fakeClock, json, routeFetch } from '../../tests/helpers'
import { DiscogsClient, RateLimiter } from '../api/discogs/client'
import { db, type LibraryItem } from '../db/db'
import { fetchMasterYear, staleMasters, withOriginalYears } from './masters'

const client = (fn: typeof fetch) => {
  const k = fakeClock(Date.now())
  return new DiscogsClient(fakeAuth, fn, new RateLimiter(55, 60_000, k.now, k.sleep), k.sleep, k.now)
}
const item = (instanceId: number, masterId: number, year: number) => ({ instanceId, releaseId: instanceId, masterId, year }) as LibraryItem

beforeEach(async () => {
  await Promise.all([db.masters.clear(), db.collection.clear()])
})

describe('staleMasters', () => {
  it('lists each master once, skipping ones checked in the last month and records without one', async () => {
    const now = Date.now()
    await db.collection.bulkPut([item(1, 10, 2023), item(2, 10, 2016), item(3, 20, 0), item(4, 0, 1999), item(5, 30, 2001)])
    await db.masters.bulkPut([
      { masterId: 20, year: 2015, at: now - 60_000 },
      { masterId: 30, year: 1973, at: now - 31 * 24 * 60 * 60 * 1000 },
    ])
    expect((await staleMasters(now)).sort()).toEqual([10, 30])
  })
})

describe('fetchMasterYear', () => {
  it('saves the year, or 0 when the master is gone', async () => {
    const { fn } = routeFetch([
      ['/masters/10', () => json({ id: 10, year: 1973 })],
      ['/masters/11', () => json({ message: 'Master not found.' }, 404)],
    ])
    await fetchMasterYear(client(fn), 10, () => 5)
    await fetchMasterYear(client(fn), 11, () => 5)
    expect(await db.masters.toArray()).toEqual([
      { masterId: 10, year: 1973, at: 5 },
      { masterId: 11, year: 0, at: 5 },
    ])
  })
})

describe('withOriginalYears', () => {
  it('fills in years Discogs knows and leaves the rest alone', () => {
    const out = withOriginalYears(
      [item(1, 10, 2023), item(2, 20, 2016), item(3, 0, 1999)],
      [
        { masterId: 10, year: 1973, at: 0 },
        { masterId: 20, year: 0, at: 0 },
      ],
    )
    expect(out.map((i) => i.originalYear)).toEqual([1973, undefined, undefined])
  })
})
