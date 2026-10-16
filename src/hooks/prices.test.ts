import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import stats from '../../tests/fixtures/marketplace-stats.json'
import { fakeAuth, fakeClock, json, routeFetch } from '../../tests/helpers'
import { DiscogsClient, RateLimiter } from '../api/discogs/client'
import { db } from '../db/db'
import { holdBackground } from '../lib/task'
import { checkPrices } from './prices'

beforeEach(async () => {
  await Promise.all([db.prices.clear(), db.settings.clear()])
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
})
