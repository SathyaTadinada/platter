import { beforeEach, describe, expect, it, vi } from 'vitest'
import identity from '../../../tests/fixtures/identity.json'
import release from '../../../tests/fixtures/release-cd.json'
import { fakeAuth, fakeClock, json, routeFetch } from '../../../tests/helpers'
import { db } from '../../db/db'
import { buildUrl, DiscogsClient, DiscogsError, OfflineError, RateLimiter } from './client'
import { getIdentity, getRelease, searchReleases, setFieldValue } from './endpoints'

function client(fetchFn: typeof fetch, clock = fakeClock(), limiter = new RateLimiter(55, 60_000, clock.now, clock.sleep)) {
  return new DiscogsClient(fakeAuth, fetchFn, limiter, clock.sleep, clock.now)
}

beforeEach(() => db.cache.clear())

describe('RateLimiter', () => {
  it('waits once the window is full', async () => {
    let t = 0
    const waits: number[] = []
    const lim = new RateLimiter(2, 60_000, () => t, async (ms) => {
      waits.push(ms)
      t += ms
    })
    await lim.take()
    t = 10_000
    await lim.take()
    await lim.take()
    expect(waits).toEqual([50_000])
  })
})

describe('buildUrl', () => {
  it('encodes spaces as %20 and drops empty params', () => {
    expect(buildUrl('/database/search', { artist: 'Rick Astley', catno: '', page: 1 })).toBe(
      'https://api.discogs.com/database/search?artist=Rick%20Astley&page=1',
    )
  })
})

describe('DiscogsClient', () => {
  it('sends auth and parses JSON', async () => {
    const { fn, calls } = routeFetch([['/oauth/identity', () => json(identity)]])
    expect((await getIdentity(client(fn))).username).toBe('platter-test')
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Discogs token=test')
  })

  it('retries after a 429', async () => {
    let n = 0
    const fn = (async () => (n++ === 0 ? json({ message: 'slow down' }, 429) : json(identity))) as typeof fetch
    expect((await getIdentity(client(fn))).username).toBe('platter-test')
    expect(n).toBe(2)
  })

  it('gives up after repeated 429s', async () => {
    const fn = (async () => json({ message: 'slow down' }, 429)) as typeof fetch
    await expect(getIdentity(client(fn))).rejects.toMatchObject({ status: 429 })
  })

  it('throws DiscogsError with the API message', async () => {
    const fn = (async () => json({ message: 'Release not found.' }, 404)) as typeof fetch
    const err = await getRelease(client(fn), 1).catch((e) => e)
    expect(err).toBeInstanceOf(DiscogsError)
    expect(err.message).toBe('Release not found.')
  })

  it('throws OfflineError when the network is down', async () => {
    const fn = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    await expect(getIdentity(client(fn))).rejects.toBeInstanceOf(OfflineError)
  })

  it('caches GETs that ask for it', async () => {
    const { fn, calls } = routeFetch([['/releases/', () => json(release)]])
    const c = client(fn)
    await getRelease(c, 10176645)
    await getRelease(c, 10176645)
    expect(calls).toHaveLength(1)
  })

  it('never caches writes', async () => {
    const { fn, calls } = routeFetch([['/fields/', () => json(null, 204)]])
    const c = client(fn)
    const target = { folderId: 1, releaseId: 2, instanceId: 3 }
    await setFieldValue(c, 'platter-test', target, 3, 'hi')
    await setFieldValue(c, 'platter-test', target, 3, 'hi')
    expect(calls).toHaveLength(2)
    expect(calls[0].init?.body).toBe('{"value":"hi"}')
  })

  it('reports activity to subscribers', async () => {
    const { fn } = routeFetch([['/database/search', () => json({ pagination: {}, results: [] })]])
    const c = client(fn)
    const seen: number[] = []
    c.subscribe(() => seen.push(c.status.active))
    await searchReleases(c, { barcode: '1' })
    expect(seen[0]).toBe(1)
    expect(c.status.active).toBe(0)
  })

  it('backs off locally after a 429', async () => {
    const clock = fakeClock()
    const limiter = new RateLimiter(55, 60_000, clock.now, clock.sleep)
    const fill = vi.spyOn(limiter, 'fill')
    let n = 0
    const fn = (async () => (n++ === 0 ? json({}, 429) : json(identity))) as typeof fetch
    await getIdentity(client(fn, clock, limiter))
    expect(fill).toHaveBeenCalledOnce()
  })
})
