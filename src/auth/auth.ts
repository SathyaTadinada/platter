import { db, type Session } from '../db/db'
import type { Auth, Identity, SignableRequest } from './types'

export class AuthError extends Error {}

async function wipeLocalData() {
  await db.delete()
  await db.open()
  sessionStorage.clear()
}

export function tokenAuth(token: string, identity: Identity): Auth {
  const headers = () => ({ Authorization: `Discogs token=${token}` })
  return {
    kind: 'token',
    getAuthHeaders: async () => headers(),
    getAuthHeadersBatch: async (reqs) => reqs.map(headers),
    getIdentity: () => identity,
    signOut: wipeLocalData,
  }
}

// OAuth requests are signed by the Worker (it holds the app secret),
// then sent straight to Discogs from the browser.
export function oauthAuth(token: string, secret: string, identity: Identity, fetchFn: typeof fetch = fetch): Auth {
  async function signBatch(reqs: SignableRequest[]) {
    const res = await fetchFn('/api/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, tokenSecret: secret, requests: reqs }),
    })
    if (res.status === 429) throw new AuthError('Too many requests from this network. Wait a minute and try again.')
    if (!res.ok) throw new AuthError(`Signing failed (${res.status})`)
    const { headers } = (await res.json()) as { headers: string[] }
    return headers.map((h) => ({ Authorization: h }))
  }
  return {
    kind: 'oauth',
    getAuthHeaders: async (req) => (await signBatch([req]))[0],
    getAuthHeadersBatch: async (reqs) => {
      const out: Record<string, string>[] = []
      // the Worker signs at most 60 per call
      for (let i = 0; i < reqs.length; i += 60) out.push(...(await signBatch(reqs.slice(i, i + 60))))
      return out
    },
    getIdentity: () => identity,
    signOut: wipeLocalData,
  }
}

export function authFromSession(s: Session): Auth {
  const identity = { username: s.username, id: s.userId }
  return s.kind === 'oauth' ? oauthAuth(s.token, s.secret ?? '', identity) : tokenAuth(s.token, identity)
}

export async function loadSession(): Promise<Session | undefined> {
  return db.session.get('current')
}

export async function saveSession(s: Omit<Session, 'id'>): Promise<Session> {
  const session: Session = { ...s, id: 'current' }
  await db.session.put(session)
  // ask the browser not to evict our data; Safari may still say no
  await navigator.storage?.persist?.().catch(() => false)
  return session
}
