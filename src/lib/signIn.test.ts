import { beforeEach, describe, expect, it } from 'vitest'
import { fakeAuth, json, routeFetch } from '../../tests/helpers'
import { DiscogsClient } from '../api/discogs/client'
import { saveSession } from '../auth/auth'
import { db } from '../db/db'
import { checkSignIn, signInWithToken } from './signIn'

const client = (identity: () => Response) => new DiscogsClient(fakeAuth, routeFetch([['/oauth/identity', identity]]).fn)

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('checkSignIn', () => {
  it('tells an expired sign-in from a working one', async () => {
    expect(
      await checkSignIn(
        client(() => json({ message: 'You must authenticate to access this resource.' }, 401)),
        'me',
      ),
    ).toBe('expired')
    expect(
      await checkSignIn(
        client(() => json({ id: 1, username: 'me' })),
        'me',
      ),
    ).toBe('ok')
  })

  it('notices a username changed on Discogs', async () => {
    expect(
      await checkSignIn(
        client(() => json({ id: 1, username: 'new-me' })),
        'me',
      ),
    ).toEqual({ username: 'new-me' })
  })
})

describe('signing in again', () => {
  const identity = (username: string) => routeFetch([['/oauth/identity', () => json({ id: 1, username })]]).fn

  it('keeps what is on the device for the same account, and clears it for another', async () => {
    const realFetch = globalThis.fetch
    try {
      await saveSession({ kind: 'token', token: 'old', username: 'me', userId: 1, expired: true })
      await db.plays.add({ instanceId: 1, releaseId: 1, at: 1, before: {} })

      globalThis.fetch = identity('me')
      const again = await signInWithToken('new')
      expect(again).toMatchObject({ username: 'me', token: 'new' })
      expect(again.expired).toBeUndefined()
      expect(await db.plays.count()).toBe(1)

      globalThis.fetch = identity('someone-else')
      await signInWithToken('theirs')
      expect(await db.plays.count()).toBe(0)
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
