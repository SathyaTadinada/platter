import { quiet, setCapture, SPECS, SYNCED_SETTINGS, type Kind } from '../db/capture'
import { db, getSetting, setSetting, type OutboxEntry, type QueueItem } from '../db/db'
import { applyAccent } from './accent'
import { prefListeners, readPref, removePref, writePref } from './prefs'
import { reloadLayout } from './statsLayout'
import { applyTheme } from './theme'

// Cloud sync: what you save in Platter follows your Discogs account to every device. Changes are
// noted as they happen (db/capture.ts), sent in batches, and other devices' changes come back
// by number (the server's seq) so each pull only carries what's new. The newest edit wins.

export const SYNCED_PREFS = new Set(['platter.accent', 'platter.theme', 'platter.valueLayout'])

// per device, so none of these sync
export const CLOUD = { enabled: 'cloudSync', cursor: 'cloudCursor', syncedAt: 'cloudSyncedAt', checked: 'cloudChecked' } as const

export type Login = { kind: 'token' | 'oauth'; token: string; secret?: string }
export type Row = { kind: Kind; key: string; value: string | null; updatedAt: number; deleted?: boolean; ifSeq?: number; seq?: number }
type PullResult = { exists: boolean; rows: Row[]; seq: number; more: boolean }

export class CloudError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export type CloudApi = {
  pull(since: number): Promise<PullResult>
  push(rows: Row[]): Promise<{ seq: number; seqs: number[] }>
  forget(): Promise<unknown>
}

export function cloudApi(login: Login, fetchFn: typeof fetch = (...a) => fetch(...a)): CloudApi {
  async function call<T>(path: string, body: object): Promise<T> {
    let res: Response
    try {
      res = await fetchFn(`/api/sync/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, ...body }),
      })
    } catch {
      throw new CloudError(0, "Can't reach Platter's server.")
    }
    if (!res.ok) {
      const msg = ((await res.json().catch(() => null)) as { error?: string } | null)?.error
      throw new CloudError(res.status, msg ?? `Sync failed (${res.status})`)
    }
    return res.json() as Promise<T>
  }
  return {
    pull: (since) => call('pull', { since }),
    push: (rows) => call('push', { rows }),
    forget: () => call('forget', {}),
  }
}

// ---- noting changes ----

let onChange = () => {}
let applyingPrefs = false

async function note(kind: Kind, keys: string[], at: number) {
  await db.outbox.bulkPut(keys.map((key) => ({ kind, key, at })))
  onChange()
}

const notePref = (key: string) => {
  if (!applyingPrefs && SYNCED_PREFS.has(key)) note('pref', [key], Date.now()).catch(() => {})
}

// Start or stop noting changes. onChanged runs after each one, to schedule a push.
export function capture(on: boolean, onChanged: () => void = () => {}) {
  onChange = onChanged
  setCapture(on ? (kind, keys, at) => void note(kind, keys, at).catch(() => {}) : null)
  if (on) prefListeners.add(notePref)
  else prefListeners.delete(notePref)
}

// ---- reading and writing rows ----

// Search results and the chosen one's raw data are the device's own working copy; the other device looks them up itself
function batchValue(q: QueueItem) {
  const { id: _id, candidates: _c, raw: _r, seq: _s, ...rest } = q
  return rest
}

export async function localValue(kind: Kind, key: string): Promise<unknown | undefined> {
  switch (kind) {
    case 'play': {
      const p = await db.plays.where('uid').equals(key).first()
      if (!p) return undefined
      const { id: _id, ...rest } = p
      return rest
    }
    case 'batch': {
      const q = await db.queue.where('uid').equals(key).first()
      return q && batchValue(q)
    }
    case 'value':
      return db.valueHistory.get(key)
    case 'cover':
      return db.covers.get(Number(key))
    case 'year':
      return db.masters.get(Number(key))
    case 'length':
      return db.lengths.get(Number(key))
    case 'barcode':
      return db.barcodes.get(key)
    case 'setting':
      return SYNCED_SETTINGS.has(key) ? db.settings.get(key) : undefined
    case 'pref':
      return readPref(key) ?? undefined
  }
}

// Records still waiting on a "Which release is…?" pick that came without their search results
const needCandidates = new Set<number>()
export const takeNeedCandidates = () => {
  const ids = [...needCandidates]
  needCandidates.clear()
  return ids
}

async function applyRow(r: Row) {
  const v = r.value === null ? null : JSON.parse(r.value)
  switch (r.kind) {
    case 'play': {
      const local = await db.plays.where('uid').equals(r.key).first()
      if (v === null) {
        if (local) await db.plays.delete(local.id!)
      } else await db.plays.put({ ...v, uid: r.key, ...(local ? { id: local.id } : {}) })
      return
    }
    case 'batch': {
      const local = await db.queue.where('uid').equals(r.key).first()
      if (v === null) {
        if (local) await db.queue.delete(local.id!)
        return
      }
      const sameRelease = local && local.release?.id === v.release?.id
      const next: QueueItem = {
        ...v,
        uid: r.key,
        seq: r.seq,
        ...(local ? { id: local.id } : {}),
        ...(sameRelease ? { candidates: local.candidates, raw: local.raw } : {}),
      }
      const id = await db.queue.put(next)
      if (next.status === 'choose' && !next.candidates?.length && id !== undefined) needCandidates.add(id)
      return
    }
    case 'cover': {
      const instanceId = Number(r.key)
      const item = await db.collection.get(instanceId)
      if (v === null) {
        await db.covers.delete(instanceId)
        if (item?.originalCover) {
          await db.collection.update(instanceId, {
            cover: item.originalCover,
            thumb: item.originalThumb,
            originalCover: undefined,
            originalThumb: undefined,
          })
        }
      } else {
        await db.covers.put(v)
        if (item && item.cover !== v.cover) {
          await db.collection.update(instanceId, {
            cover: v.cover,
            thumb: v.thumb,
            originalCover: item.originalCover ?? item.cover,
            originalThumb: item.originalThumb ?? item.thumb,
          })
        }
      }
      return
    }
    case 'value':
      return v === null ? db.valueHistory.delete(r.key) : db.valueHistory.put(v)
    case 'year':
      return v === null ? db.masters.delete(Number(r.key)) : db.masters.put(v)
    case 'length':
      return v === null ? db.lengths.delete(Number(r.key)) : db.lengths.put(v)
    case 'barcode':
      return v === null ? db.barcodes.delete(r.key) : db.barcodes.put(v)
    case 'setting':
      if (!SYNCED_SETTINGS.has(r.key)) return
      return v === null ? db.settings.delete(r.key) : db.settings.put(v)
  }
}

function applyPref(r: Row) {
  if (!SYNCED_PREFS.has(r.key)) return
  applyingPrefs = true
  try {
    if (r.value === null) removePref(r.key)
    else writePref(r.key, JSON.parse(r.value))
  } finally {
    applyingPrefs = false
  }
  if (r.key === 'platter.theme') applyTheme()
  if (r.key === 'platter.accent') applyAccent()
  if (r.key === 'platter.valueLayout') reloadLayout()
  window.dispatchEvent(new Event('platter-prefs'))
}

const TABLES = [...Object.keys(SPECS), 'collection', 'outbox']

// Another device's changes. One not yet sent from here that's newer stays.
export async function applyRows(rows: Row[]) {
  const prefs: Row[] = []
  await db.transaction('rw', TABLES, async (tx) => {
    quiet.add(tx.idbtrans)
    for (const r of rows) {
      const mine = await db.outbox.get([r.kind, r.key])
      if (mine && mine.at > r.updatedAt) continue
      if (mine) await db.outbox.delete([r.kind, r.key])
      if (r.kind === 'pref') prefs.push(r)
      else await applyRow(r)
    }
  })
  prefs.forEach(applyPref)
}

// ---- push and pull ----

export async function pushAll(api: CloudApi) {
  for (;;) {
    const entries = await db.outbox.orderBy('at').limit(200).toArray()
    if (!entries.length) return
    const rows: Row[] = await Promise.all(
      entries.map(async (e) => {
        const v = await localValue(e.kind, e.key)
        return { kind: e.kind, key: e.key, value: v === undefined ? null : JSON.stringify(v), updatedAt: e.at }
      }),
    )
    const { seqs } = await api.push(rows)
    await db.transaction('rw', [db.outbox, db.queue], async (tx) => {
      quiet.add(tx.idbtrans)
      for (const [i, e] of entries.entries()) {
        // changed again while this was on its way: that change goes next time
        const now = await db.outbox.get([e.kind, e.key])
        if (now?.at === e.at) await db.outbox.delete([e.kind, e.key])
        if (e.kind === 'batch' && seqs[i] > 0) await db.queue.where('uid').equals(e.key).modify({ seq: seqs[i] })
      }
    })
  }
}

// false when the account has nothing on the server (never turned on, or deleted from another device)
export async function pullAll(api: CloudApi): Promise<boolean> {
  let since = (await getSetting<number>(CLOUD.cursor)) ?? 0
  for (;;) {
    const r = await api.pull(since)
    if (!r.exists) return false
    await applyRows(r.rows)
    since = r.seq
    await setSetting(CLOUD.cursor, since)
    if (!r.more) return true
  }
}

// Everything already here, marked as old so anything the server has wins
async function noteEverything() {
  const entries: OutboxEntry[] = []
  for (const [table, spec] of Object.entries(SPECS)) {
    for (const row of await db.table(table).toArray()) {
      const key = spec.key(row)
      if (key === undefined || key === null) continue
      if (spec.kind === 'setting' && !SYNCED_SETTINGS.has(String(key))) continue
      entries.push({ kind: spec.kind, key: String(key), at: 1 })
    }
  }
  for (const key of SYNCED_PREFS) if (readPref(key) !== null) entries.push({ kind: 'pref', key, at: 1 })
  const waiting = new Set((await db.outbox.toArray()).map((e) => `${e.kind}:${e.key}`))
  await db.outbox.bulkPut(entries.filter((e) => !waiting.has(`${e.kind}:${e.key}`)))
}

export async function turnOn(api: CloudApi) {
  await setSetting(CLOUD.enabled, true)
  await setSetting(CLOUD.cursor, 0)
  await pullAll(api)
  await noteEverything()
  await pushAll(api)
  await setSetting(CLOUD.syncedAt, Date.now())
}

export async function turnOff() {
  await setSetting(CLOUD.enabled, false)
  await setSetting(CLOUD.syncedAt, null)
  await setSetting(CLOUD.checked, true) // don't switch itself back on
  await db.outbox.clear()
}

export async function syncNow(api: CloudApi): Promise<'ok' | 'gone'> {
  await pushAll(api)
  if (!(await pullAll(api))) {
    // deleted from another device
    await turnOff()
    return 'gone'
  }
  await setSetting(CLOUD.syncedAt, Date.now())
  return 'ok'
}

// Once per sign-in: if this account already syncs from another device, this one joins in
export async function joinIfSynced(api: CloudApi): Promise<boolean> {
  if (await getSetting<boolean>(CLOUD.checked)) return false
  const r = await api.pull(0)
  await setSetting(CLOUD.checked, true)
  if (!r.exists) return false
  await turnOn(api)
  return true
}

// Before adding a batch record to Discogs: mark it as this device's on the server, unless another
// device changed it first (most likely by starting to add it). A server that can't be reached
// doesn't stop the add.
export async function claimBatch(api: CloudApi, item: QueueItem, by: string, startedAt: number): Promise<boolean> {
  if (!item.uid) return true
  const value = { ...batchValue(item), status: 'adding', addingBy: by, addStartedAt: startedAt }
  try {
    const { seqs } = await api.push([
      { kind: 'batch', key: item.uid, value: JSON.stringify(value), updatedAt: Date.now(), ifSeq: item.seq ?? 0 },
    ])
    if (seqs[0] > 0) {
      await db.transaction('rw', db.queue, async (tx) => {
        quiet.add(tx.idbtrans)
        await db.queue.update(item.id!, { seq: seqs[0] })
      })
      return true
    }
    return false
  } catch (e) {
    return !(e instanceof CloudError) || e.status === 0 || e.status >= 500
  }
}
