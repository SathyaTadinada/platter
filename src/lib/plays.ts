import type { DiscogsClient } from '../api/discogs/client'
import { getRelease, setFieldValue } from '../api/discogs/endpoints'
import { listensFor, submitListens } from '../api/listenbrainz'
import { db, getSetting, type LibraryItem } from '../db/db'
import { deviceId } from './device'
import { fieldFor, type FieldMatch } from './fields'
import { rememberLength } from './stylus'
import { localDate } from './time'

// One logged spin, kept on the device
export type Play = {
  id?: number
  instanceId: number
  releaseId: number
  at: number
  // field values before this play, so it can be undone
  before: { count?: string; last?: string }
  scrobble?: 'pending' | 'done'
  uid?: string // the same play on every device
  device?: string // where it was logged; only that device scrobbles it
  noticed?: true // logged outside Platter, and found when the play count went up (see noticedPlays)
  // only some sides were played: which, and how long they run (for the stylus)
  sides?: string[]
  seconds?: number
}

export type PlayedSides = Required<Pick<Play, 'sides' | 'seconds'>>

export type PlayFields = { count?: number; last?: number } // field ids

// null while the custom fields are loading, which isn't the same as not having the fields
export const playFields = (matches: FieldMatch[] | null): PlayFields | null =>
  matches ? { count: fieldFor(matches, 'playCount')?.id, last: fieldFor(matches, 'lastPlayed')?.id } : null

// Which Discogs fields hold play counts, once they're known (Shell sets them)
let known: PlayFields | null = null
const waiting: ((ids: PlayFields) => void)[] = []
export const setPlayFields = (ids: PlayFields | null) => {
  known = ids
  if (ids) waiting.splice(0).forEach((w) => w(ids))
}
export const knownPlayFields = () => known
// Waits a little for them, or gives up with null
export const awaitPlayFields = (ms: number): Promise<PlayFields | null> =>
  known
    ? Promise.resolve(known)
    : new Promise((resolve) => {
        const done = (ids: PlayFields | null) => {
          clearTimeout(timer)
          const i = waiting.indexOf(done)
          if (i >= 0) waiting.splice(i, 1)
          resolve(ids)
        }
        const timer = setTimeout(() => done(null), ms)
        waiting.push(done)
      })

// A value that may not be known yet; get() waits for it. Logging a play waits for the field
// ids this way, so a play logged right away still reaches Discogs.
export function latch<T>() {
  let value: { v: T } | null = null
  const waiting: ((v: T) => void)[] = []
  return {
    set(v: T) {
      value = { v }
      waiting.splice(0).forEach((w) => w(v))
    },
    clear() {
      value = null
    },
    get: (): Promise<T> => (value ? Promise.resolve(value.v) : new Promise((r) => waiting.push(r))),
  }
}

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

// More than this many at once between two refreshes reads as someone fixing the count, not listening
const MOST_NOTICED = 3

// Plays logged outside Platter (on Discogs, or in another app), found when a refresh brings back a
// higher play count than this device had. Platter's own changes are already in its copy of the
// collection, so they never show up here, and neither does a record that's new to it. A play needs a
// Last Played date from after the previous refresh, so an imported history isn't taken for listening.
// Each gets an id from the record and the count it reached, so two devices noticing the same play
// make the same one.
export function noticedPlays(
  before: Pick<LibraryItem, 'instanceId' | 'fields'>[],
  after: Pick<LibraryItem, 'instanceId' | 'releaseId' | 'fields'>[],
  plays: Pick<Play, 'instanceId' | 'uid'>[],
  ids: PlayFields,
  since: number, // when the previous refresh was
  now = Date.now(),
): Play[] {
  const countId = ids.count
  if (countId === undefined) return []
  const old = new Map(before.map((i) => [i.instanceId, i]))
  const logged = new Map<number, number>()
  for (const p of plays) logged.set(p.instanceId, (logged.get(p.instanceId) ?? 0) + 1)
  const uids = new Set(plays.map((p) => p.uid))
  const out: Play[] = []
  for (const item of after) {
    const was = old.get(item.instanceId)
    const raw = item.fields[countId]?.trim()
    if (!was || !raw || !/^\d+$/.test(raw)) continue
    const count = Number(raw)
    const from = Math.max(parseInt(was.fields[countId] ?? '', 10) || 0, logged.get(item.instanceId) ?? 0)
    const extra = count - from
    if (extra <= 0 || extra > MOST_NOTICED) continue
    let at = now
    if (ids.last !== undefined) {
      const day = parseDay(item.fields[ids.last])
      const lastBefore = parseDay(was.fields[ids.last]) ?? 0
      // a day either side of the refresh, for time zones
      if (day === undefined || day < lastBefore || day < since - DAY) continue
      at = Math.min(day, now)
    }
    for (let n = from + 1; n <= count; n++) {
      const uid = `seen:${item.instanceId}:${n}`
      if (uids.has(uid)) continue
      // a minute apart, in the order they were counted
      out.push({ instanceId: item.instanceId, releaseId: item.releaseId, at: at - (count - n) * 60_000, before: {}, uid, noticed: true })
    }
  }
  return out
}

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
export async function logPlay(
  client: DiscogsClient,
  username: string,
  item: LibraryItem,
  ids: PlayFields,
  now = Date.now(),
  sides?: PlayedSides,
) {
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
    device: deviceId(),
    ...sides,
  }
  await writeFields(client, username, item, values)
  await db.collection.update(item.instanceId, { fields: { ...item.fields, ...values } })
  play.id = await db.plays.add(play)
  return play
}

// The play count on Discogs has the last word. Where it's lower than the plays logged here
// (turned down on a record page, or on Discogs itself), plays go so the two agree: noticed ones first,
// since a play logged on another device can arrive after this one noticed it, then the newest. An empty count is left alone: the field may have been added after those plays.
// Plays logged after this device last synced the collection are left alone: with cloud sync they can
// come from another device before the count on Discogs reaches here.
export async function trimPlays(
  items: Pick<LibraryItem, 'instanceId' | 'fields'>[],
  ids: PlayFields,
  syncedAt = Infinity,
): Promise<number> {
  if (ids.count === undefined) return 0
  const limit = new Map<number, number>()
  for (const i of items) {
    const raw = i.fields[ids.count]?.trim()
    if (raw && /^\d+$/.test(raw)) limit.set(i.instanceId, Number(raw))
  }
  const each = new Map<number, Play[]>()
  for (const p of await db.plays.orderBy('at').toArray()) {
    if (p.at >= syncedAt) break
    if (!limit.has(p.instanceId)) continue
    each.set(p.instanceId, [...(each.get(p.instanceId) ?? []), p])
  }
  const extra: number[] = []
  for (const [instanceId, list] of each) {
    const over = list.length - limit.get(instanceId)!
    if (over <= 0) continue
    const newest = [...list].reverse()
    const order = [...newest.filter((p) => p.noticed), ...newest.filter((p) => !p.noticed)]
    extra.push(...order.slice(0, over).map((p) => p.id!))
  }
  if (extra.length) await db.plays.bulkDelete(extra)
  return extra.length
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
  // with cloud sync, plays from other devices are theirs to send
  const pending = (await db.plays.toArray()).filter(
    (p) => p.scrobble === 'pending' && now - p.at >= SETTLE && (!p.device || p.device === deviceId()),
  )
  for (const p of pending) {
    const release = await getRelease(client, p.releaseId)
    rememberLength(release)
    await submitListens(lb.token, listensFor(release, p.at, p.sides))
    await db.plays.update(p.id!, { scrobble: 'done' })
  }
}

export function scheduleScrobbles(client: DiscogsClient) {
  setTimeout(() => flushScrobbles(client).catch(() => {}), SETTLE + 1000)
}

// Something to put on: any record can come up, but ones not played in a while (or ever) come
// up more often than ones played this week. Ones already offered this time are skipped while
// there are others left.
export function pickToPlay(rows: Listening[], offered: Set<number>, rand = Math.random, now = Date.now()) {
  const fresh = rows.filter((r) => !offered.has(r.item.instanceId))
  const pool = fresh.length ? fresh : rows
  const weight = (r: Listening) => {
    if (!r.last) return r.count ? 2 : 4
    const days = Math.max(0, (now - r.last) / DAY)
    return 0.25 + Math.min(days, 365) / 90
  }
  const total = pool.reduce((n, r) => n + weight(r), 0)
  let at = rand() * total
  for (const r of pool) {
    at -= weight(r)
    if (at < 0) return r
  }
  return pool.at(-1)
}
