import { DiscogsClient, DiscogsError } from '../api/discogs/client'
import { getIdentity } from '../api/discogs/endpoints'
import { loadSession, oauthAuth, saveSession, tokenAuth, wipeLocalData } from '../auth/auth'
import type { Session } from '../db/db'

const pending = { username: '', id: 0 }

// Both paths check the credentials with /oauth/identity before saving anything. Signing in
// again after Discogs stopped accepting the old sign-in keeps what's on the device, unless
// it's a different account.
async function save(s: Omit<Session, 'id'>): Promise<Session> {
  const before = await loadSession()
  if (before && before.username !== s.username) await wipeLocalData()
  return saveSession(s)
}

export async function signInWithToken(token: string): Promise<Session> {
  const me = await getIdentity(new DiscogsClient(tokenAuth(token, pending)))
  return save({ kind: 'token', token, username: me.username, userId: me.id })
}

export async function signInWithOAuth(token: string, secret: string): Promise<Session> {
  const me = await getIdentity(new DiscogsClient(oauthAuth(token, secret, pending)))
  return save({ kind: 'oauth', token, secret, username: me.username, userId: me.id })
}

// After Discogs turns down a request for your own data, whether the sign-in still works.
// It can stop working when access is revoked on Discogs, or after signing in elsewhere.
// A username changed on Discogs also looks like this, until the session catches up.
export async function checkSignIn(client: DiscogsClient, username: string): Promise<'ok' | 'expired' | { username: string }> {
  try {
    const me = await getIdentity(client)
    return me.username === username ? 'ok' : { username: me.username }
  } catch (e) {
    if (e instanceof DiscogsError && (e.status === 401 || e.status === 403)) return 'expired'
    throw e
  }
}
