import type { DiscogsClient } from '../api/discogs/client'
import { getRelease, setFieldValue } from '../api/discogs/endpoints'
import { listensFor, submitListens } from '../api/listenbrainz'
import { db, getSetting, type LibraryItem } from '../db/db'
import { fieldFor, type FieldMatch } from './fields'
import { localDate } from './value'

// One logged spin, kept on the device
export type Play = {
  id?: number
  instanceId: number
  releaseId: number
  at: number
  // field values before this play, so it can be undone
  before: { count?: string; last?: string }
  scrobble?: 'pending' | 'done'
}

export type PlayFields = { count?: number; last?: number } // field ids

export const playFields = (matches: FieldMatch[] | null): PlayFields => ({
  count: matches ? fieldFor(matches, 'playCount')?.id : undefined,
  last: matches ? fieldFor(matches, 'lastPlayed')?.id : undefined,
})

// New Play Count and Last Played values after one more play
export function nextPlayValues(item: Pick<LibraryItem, 'fields'>, ids: PlayFields, now: number): Record<number, string> {
  const out: Record<number, string> = {}
  if (ids.count !== undefined) out[ids.count] = String((parseInt(item.fields[ids.count] ?? '', 10) || 0) + 1)
  if (ids.last !== undefined) out[ids.last] = localDate(now)
  return out
}

const DAY = 24 * 60 * 60 * 1000
const parseDay = (s?: string) => {
  const t = s ? Date.parse(`${s.slice(0, 10)}T12:00`) : NaN
  return Number.isNaN(t) ? undefined : t
}

export type Listening = { item: LibraryItem; count: number; last?: number }

// Play counts and last-played dates, from the Discogs fields and the local log.
// The fields can include plays logged elsewhere, so the larger count wins.
export function listening(items: LibraryItem[], plays: Play[], ids: PlayFields): Listening[] {
  const local = new Map<number, { n: number; last: number }>()
  for (const p of plays) {
    const l = local.get(p.instanceId) ?? { n: 0, last: 0 }
    local.set(p.instanceId, { n: l.n + 1, last: Math.max(l.last, p.at) })
  }
  return items.map((item) => {
    const l = local.get(item.instanceId)
    const fieldCount = ids.count !== undefined ? parseInt(item.fields[ids.count] ?? '', 10) || 0 : 0
    const fieldLast = ids.last !== undefined ? parseDay(item.fields[ids.last]) : undefined
    const last = Math.max(fieldLast ?? 0, l?.last ?? 0) || undefined
    return { item, count: Math.max(fieldCount, l?.n ?? 0), last }
  })
}

export function listeningStats(rows: Listening[], now = Date.now()) {
  const played = rows.filter((r) => r.count > 0 || r.last)
  return {
    mostPlayed: played.filter((r) => r.count > 0).sort((a, b) => b.count - a.count || (b.last ?? 0) - (a.last ?? 0)),
    recent: played.filter((r) => r.last).sort((a, b) => b.last! - a.last!),
    // played before, but not in the last year; longest-forgotten first
    dusty: played.filter((r) => r.last && now - r.last > 365 * DAY).sort((a, b) => a.last! - b.last!),
    never: rows.filter((r) => !r.count && !r.last),
  }
}

// ---- side effects ----

export type ListenBrainzSettings = { token: string; user: string; enabled: boolean }
export const LISTENBRAINZ_KEY = 'listenbrainz'

async function writeFields(client: DiscogsClient, username: string, item: LibraryItem, values: Record<number, string>) {
  const target = { folderId: item.folderId, releaseId: item.releaseId, instanceId: item.instanceId }
  for (const [id, value] of Object.entries(values)) await setFieldValue(client, username, target, Number(id), value)
}

// Logs a play locally and bumps the Discogs fields. If Discogs says no, nothing is kept.
export async function logPlay(client: DiscogsClient, username: string, item: LibraryItem, ids: PlayFields, now = Date.now()) {
  const values = nextPlayValues(item, ids, now)
  const lb = await getSetting<ListenBrainzSettings>(LISTENBRAINZ_KEY)
  const play: Play = {
    instanceId: item.instanceId,
    releaseId: item.releaseId,
    at: now,
    before: {
      count: ids.count !== undefined ? item.fields[ids.count] : undefined,
      last: ids.last !== undefined ? item.fields[ids.last] : undefined,
    },
    scrobble: lb?.enabled ? 'pending' : undefined,
  }
  await writeFields(client, username, item, values)
  await db.collection.update(item.instanceId, { fields: { ...item.fields, ...values } })
  play.id = await db.plays.add(play)
  return play
}

// Puts the fields back the way they were and forgets the play
export async function undoPlay(client: DiscogsClient, username: string, play: Play, ids: PlayFields) {
  const item = await db.collection.get(play.instanceId)
  if (item) {
    const values: Record<number, string> = {}
    if (ids.count !== undefined) values[ids.count] = play.before.count ?? ''
    if (ids.last !== undefined) values[ids.last] = play.before.last ?? ''
    await writeFields(client, username, item, values)
    await db.collection.update(item.instanceId, { fields: { ...item.fields, ...values } })
  }
  if (play.id !== undefined) await db.plays.delete(play.id)
}

// Sends plays waiting for ListenBrainz. Recent ones wait a little, in case they get undone.
const SETTLE = 20_000
export async function flushScrobbles(client: DiscogsClient, now = Date.now()) {
  const lb = await getSetting<ListenBrainzSettings>(LISTENBRAINZ_KEY)
  if (!lb?.enabled) return
  const pending = (await db.plays.toArray()).filter((p) => p.scrobble === 'pending' && now - p.at >= SETTLE)
  for (const p of pending) {
    const release = await getRelease(client, p.releaseId)
    await submitListens(lb.token, listensFor(release, p.at))
    await db.plays.update(p.id!, { scrobble: 'done' })
  }
}

export function scheduleScrobbles(client: DiscogsClient) {
  setTimeout(() => flushScrobbles(client).catch(() => {}), SETTLE + 1000)
}
