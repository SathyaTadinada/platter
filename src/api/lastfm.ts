import type { Listen } from './listenbrainz'

// Last.fm, for scrobbling. The Worker signs each call (it holds the app's secret) and the browser
// sends it, so Last.fm sees the user, not Cloudflare. Off when the build has no API key.
export const LASTFM_KEY = __LASTFM__
const API = 'https://ws.audioscrobbler.com/2.0/'
const BATCH = 50 // the most Last.fm takes in one scrobble call

export class LastfmError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message)
  }
}
// Last.fm no longer accepts the session (access was taken back on last.fm, say)
export const INVALID_SESSION = 9

// Where to send someone to let Platter scrobble for them. Last.fm comes back to `back` with ?token=.
export const authUrl = (back: string) =>
  `https://www.last.fm/api/auth/?api_key=${encodeURIComponent(LASTFM_KEY)}&cb=${encodeURIComponent(back)}`

async function call<T>(params: Record<string, string>, fetchFn: typeof fetch): Promise<T> {
  const signing = await fetchFn('/api/lastfm-sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params }),
  })
  if (signing.status === 429) throw new Error('Too many requests. Wait a minute and try again.')
  if (!signing.ok) throw new Error(`Couldn't sign the Last.fm request (${signing.status})`)
  const { api_key, api_sig } = (await signing.json()) as { api_key: string; api_sig: string }
  // a form body, which needs no preflight
  const res = await fetchFn(API, { method: 'POST', body: new URLSearchParams({ ...params, api_key, api_sig, format: 'json' }) })
  const data = (await res.json().catch(() => null)) as (T & { error?: number; message?: string }) | null
  if (data?.error) throw new LastfmError(data.error, data.message ?? `Last.fm error ${data.error}`)
  if (!res.ok || !data) throw new Error(`Last.fm returned ${res.status}`)
  return data
}

// The token Last.fm came back with, swapped for a session that doesn't expire
export async function getSession(token: string, fetchFn: typeof fetch = fetch): Promise<{ user: string; key: string }> {
  const r = await call<{ session: { name: string; key: string } }>({ method: 'auth.getSession', token }, fetchFn)
  return { user: r.session.name, key: r.session.key }
}

// The same listens ListenBrainz gets, 50 to a call
export async function scrobble(session: string, listens: Listen[], fetchFn: typeof fetch = fetch): Promise<void> {
  for (let i = 0; i < listens.length; i += BATCH) {
    const params: Record<string, string> = { method: 'track.scrobble', sk: session }
    listens.slice(i, i + BATCH).forEach((l, n) => {
      const m = l.track_metadata
      params[`artist[${n}]`] = m.artist_name
      params[`track[${n}]`] = m.track_name
      params[`album[${n}]`] = m.release_name
      params[`timestamp[${n}]`] = String(l.listened_at)
      // vinyl positions ("A1") aren't numbers, which is all Last.fm takes here
      if (/^\d+$/.test(m.additional_info.tracknumber ?? '')) params[`trackNumber[${n}]`] = m.additional_info.tracknumber!
      if (m.additional_info.duration_ms) params[`duration[${n}]`] = String(Math.round(m.additional_info.duration_ms / 1000))
    })
    await call(params, fetchFn)
  }
}
