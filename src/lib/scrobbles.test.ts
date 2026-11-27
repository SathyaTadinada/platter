import { beforeEach, describe, expect, it, vi } from 'vitest'
import release from '../../tests/fixtures/release-vinyl.json'
import { db, setSetting } from '../db/db'
import { LastfmError } from '../api/lastfm'
import { flushScrobbles, LASTFM_SETTING, LISTENBRAINZ_KEY, type Play } from './plays'

const sent = vi.hoisted(() => ({ lb: [] as number[], fm: [] as number[], lbFails: false, fmError: null as Error | null }))

vi.mock('../api/discogs/endpoints', async (orig) => ({
  ...(await orig<typeof import('../api/discogs/endpoints')>()),
  getRelease: async () => release,
}))
vi.mock('../api/listenbrainz', async (orig) => ({
  ...(await orig<typeof import('../api/listenbrainz')>()),
  submitListens: async (_: string, listens: unknown[]) => {
    if (sent.lbFails) throw new Error('down')
    sent.lb.push(listens.length)
  },
}))
vi.mock('../api/lastfm', async (orig) => ({
  ...(await orig<typeof import('../api/lastfm')>()),
  scrobble: async (_: string, listens: unknown[]) => {
    if (sent.fmError) throw sent.fmError
    sent.fm.push(listens.length)
  },
}))

const client = {} as Parameters<typeof flushScrobbles>[0]
const play = (p: Partial<Play>): Play => ({ instanceId: 1, releaseId: release.id, at: 0, before: {}, ...p })

beforeEach(async () => {
  await db.delete()
  await db.open()
  Object.assign(sent, { lb: [], fm: [], lbFails: false, fmError: null })
  await setSetting(LISTENBRAINZ_KEY, { token: 't', user: 'u', enabled: true })
  await setSetting(LASTFM_SETTING, { session: 's', user: 'u', enabled: true })
})

describe('flushScrobbles', () => {
  it('sends each play to every service still waiting for it', async () => {
    await db.plays.bulkAdd([play({ scrobble: 'pending', lastfm: 'pending' }), play({ lastfm: 'pending' })])
    await flushScrobbles(client, 60_000)
    expect(sent.lb).toHaveLength(1)
    expect(sent.fm).toHaveLength(2)
    const plays = await db.plays.toArray()
    expect(plays.map((p) => [p.scrobble, p.lastfm])).toEqual([
      ['done', 'done'],
      [undefined, 'done'],
    ])
  })

  it("doesn't let one service failing hold up the other", async () => {
    sent.lbFails = true
    await db.plays.add(play({ scrobble: 'pending', lastfm: 'pending' }))
    await flushScrobbles(client, 60_000)
    expect(sent.fm).toHaveLength(1)
    const [p] = await db.plays.toArray()
    expect([p.scrobble, p.lastfm]).toEqual(['pending', 'done'])
  })

  it('marks Last.fm as needing a new connection when it turns the session down', async () => {
    sent.fmError = new LastfmError(9, 'Invalid session key')
    await db.plays.add(play({ lastfm: 'pending' }))
    await flushScrobbles(client, 60_000)
    expect((await db.settings.get(LASTFM_SETTING))?.value).toMatchObject({ expired: true })
    expect((await db.plays.toArray())[0].lastfm).toBe('pending')
  })

  it('waits on plays logged in the last few seconds, in case of Undo', async () => {
    await db.plays.add(play({ lastfm: 'pending', at: 50_000 }))
    await flushScrobbles(client, 60_000)
    expect(sent.fm).toHaveLength(0)
  })
})
