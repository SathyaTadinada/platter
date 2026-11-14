import { db, type Session } from '../db/db'
import { capture } from '../lib/cloud'
import { clearPrefs } from '../lib/prefs'
import type { Auth, Identity, SignableRequest } from './types'

export class AuthError extends Error {}

// Album years and record lengths are public catalog data with nothing about the account, and
// looking them all up again is what made signing back in slow, so they stay unless asked.
// `everything` also drops them and the per-device preferences (theme, accent, sort…).
export async function wipeLocalData({ everything = false } = {}) {
  // what's cleared here was signed out of, not deleted, so none of it goes to the cloud copy
  capture(false)
  const [years, lengths] = everything ? [[], []] : await Promise.all([db.masters.toArray(), db.lengths.toArray()])
  await db.delete()
  await db.open()
  await Promise.all([db.masters.bulkPut(years), db.lengths.bulkPut(lengths)])
  sessionStorage.clear()
  if (everything) clearPrefs()
}

export function tokenAuth(token: string, identity: Identity): Auth {
  const headers = () => ({ Authorization: `Discogs token=${token}` })
  return {
    kind: 'token',
    getAuthHeaders: async () => headers(),
    prepare: async () => {},
    getIdentity: () => identity,
    signOut: wipeLocalData,
  }
}

// OAuth requests are signed by the Worker (it holds the app secret),
// then sent straight to Discogs from the browser.
//
// Every signature is a request to the Worker, and the free plan allows only so many a day, so work
// that knows what it'll ask for next (the background checks) signs it ahead, up to 60 per request.
// Discogs turns a signature down after a few minutes (one from 70 seconds before was fine, five and a
// half minutes wasn't), so one that's waited longer than this is signed again.
export const SIGNED_FOR = 2 * 60_000

export function oauthAuth(token: string, secret: string, identity: Identity, fetchFn: typeof fetch = fetch, now = () => Date.now()): Auth {
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
  // signed ahead, by method and URL. Each is used once, since every signature has its own nonce.
  const ready = new Map<string, { headers: Record<string, string>; at: number }>()
  const keyOf = (r: SignableRequest) => `${r.method} ${r.url}`
  return {
    kind: 'oauth',
    getAuthHeaders: async (req) => {
      const hit = ready.get(keyOf(req))
      ready.delete(keyOf(req))
      if (hit && now() - hit.at < SIGNED_FOR) return hit.headers
      return (await signBatch([req]))[0]
    },
    prepare: async (reqs) => {
      const t = now()
      for (const [k, v] of ready) if (t - v.at >= SIGNED_FOR) ready.delete(k)
      const todo = reqs.filter((r) => !ready.has(keyOf(r)))
      // the Worker signs at most 60 per call
      for (let i = 0; i < todo.length; i += 60) {
        const batch = todo.slice(i, i + 60)
        const signed = await signBatch(batch)
        batch.forEach((r, j) => ready.set(keyOf(r), { headers: signed[j], at: t }))
      }
    },
    getIdentity: () => identity,
    signOut: wipeLocalData,
  }
}

// The demo talks to Discogs signed out; its own collection is simulated locally
function demoAuth(identity: Identity): Auth {
  return {
    kind: 'demo',
    getAuthHeaders: async () => ({}),
    prepare: async () => {},
    getIdentity: () => identity,
    signOut: wipeLocalData,
  }
}

export function authFromSession(s: Session): Auth {
  const identity = { username: s.username, id: s.userId }
  if (s.kind === 'demo') return demoAuth(identity)
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
