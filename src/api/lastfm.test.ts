import { describe, expect, it } from 'vitest'
import { json } from '../../tests/helpers'
import { getSession, LastfmError, scrobble } from './lastfm'
import type { Listen } from './listenbrainz'

// Answers the Worker's signing and Last.fm, keeping what Last.fm was sent
function fake(reply: unknown = {}) {
  const sent: URLSearchParams[] = []
  const signed: Record<string, string>[] = []
  const fn = (async (url: string, init?: RequestInit) => {
    if (url === '/api/lastfm-sign') {
      signed.push(JSON.parse(String(init?.body)).params)
      return json({ api_key: 'key', api_sig: 'sig' })
    }
    sent.push(init?.body as URLSearchParams)
    return json(reply)
  }) as typeof fetch
  return { fn, sent, signed }
}

const listen = (n: number, position = 'A1'): Listen => ({
  listened_at: 1000 + n,
  track_metadata: {
    artist_name: 'Artist',
    track_name: `Track ${n}`,
    release_name: 'Album',
    additional_info: { submission_client: 'Platter', tracknumber: position, duration_ms: 241_400 },
  },
})

describe('scrobble', () => {
  it('sends each listen as numbered fields, signed, with the key and signature added', async () => {
    const { fn, sent, signed } = fake({ scrobbles: {} })
    await scrobble('session', [listen(0), listen(1, '2')], fn)
    expect(signed[0]).toMatchObject({ method: 'track.scrobble', sk: 'session', 'artist[0]': 'Artist', 'track[1]': 'Track 1' })
    const body = Object.fromEntries(sent[0])
    expect(body).toMatchObject({ api_key: 'key', api_sig: 'sig', format: 'json', 'timestamp[0]': '1000', 'duration[0]': '241' })
    // a vinyl position isn't a track number to Last.fm
    expect(body['trackNumber[0]']).toBeUndefined()
    expect(body['trackNumber[1]']).toBe('2')
  })

  it('splits a long record into calls of 50', async () => {
    const { fn, sent } = fake({ scrobbles: {} })
    await scrobble(
      'session',
      Array.from({ length: 60 }, (_, i) => listen(i)),
      fn,
    )
    expect(sent).toHaveLength(2)
    expect(sent[1].get('track[9]')).toBe('Track 59')
    expect(sent[1].get('track[10]')).toBeNull()
  })

  it("throws Last.fm's error with its code", async () => {
    const { fn } = fake({ error: 9, message: 'Invalid session key' })
    const err = await scrobble('session', [listen(0)], fn).catch((e) => e)
    expect(err).toBeInstanceOf(LastfmError)
    expect(err.code).toBe(9)
  })
})

describe('getSession', () => {
  it('swaps the token for the user and session', async () => {
    const { fn, signed } = fake({ session: { name: 'someone', key: 'sk' } })
    expect(await getSession('token', fn)).toEqual({ user: 'someone', key: 'sk' })
    expect(signed[0]).toEqual({ method: 'auth.getSession', token: 'token' })
  })
})
