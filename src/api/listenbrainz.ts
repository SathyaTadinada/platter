import type { Release } from './discogs/types'
import { joinArtists } from '../lib/library'

const API = 'https://api.listenbrainz.org/1'

export type Listen = {
  listened_at: number // unix seconds
  track_metadata: {
    artist_name: string
    track_name: string
    release_name: string
    additional_info: {
      submission_client: string
      tracknumber?: string
      duration_ms?: number
      discogs_release_id?: number
    }
  }
}

const auth = (token: string) => ({ Authorization: `Token ${token}` })

export async function validateToken(token: string): Promise<{ valid: boolean; user?: string }> {
  const res = await fetch(`${API}/validate-token`, { headers: auth(token) })
  if (!res.ok) throw new Error(`ListenBrainz returned ${res.status}`)
  const data = (await res.json()) as { valid: boolean; user_name?: string }
  return { valid: data.valid, user: data.user_name }
}

export async function submitListens(token: string, listens: Listen[]): Promise<void> {
  if (!listens.length) return
  const res = await fetch(`${API}/submit-listens`, {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ listen_type: listens.length === 1 ? 'single' : 'import', payload: listens }),
  })
  if (!res.ok) {
    const msg = ((await res.json().catch(() => null)) as { error?: string } | null)?.error
    throw new Error(msg ?? `ListenBrainz returned ${res.status}`)
  }
}

// "4:05" -> 245 seconds
export function parseDuration(d?: string): number | undefined {
  const parts = d?.trim().split(':').map(Number)
  if (!parts?.length || parts.some((n) => !Number.isFinite(n))) return undefined
  const s = parts.reduce((total, n) => total * 60 + n, 0)
  return s > 0 ? s : undefined
}

const GUESS = 210 // seconds, for tracks without a listed length

// One listen per track, timed so the last track ends at `endedAt` (ms)
export function listensFor(release: Release, endedAt: number): Listen[] {
  const tracks = (release.tracklist ?? []).filter((t) => (t.type_ ?? 'track') === 'track' && t.title)
  const albumArtist = joinArtists(release.artists)
  let t = Math.floor(endedAt / 1000)
  const out: Listen[] = []
  for (const track of [...tracks].reverse()) {
    const length = parseDuration(track.duration)
    t -= length ?? GUESS
    out.push({
      listened_at: t,
      track_metadata: {
        artist_name: track.artists?.length ? joinArtists(track.artists) : albumArtist,
        track_name: track.title,
        release_name: release.title,
        additional_info: {
          submission_client: 'Platter',
          tracknumber: track.position || undefined,
          duration_ms: length ? length * 1000 : undefined,
          discogs_release_id: release.id,
        },
      },
    })
  }
  return out.reverse()
}
