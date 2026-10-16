import { beforeEach, describe, expect, it } from 'vitest'
import stats from '../../tests/fixtures/marketplace-stats.json'
import { fakeAuth, fakeClock, json, routeFetch } from '../../tests/helpers'
import { DiscogsClient, RateLimiter } from '../api/discogs/client'
import { db } from '../db/db'
import { fetchPrice, recordCollectionValue } from './pricing'

const client = (fn: typeof fetch) => {
  const k = fakeClock(Date.now())
  return new DiscogsClient(fakeAuth, fn, new RateLimiter(55, 60_000, k.now, k.sleep), k.sleep, k.now)
}

const suggestions = {
  'Very Good Plus (VG+)': { currency: 'USD', value: 21.456 },
  'Mint (M)': { currency: 'USD', value: 40 },
}

beforeEach(async () => {
  await Promise.all([db.prices.clear(), db.settings.clear(), db.valueHistory.clear(), db.collection.clear(), db.cache.clear()])
})

describe('fetchPrice', () => {
  it('saves the lowest listing and suggested prices by grade', async () => {
    const { fn } = routeFetch([
      ['/marketplace/stats/', () => json(stats)],
      ['/price_suggestions/', () => json(suggestions)],
    ])
    const { price, requests } = await fetchPrice(client(fn), 7, 'USD')
    expect(requests).toBe(2)
    expect(price).toMatchObject({ lowest: 4.49, forSale: 2, suggested: { 'Very Good Plus (VG+)': 21.46, 'Mint (M)': 40 } })
    expect(await db.prices.get(7)).toEqual(price)
  })

  it('stops asking for suggestions for a day once Discogs says seller settings are missing', async () => {
    const { fn, calls } = routeFetch([
      ['/marketplace/stats/', () => json(stats)],
      ['/price_suggestions/', () => json({ message: 'You must fill out your seller settings first.' }, 404)],
    ])
    const c = client(fn)
    const t = Date.now()
    expect((await fetchPrice(c, 7, 'USD', () => t)).price.suggested).toBeUndefined()
    await fetchPrice(c, 8, 'USD', () => t + 60_000)
    expect(calls.filter((x) => x.url.includes('price_suggestions'))).toHaveLength(1)
    await fetchPrice(c, 9, 'USD', () => t + 25 * 60 * 60 * 1000)
    expect(calls.filter((x) => x.url.includes('price_suggestions'))).toHaveLength(2)
  })

  it('ignores a listing in another currency', async () => {
    const { fn } = routeFetch([
      ['/marketplace/stats/', () => json({ ...stats, lowest_price: { value: 3, currency: 'EUR' } })],
      ['/price_suggestions/', () => json({})],
    ])
    expect((await fetchPrice(client(fn), 7, 'USD')).price.lowest).toBeNull()
  })
})

describe('recordCollectionValue', () => {
  const value = (median: string) => json({ minimum: '$10.00', median, maximum: '$30.00' })

  it('asks Discogs again when the record count changed since the last reading', async () => {
    let median = '$20.00'
    const { fn, calls } = routeFetch([['/collection/value', () => value(median)]])
    const c = client(fn)
    await db.collection.put({ instanceId: 1, releaseId: 1, masterId: 0, folderId: 1 } as never)
    expect((await recordCollectionValue(c, 'platter-test', 'USD'))?.snap).toMatchObject({ median: 20, count: 1 })

    // same count: the cached answer is fine
    median = '$25.00'
    expect((await recordCollectionValue(c, 'platter-test', 'USD'))?.snap.median).toBe(20)
    expect(calls).toHaveLength(1)

    // a record was added: fetch again
    await db.collection.put({ instanceId: 2, releaseId: 2, masterId: 0, folderId: 1 } as never)
    expect((await recordCollectionValue(c, 'platter-test', 'USD'))?.snap).toMatchObject({ median: 25, count: 2 })
    expect(calls).toHaveLength(2)
  })
})
