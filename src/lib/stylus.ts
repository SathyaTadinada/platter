import { DiscogsError, type DiscogsClient } from '../api/discogs/client'
import { getRelease } from '../api/discogs/endpoints'
import { parseDuration } from '../api/listenbrainz'
import type { Release, Track } from '../api/discogs/types'
import { CATALOG_MAX_AGE } from '../db/cache'
import { db, getSetting, setSetting } from '../db/db'
import { dueOf, type Due } from './due'
import type { Play } from './plays'
import { isTrack, sideOf } from './sides'

// Hours on the stylus, from plays logged in Platter and each record's running time. A play
// counts the whole record, unless it was logged as some of its sides. Track lengths are CC0 under the Discogs API terms, so they're kept
// and checked monthly, like album years.

export type RecordLength = { releaseId: number; seconds: number; estimated: boolean; at: number }
export type StylusSettings = { since?: number; lifespan: number } // lifespan in hours

const DEFAULT_LIFESPAN = 1000
const KEY = 'stylus'
const FALLBACK = 40 * 60 // a typical LP, for a record with no tracklist at all
const TRACK = 4.5 * 60 // a typical track, when there's a tracklist without lengths

// The record's running time, or just the sides given. Tracks without a length get the average of
// the rest, or a typical length when none have one (common on vinyl releases).
export function recordSeconds(tracklist: Track[] = [], sides?: string[]): { seconds: number; estimated: boolean } {
  const tracks = tracklist.filter(isTrack)
  const known = tracks.map((t) => parseDuration(t.duration)).filter((n): n is number => n !== undefined)
  if (!tracks.length) return { seconds: FALLBACK, estimated: true }
  const average = known.length ? known.reduce((a, b) => a + b, 0) / known.length : TRACK
  const lengths = tracks.filter((t) => !sides || sides.includes(sideOf(t.position) ?? '')).map((t) => parseDuration(t.duration))
  return {
    seconds: Math.round(lengths.reduce<number>((a, b) => a + (b ?? average), 0)),
    estimated: lengths.some((l) => l === undefined),
  }
}

export function stylusUse(
  plays: Pick<Play, 'releaseId' | 'at' | 'seconds'>[],
  lengths: Map<number, Pick<RecordLength, 'seconds' | 'estimated'>>,
  since = 0,
) {
  let seconds = 0
  let estimated = false
  let count = 0
  for (const p of plays) {
    if (p.at < since) continue
    const l = lengths.get(p.releaseId)
    seconds += p.seconds ?? l?.seconds ?? FALLBACK
    estimated ||= p.seconds === undefined && (!l || l.estimated)
    count++
  }
  return { hours: seconds / 3600, plays: count, estimated }
}

export async function stylusSettings(): Promise<StylusSettings> {
  return { lifespan: DEFAULT_LIFESPAN, ...(await getSetting<StylusSettings>(KEY)) }
}
export const saveStylusSettings = (s: StylusSettings) => setSetting(KEY, s)

// Played records without a length from the last month
export async function staleLengths(now = Date.now()): Promise<Due[]> {
  const at = new Map((await db.lengths.toArray()).map((l) => [l.releaseId, l.at]))
  const played = (await db.plays.toArray()).map((p) => p.releaseId)
  return dueOf(played, at, CATALOG_MAX_AGE, now)
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
