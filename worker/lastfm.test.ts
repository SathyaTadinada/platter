import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { categoryOf } from './categories'
import worker from './index'
import { lastfmSig, md5, validLastfmParams } from './lastfm'

describe('md5', () => {
  it('matches known hashes', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5('The quick brown fox jumps over the lazy dog')).toBe('9e107d9d372bb6826bd81d3542a419d6')
  })

  it('agrees with Node across lengths and non-ASCII text', () => {
    for (const text of ['a', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000), 'Björk – Homogenic 日本 🎵']) {
      expect(md5(text)).toBe(createHash('md5').update(text, 'utf8').digest('hex'))
    }
  })
})

describe('lastfmSig', () => {
  it('signs the params sorted by name, leaving out format and callback', () => {
    const params = { method: 'auth.getSession', token: 't', api_key: 'k', format: 'json', callback: 'x' }
    expect(lastfmSig(params, 's')).toBe(md5('api_keykmethodauth.getSessiontokents'))
  })
})

describe('validLastfmParams', () => {
  it('takes the calls Platter makes, with what each needs', () => {
    expect(validLastfmParams({ method: 'auth.getSession', token: 't' })).toBe(true)
    expect(validLastfmParams({ method: 'track.scrobble', sk: 's', 'artist[0]': 'A' })).toBe(true)
  })

  it('turns down anything else', () => {
    expect(validLastfmParams({ method: 'track.scrobble' })).toBe(false)
    expect(validLastfmParams({ method: 'user.getInfo', sk: 's' })).toBe(false)
    expect(validLastfmParams({ method: 'track.scrobble', sk: 's', n: 1 })).toBe(false)
    expect(validLastfmParams({ method: 'track.scrobble', sk: 's', x: 'y'.repeat(2000) })).toBe(false)
    expect(validLastfmParams([])).toBe(false)
    expect(validLastfmParams(null)).toBe(false)
  })
})

describe('/api/lastfm-sign', () => {
  const env = { LASTFM_KEY: 'key', LASTFM_SECRET: 'secret' } as never
  const post = (params: unknown, origin = 'https://platter.test') =>
    new Request('https://platter.test/api/lastfm-sign', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ params }),
    })

  it('signs with the key put in, and gives the key back', async () => {
    const res = await worker.fetch(post({ method: 'auth.getSession', token: 't' }), env)
    expect(await res.json()).toEqual({
      api_key: 'key',
      api_sig: lastfmSig({ method: 'auth.getSession', token: 't', api_key: 'key' }, 'secret'),
    })
  })

  it('only signs for the app, the calls it makes, and when set up', async () => {
    expect((await worker.fetch(post({ method: 'auth.getSession', token: 't' }, 'https://elsewhere.test'), env)).status).toBe(403)
    expect((await worker.fetch(post({ method: 'user.getInfo', sk: 's' }), env)).status).toBe(400)
    expect((await worker.fetch(post({ method: 'auth.getSession', token: 't' }), {} as never)).status).toBe(503)
  })
})

describe('sync', () => {
  it('keeps the Last.fm connection with the other scrobbling connection', () => {
    expect(categoryOf('setting', 'lastfm')).toBe('listenbrainz')
  })
})
