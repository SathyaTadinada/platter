import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import stats from '../../tests/fixtures/marketplace-stats.json'
import { fakeAuth, fakeClock, json, routeFetch } from '../../tests/helpers'
import { DiscogsClient, RateLimiter } from '../api/discogs/client'
import { db } from '../db/db'
import { holdBackground } from '../lib/task'
import { checkPrices } from './prices'

beforeEach(async () => {
  await Promise.all([db.prices.clear(), db.settings.clear(), db.collection.clear(), db.masters.clear()])
  vi.useFakeTimers({ toFake: ['setTimeout'] })
})
afterEach(() => vi.useRealTimers())

describe('checkPrices', () => {
  it('waits while something the user started is running', async () => {
    const { fn, calls } = routeFetch([
      ['/marketplace/stats/', () => json(stats)],
      ['/price_suggestions/', () => json({})],
    ])
    const k = fakeClock(Date.now())
    const client = new DiscogsClient(fakeAuth, fn, new RateLimiter(55, 60_000, k.now, k.sleep), k.sleep, k.now)

    const release = holdBackground()
    const run = checkPrices(client, [1, 2], 'USD')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(calls).toHaveLength(0)

    release()
    let done = false
    run.then(() => (done = true))
    // the check sleeps between requests, with database writes in between; keep the clock moving
    for (let i = 0; i < 100 && !done; i++) {
      await vi.advanceTimersByTimeAsync(1000)
      await new Promise((r) => setImmediate(r))
    }
    expect(done).toBe(true)
    expect(calls.filter((c) => c.url.includes('/marketplace/stats/'))).toHaveLength(2)
    expect(await db.prices.count()).toBe(2)
  })

  it('runs once when two checks start at the same time', async () => {
    const { fn, calls } = routeFetch([
      ['/marketplace/stats/', () => json(stats)],
      ['/price_suggestions/', () => json({})],
    ])
    const k = fakeClock(Date.now())
    const client = new DiscogsClient(fakeAuth, fn, new RateLimiter(55, 60_000, k.now, k.sleep), k.sleep, k.now)

    let done = false
    Promise.all([checkPrices(client, [1, 2, 3], 'USD'), checkPrices(client, [1, 2, 3, 4], 'USD')]).then(() => (done = true))
    for (let i = 0; i < 200 && !done; i++) {
      await vi.advanceTimersByTimeAsync(1000)
      await new Promise((r) => setImmediate(r))
    }
    expect(done).toBe(true)
    expect(calls.filter((c) => c.url.includes('/marketplace/stats/'))).toHaveLength(3)
  })

  it('gets original years before the prices', async () => {
    const { fn, calls } = routeFetch([
      ['/marketplace/stats/', () => json(stats)],
      ['/price_suggestions/', () => json({})],
      ['/masters/', () => json({ id: 10, year: 1973 })],
    ])
    const k = fakeClock(Date.now())
    const client = new DiscogsClient(fakeAuth, fn, new RateLimiter(55, 60_000, k.now, k.sleep), k.sleep, k.now)
    await db.collection.bulkPut([{ instanceId: 1, releaseId: 1, masterId: 10, folderId: 1 } as never])

    let done = false
    checkPrices(client, [1], 'USD').then(() => (done = true))
    for (let i = 0; i < 100 && !done; i++) {
      await vi.advanceTimersByTimeAsync(1000)
      await new Promise((r) => setImmediate(r))
    }
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(['/masters/10', '/marketplace/stats/1', '/marketplace/price_suggestions/1'])
    expect((await db.masters.get(10))?.year).toBe(1973)
  })
})
