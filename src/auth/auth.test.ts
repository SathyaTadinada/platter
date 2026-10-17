import { describe, expect, it } from 'vitest'
import { json, routeFetch } from '../../tests/helpers'
import { db } from '../db/db'
import { oauthAuth, saveSession, tokenAuth } from './auth'

const id = { username: 'platter-test', id: 1 }

describe('tokenAuth', () => {
  it('uses the Discogs token header', async () => {
    const a = tokenAuth('abc', id)
    expect(await a.getAuthHeaders({ method: 'GET', url: 'x' })).toEqual({ Authorization: 'Discogs token=abc' })
    expect(a.getIdentity()).toEqual(id)
  })
})

describe('oauthAuth', () => {
  it('asks the Worker to sign, in batches of 60', async () => {
    const { fn, calls } = routeFetch([
      [
        '/api/sign',
        () => {
          const body = JSON.parse(calls.at(-1)!.init!.body as string)
          return json({ headers: body.requests.map((_: unknown, i: number) => `OAuth sig${i}`) })
        },
      ],
    ])
    const a = oauthAuth('tok', 'sec', id, fn)
    const reqs = Array.from({ length: 61 }, (_, i) => ({ method: 'GET', url: `https://api.discogs.com/${i}` }))
    const headers = await a.getAuthHeadersBatch(reqs)
    expect(headers).toHaveLength(61)
    expect(calls).toHaveLength(2)
    expect(JSON.parse(calls[0].init!.body as string)).toMatchObject({ token: 'tok', tokenSecret: 'sec' })
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
})
