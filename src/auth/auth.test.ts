import { describe, expect, it } from 'vitest'
import { json, routeFetch } from '../../tests/helpers'
import { db } from '../db/db'
import { oauthAuth, saveSession, SIGNED_FOR, tokenAuth } from './auth'

const id = { username: 'platter-test', id: 1 }

describe('tokenAuth', () => {
  it('uses the Discogs token header', async () => {
    const a = tokenAuth('abc', id)
    expect(await a.getAuthHeaders({ method: 'GET', url: 'x' })).toEqual({ Authorization: 'Discogs token=abc' })
    expect(a.getIdentity()).toEqual(id)
  })
})

describe('oauthAuth', () => {
  const signer = () => {
    const { fn, calls } = routeFetch([
      [
        '/api/sign',
        () => {
          const body = JSON.parse(calls.at(-1)!.init!.body as string)
          return json({ headers: body.requests.map((r: { url: string }) => `OAuth ${r.url.split('/').pop()} ${calls.length}`) })
        },
      ],
    ])
    return { fn, calls }
  }

  it('signs ahead in batches of 60, and uses each signature once', async () => {
    const { fn, calls } = signer()
    const a = oauthAuth('tok', 'sec', id, fn)
    const reqs = Array.from({ length: 61 }, (_, i) => ({ method: 'GET', url: `https://api.discogs.com/${i}` }))
    await a.prepare(reqs)
    expect(calls).toHaveLength(2)
    expect(JSON.parse(calls[0].init!.body as string)).toMatchObject({ token: 'tok', tokenSecret: 'sec' })
    expect(await a.getAuthHeaders(reqs[5])).toEqual({ Authorization: 'OAuth 5 1' })
    expect(calls).toHaveLength(2)
    // used up, so the same request again is signed on its own
    expect(await a.getAuthHeaders(reqs[5])).toEqual({ Authorization: 'OAuth 5 3' })
  })

  it('signs again once a signature is too old', async () => {
    const { fn, calls } = signer()
    let t = 0
    const a = oauthAuth('tok', 'sec', id, fn, () => t)
    const req = { method: 'GET', url: 'https://api.discogs.com/7' }
    await a.prepare([req])
    t = SIGNED_FOR
    expect(await a.getAuthHeaders(req)).toEqual({ Authorization: 'OAuth 7 2' })
    expect(calls).toHaveLength(2)
  })

  it('throws when signing fails', async () => {
    const { fn } = routeFetch([['/api/sign', () => new Response('Forbidden', { status: 403 })]])
    await expect(oauthAuth('t', 's', id, fn).getAuthHeaders({ method: 'GET', url: 'x' })).rejects.toThrow('403')
  })
})

describe('sessions', () => {
  it('saves and signs out, wiping local data', async () => {
    await saveSession({ kind: 'token', token: 'abc', username: 'platter-test', userId: 1 })
    await db.settings.put({ key: 'x', value: 1 })
    await db.masters.put({ masterId: 10, year: 1973, at: 1 })
    expect(await db.session.get('current')).toBeTruthy()
    await tokenAuth('abc', id).signOut()
    expect(await db.session.get('current')).toBeUndefined()
    expect(await db.settings.count()).toBe(0)
    // album years stay, so signing back in doesn't look them all up again
    expect(await db.masters.get(10)).toEqual({ masterId: 10, year: 1973, at: 1 })
  })

  it('can wipe everything, album years and preferences included', async () => {
    await db.masters.put({ masterId: 10, year: 1973, at: 1 })
    localStorage.setItem('platter.sort', 'artist')
    localStorage.setItem('other.app', 'keep')
    await tokenAuth('abc', id).signOut({ everything: true })
    expect(await db.masters.count()).toBe(0)
    expect(localStorage.getItem('platter.sort')).toBeNull()
    expect(localStorage.getItem('other.app')).toBe('keep')
  })
})
