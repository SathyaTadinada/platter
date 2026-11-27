import { beforeEach, describe, expect, it, vi } from 'vitest'
import identity from '../../../tests/fixtures/identity.json'
import release from '../../../tests/fixtures/release-cd.json'
import { fakeAuth, fakeClock, json, routeFetch } from '../../../tests/helpers'
import { db } from '../../db/db'
import type { Auth } from '../../auth/types'
import { buildUrl, DiscogsClient, DiscogsError, OfflineError, RateLimiter, signedUrl } from './client'
import { getIdentity, getRelease, searchReleases, setFieldValue } from './endpoints'

function client(fetchFn: typeof fetch, clock = fakeClock(), limiter = new RateLimiter(55, 60_000, clock.now, clock.sleep)) {
  return new DiscogsClient(fakeAuth, fetchFn, limiter, clock.sleep, clock.now)
}

beforeEach(() => db.cache.clear())

describe('RateLimiter', () => {
  it('waits once the window is full', async () => {
    let t = 0
    const waits: number[] = []
    const lim = new RateLimiter(
      2,
      60_000,
      () => t,
      async (ms) => {
        waits.push(ms)
        t += ms
      },
    )
    await lim.take()
    t = 10_000
    await lim.take()
    await lim.take()
    expect(waits).toEqual([50_000])
  })

  it('keeps part of the window free of background work', async () => {
    const lim = new RateLimiter(10, 60_000, () => 0)
    for (let i = 0; i < 6; i++) await lim.take(undefined, true)
    expect(lim.delay(true)).toBe(60_000)
    expect(lim.delay()).toBe(0)
  })

  it('quiets background work for a minute and slows it for ten after Discogs turns one down', () => {
    let t = 0
    const lim = new RateLimiter(10, 60_000, () => t)
    lim.backOff()
    expect(lim.delay()).toBe(0)
    expect(lim.delay(true)).toBe(60_000)
    t = 60_000
    expect(lim.delay(true)).toBe(0)
    expect(lim.slowed).toBe(true)
    t = 600_000
    expect(lim.slowed).toBe(false)
  })
})

describe('buildUrl', () => {
  it('encodes spaces as %20 and drops empty params', () => {
    expect(buildUrl('/database/search', { artist: 'Rick Astley', catno: '', page: 1 })).toBe(
      'https://api.discogs.com/database/search?artist=Rick%20Astley&page=1',
    )
  })
})

describe('signedUrl', () => {
  it('puts a token in the query', () => {
    expect(signedUrl('https://api.discogs.com/releases/1', 'Discogs token=a b')).toBe('https://api.discogs.com/releases/1?token=a%20b')
    expect(signedUrl('https://api.discogs.com/x?page=2', 'Discogs token=t')).toBe('https://api.discogs.com/x?page=2&token=t')
  })

  it('puts OAuth params in the query as they were encoded', () => {
    const header = 'OAuth oauth_consumer_key="k", oauth_nonce="n", oauth_signature="a%2Bb%3D", oauth_token="t"'
    expect(signedUrl('https://api.discogs.com/x?page=2', header)).toBe(
      'https://api.discogs.com/x?page=2&oauth_consumer_key=k&oauth_nonce=n&oauth_signature=a%2Bb%3D&oauth_token=t',
    )
  })

  it('leaves a signed-out request alone and gives up on anything else', () => {
    expect(signedUrl('https://api.discogs.com/x', undefined)).toBe('https://api.discogs.com/x')
    expect(signedUrl('https://api.discogs.com/x', 'Bearer abc')).toBeNull()
  })
})

const oauthAuth: Auth = {
  ...fakeAuth,
  kind: 'oauth',
  getAuthHeaders: async () => ({ Authorization: 'OAuth oauth_token="t", oauth_signature="s"' }),
}

describe('DiscogsClient', () => {
  it('signs GETs in the URL, with no headers, and parses JSON', async () => {
    const { fn, calls } = routeFetch([['/oauth/identity', () => json(identity)]])
    expect((await getIdentity(client(fn))).username).toBe('platter-test')
    expect(calls[0].url).toBe('https://api.discogs.com/oauth/identity?token=test')
    expect(calls[0].init?.headers).toEqual({})
  })

  it('keeps the header for writes, which have a preflight anyway', async () => {
    const { fn, calls } = routeFetch([['/fields/', () => json(null, 204)]])
    await setFieldValue(client(fn), 'platter-test', { folderId: 1, releaseId: 2, instanceId: 3 }, 3, 'hi')
    expect(calls[0].url).not.toContain('token=')
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Discogs token=test')
  })

  it('goes back to the header for OAuth if Discogs turns it down in the URL', async () => {
    const { fn, calls } = routeFetch([['/oauth/identity', () => (calls.at(-1)!.url.includes('oauth_') ? json({}, 401) : json(identity))]])
    const clock = fakeClock()
    const c = new DiscogsClient(oauthAuth, fn, new RateLimiter(55, 60_000, clock.now, clock.sleep), clock.sleep, clock.now)
    expect((await getIdentity(c)).username).toBe('platter-test')
    expect(calls.map((x) => x.url.includes('oauth_signature'))).toEqual([true, false])
    await getIdentity(c.background) // and the background work with it
    expect(calls[2].url).toBe('https://api.discogs.com/oauth/identity')
    expect((calls[2].init?.headers as Record<string, string>).Authorization).toContain('OAuth ')
  })

  it("shows the longest wait of all, so one request finishing doesn't hide another's", async () => {
    const clock = fakeClock()
    const sleeps: (() => void)[] = []
    const slowSleep = (ms: number) => new Promise<void>((r) => sleeps.push(() => (clock.sleep(ms), r())))
    let n = 0
    const fn = (async () => (n++ === 0 ? json({}, 429) : json(identity))) as typeof fetch
    const c = new DiscogsClient(fakeAuth, fn, new RateLimiter(55, 60_000, clock.now, clock.sleep), slowSleep, clock.now)
    const first = getIdentity(c) // turned down, so it waits 5 s
    await vi.waitFor(() => expect(sleeps).toHaveLength(1))
    expect(c.status.waitUntil).toBe(clock.now() + 5_000)
    await getIdentity(c) // goes straight through
    expect(c.status.waitUntil).toBe(clock.now() + 5_000)
    sleeps[0]()
    await first
    expect(c.status.waitUntil).toBeNull()
  })

  it('keeps background waits out of its status, while sharing the rate limit', async () => {
    const { fn } = routeFetch([['/oauth/identity', () => json(identity)]])
    const clock = fakeClock()
    const c = client(fn, clock, new RateLimiter(1, 60_000, clock.now, clock.sleep))
    const seen: (number | null)[] = []
    c.subscribe(() => seen.push(c.status.waitUntil))
    await getIdentity(c.background)
    await getIdentity(c.background) // waits a minute for the one slot, quietly
    expect(seen.every((w) => w === null)).toBe(true)
    await getIdentity(c) // the same slot, so this waits too, and says so
    expect(seen.some((w) => w !== null)).toBe(true)
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

  it('only blames the connection when the device is offline', () => {
    expect(new OfflineError(true).message).toBe("Discogs isn't answering right now.")
    expect(new OfflineError(false).message).toBe("You're offline.")
  })

  it('retries a failed fetch while online, since 429s arrive without CORS headers', async () => {
    let n = 0
    const fn = (async () => {
      if (n++ < 2) throw new TypeError('Failed to fetch')
      return json({ id: 1, username: 'someone' })
    }) as typeof fetch
    await expect(getIdentity(client(fn))).resolves.toMatchObject({ username: 'someone' })
    expect(n).toBe(3)
  })

  it('caches GETs that ask for it', async () => {
    const { fn, calls } = routeFetch([['/releases/', () => json(release)]])
    const c = client(fn)
    await getRelease(c, 10176645)
    await getRelease(c, 10176645)
    expect(calls).toHaveLength(1)
  })

  it('keeps a release a month, asking again for its photos after six hours', async () => {
    const { fn, calls } = routeFetch([['/releases/', () => json(release)]])
    const c = client(fn)
    await getRelease(c, 10176645)
    const [entry] = await db.cache.toArray()
    await db.cache.put({ ...entry, fetchedAt: Date.now() - 7 * 60 * 60 * 1000 })
    const kept = await getRelease(c, 10176645)
    expect(kept.images).toBeUndefined()
    expect(kept.imageCount).toBe(release.images.length)
    expect(kept.tracklist).toEqual(release.tracklist)
    expect(calls).toHaveLength(1)
    expect((await getRelease(c, 10176645, { photos: true })).images).toHaveLength(release.images.length)
    expect(calls).toHaveLength(2)
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
    const backOff = vi.spyOn(limiter, 'backOff')
    let n = 0
    const fn = (async () => (n++ === 0 ? json({}, 429) : json(identity))) as typeof fetch
    await getIdentity(client(fn, clock, limiter))
    expect(backOff).toHaveBeenCalledOnce()
  })

  it('lets requests that never reach Discogs skip the limiter', async () => {
    const clock = fakeClock()
    const limiter = new RateLimiter(1, 60_000, clock.now, clock.sleep)
    const c = new DiscogsClient(fakeAuth, (async () => json(identity)) as typeof fetch, limiter, clock.sleep, clock.now, (url) =>
      url.includes('/oauth/identity'),
    )
    for (let i = 0; i < 5; i++) await getIdentity(c)
    expect(clock.now()).toBe(1_000_000)
    await getRelease(c, 1)
    await getRelease(c, 2) // the limit of one applies here
    expect(clock.now()).toBeGreaterThan(1_000_000)
  })
})
