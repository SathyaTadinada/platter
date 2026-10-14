import type { Auth } from '../src/auth/types'

export const fakeAuth: Auth = {
  kind: 'token',
  getAuthHeaders: async () => ({ Authorization: 'Discogs token=test' }),
  getAuthHeadersBatch: async (r) => r.map(() => ({ Authorization: 'Discogs token=test' })),
  getIdentity: () => ({ username: 'platter-test', id: 1 }),
  signOut: async () => {},
}

export const json = (data: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

// Fetch stub that answers by URL substring, in order of the routes given.
export function routeFetch(routes: [string, () => Response][]) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    const hit = routes.find(([part]) => url.includes(part))
    if (!hit) throw new Error(`No route for ${url}`)
    return hit[1]()
  }) as typeof fetch
  return { fn, calls }
}

// Clock where sleeping just moves time forward, so rate-limit waits finish instantly.
export function fakeClock(start = 1_000_000) {
  let t = start
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms
    },
  }
}
