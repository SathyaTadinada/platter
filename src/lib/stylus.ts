import { DiscogsError, type DiscogsClient } from '../api/discogs/client'
import { getRelease } from '../api/discogs/endpoints'
import { parseDuration } from '../api/listenbrainz'
import type { Release, Track } from '../api/discogs/types'
import { db, getSetting, setSetting } from '../db/db'
import type { Play } from './plays'

// Hours on the stylus, from plays logged in Platter and each record's running time. A play
// counts the whole record. Track lengths are CC0 under the Discogs API terms, so they're kept
// and checked monthly, like album years.

export type RecordLength = { releaseId: number; seconds: number; estimated: boolean; at: number }
export type StylusSettings = { since?: number; lifespan: number } // lifespan in hours

export const DEFAULT_LIFESPAN = 1000
const KEY = 'stylus'
const RECHECK = 30 * 24 * 60 * 60 * 1000
const FALLBACK = 40 * 60 // a typical LP, for a record with no tracklist at all
const TRACK = 4.5 * 60 // a typical track, when there's a tracklist without lengths

// The record's running time. Tracks without a length get the average of the rest, or a
// typical length when none have one (common on vinyl releases).
export function recordSeconds(tracklist: Track[] = []): { seconds: number; estimated: boolean } {
  const tracks = tracklist.filter((t) => !t.type_ || t.type_ === 'track' || t.type_ === 'index')
  const known = tracks.map((t) => parseDuration(t.duration)).filter((n): n is number => n !== undefined)
  if (!known.length) return { seconds: tracks.length ? tracks.length * TRACK : FALLBACK, estimated: true }
  const total = known.reduce((a, b) => a + b, 0)
  const missing = tracks.length - known.length
  return { seconds: Math.round(total + (missing * total) / known.length), estimated: missing > 0 }
}

export function stylusUse(
  plays: Pick<Play, 'releaseId' | 'at'>[],
  lengths: Map<number, Pick<RecordLength, 'seconds' | 'estimated'>>,
  since = 0,
) {
  let seconds = 0
  let estimated = false
  let count = 0
  for (const p of plays) {
    if (p.at < since) continue
    const l = lengths.get(p.releaseId)
    seconds += l?.seconds ?? FALLBACK
    estimated ||= !l || l.estimated
    count++
  }
  return { hours: seconds / 3600, plays: count, estimated }
}

export async function stylusSettings(): Promise<StylusSettings> {
  return { lifespan: DEFAULT_LIFESPAN, ...(await getSetting<StylusSettings>(KEY)) }
}
export const saveStylusSettings = (s: StylusSettings) => setSetting(KEY, s)

// Played records without a length from the last month
export async function staleLengths(now = Date.now()): Promise<number[]> {
  const fresh = new Set((await db.lengths.toArray()).filter((l) => now - l.at < RECHECK).map((l) => l.releaseId))
  const played = new Set((await db.plays.toArray()).map((p) => p.releaseId))
  return [...played].filter((id) => !fresh.has(id))
}

export async function rememberLength(r: Pick<Release, 'id' | 'tracklist'>, now = Date.now()) {
  await db.lengths.put({ releaseId: r.id, ...recordSeconds(r.tracklist), at: now })
}

export async function fetchLength(client: DiscogsClient, releaseId: number) {
  try {
    await rememberLength(await getRelease(client, releaseId))
  } catch (e) {
    // a release that's gone gets the usual guess; anything else is worth stopping for
    if (!(e instanceof DiscogsError && e.status === 404)) throw e
    await rememberLength({ id: releaseId })
  }
}
