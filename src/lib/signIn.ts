import { DiscogsClient } from '../api/discogs/client'
import { getIdentity } from '../api/discogs/endpoints'
import { oauthAuth, saveSession, tokenAuth } from '../auth/auth'
import type { Session } from '../db/db'

const pending = { username: '', id: 0 }

// Both paths check the credentials with /oauth/identity before saving anything.
export async function signInWithToken(token: string): Promise<Session> {
  const me = await getIdentity(new DiscogsClient(tokenAuth(token, pending)))
  return saveSession({ kind: 'token', token, username: me.username, userId: me.id })
}

export async function signInWithOAuth(token: string, secret: string): Promise<Session> {
  const me = await getIdentity(new DiscogsClient(oauthAuth(token, secret, pending)))
  return saveSession({ kind: 'oauth', token, secret, username: me.username, userId: me.id })
}

export function describeAuthError(code: string): string {
  if (code.startsWith('request_token')) return "Couldn't start sign-in with Discogs. Try again in a minute."
  if (code.startsWith('access_token')) return 'Discogs didn\'t accept the sign-in. It may have timed out, so try again.'
  return 'Sign-in didn\'t finish. Try again.'
}
