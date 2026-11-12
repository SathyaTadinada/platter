import { categoryOf, type Category } from '../../worker/categories'
import { quiet, setCapture, SPECS, SYNCED_SETTINGS, type Kind } from '../db/capture'
import { db, getSetting, setSetting, type OutboxEntry, type QueueItem } from '../db/db'
import { applyAccent } from './accent'
import { prefListeners, readPref, removePref, writePref } from './prefs'
import { reloadLayout } from './statsLayout'
import { applyTheme } from './theme'

// Cloud sync: what you save in Platter follows you to every device. An account is your Discogs
// username and a sync password; each browser that gets in (with the password, or a pairing code from
// a device that's already in) keeps a device key. Changes are noted as they happen (db/capture.ts),
// sent in batches, and other devices' changes come back by number (the server's seq) so each pull
// only carries what's new. The newest edit wins.

export const SYNCED_PREFS = new Set(['platter.accent', 'platter.theme', 'platter.valueLayout'])

// per device, so none of these sync
export const CLOUD = { cursor: 'cloudCursor', syncedAt: 'cloudSyncedAt', checked: 'cloudChecked', off: 'cloudOff' } as const

export type Row = { kind: Kind; key: string; value: string | null; updatedAt: number; deleted?: boolean; ifSeq?: number; seq?: number }
type PullResult = { rows: Row[]; seq: number; more: boolean; off: Category[] }

export class CloudError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

// ---- this device's key ----

// Kept with the preferences rather than the database, so signing out of Discogs doesn't sign this
// browser out of sync ("Delete everything" does). It's only used while the same Discogs account is in.
const KEY = 'platter.sync'
export type Device = { name: string; device: string }

export function savedDevice(): Device | null {
  try {
    const d = JSON.parse(readPref(KEY) ?? 'null') as Device | null
    return d && typeof d.name === 'string' && typeof d.device === 'string' ? d : null
  } catch {
    return null
  }
}
const saveDevice = (d: Device | null) => (d ? writePref(KEY, JSON.stringify(d)) : removePref(KEY))
export const deviceFor = (username: string) => {
  const d = savedDevice()
  return d && d.name === username.toLowerCase() ? d : null
}

// The password, stretched here so the server never sees it and guessing it is slow. The name is the
// salt, so the same password makes a different proof for every account.
export async function proofFor(name: string, password: string, iterations = 310_000): Promise<string> {
  const enc = new TextEncoder()
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`platter-sync\n${name.toLowerCase()}`), iterations },
    base,
    256,
  )
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---- talking to the server ----

function failure(status: number) {
  if (status === 429 || status === 503) return "Couldn't sync just now. Trying again shortly."
  return "Couldn't sync. Trying again shortly."
}

async function call<T>(fetchFn: typeof fetch, path: string, body: object): Promise<T> {
  let res: Response
  try {
    res = await fetchFn(`/api/sync/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new CloudError(0, "Can't reach Platter's server.")
  }
  if (!res.ok) throw new CloudError(res.status, failure(res.status))
  return res.json() as Promise<T>
}

// Getting in, before there's a device key
export const cloudEntry = (fetchFn: typeof fetch = (...a) => fetch(...a)) => ({
  exists: (name: string) => call<{ exists: boolean }>(fetchFn, 'exists', { name }).then((r) => r.exists),
  signIn: (name: string, proof: string, fresh = false) => call<{ device: string }>(fetchFn, 'signin', { name, proof, fresh }),
  join: (code: string) => call<{ device: string; name: string }>(fetchFn, 'join', { code }),
})

export type CloudApi = {
  pull(since: number): Promise<PullResult>
  push(rows: Row[]): Promise<{ seq: number; seqs: number[] }>
  pair(): Promise<{ code: string; expiresAt: number }>
  password(proof: string): Promise<unknown>
  setOff(off: Category[]): Promise<{ off: Category[] }>
  leave(): Promise<unknown>
  forget(): Promise<unknown>
}

export function cloudApi(device: string, fetchFn: typeof fetch = (...a) => fetch(...a)): CloudApi {
  const c = <T>(path: string, body: object = {}) => call<T>(fetchFn, path, { device, ...body })
  return {
    pull: (since) => c('pull', { since }),
    push: (rows) => c('push', { rows }),
    pair: () => c('pair'),
    password: (proof) => c('password', { proof }),
    setOff: (off) => c('off', { off }),
    leave: () => c('leave'),
    forget: () => c('forget'),
  }
}

// ---- noting changes ----

let onChange = () => {}
let applyingPrefs = false
// categories switched off on the Sync page: not noted, not sent
let off = new Set<Category>()

async function note(kind: Kind, keys: string[], at: number) {
  const wanted = keys.filter((key) => !off.has(categoryOf(kind, key)))
  if (!wanted.length) return
  await db.outbox.bulkPut(wanted.map((key) => ({ kind, key, at })))
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

// Brings in what other devices changed, and follows the account's "What syncs" switches: a category
// switched back on gets everything here sent up again
export async function pullAll(api: CloudApi) {
  let since = (await getSetting<number>(CLOUD.cursor)) ?? 0
  for (;;) {
    const r = await api.pull(since)
    await followOff(r.off)
    await applyRows(r.rows)
    since = r.seq
    await setSetting(CLOUD.cursor, since)
    if (!r.more) return
  }
}

async function followOff(next: Category[]) {
  const before = new Set((await getSetting<Category[]>(CLOUD.off)) ?? [])
  off = new Set(next)
  const backOn = [...before].filter((c) => !off.has(c))
  // anything waiting in a category that's now off isn't wanted
  const waiting = await db.outbox.toArray()
  const drop = waiting.filter((e) => off.has(categoryOf(e.kind, e.key)))
  if (drop.length) await db.outbox.bulkDelete(drop.map((e) => [e.kind, e.key] as [Kind, string]))
  await setSetting(CLOUD.off, next)
  if (backOn.length) await noteEverything(new Set(backOn))
}

// Everything already here, marked as old so anything the server has wins
async function noteEverything(only?: Set<Category>) {
  const want = (kind: Kind, key: string) => {
    const c = categoryOf(kind, key)
    return !off.has(c) && (!only || only.has(c))
  }
  const entries: OutboxEntry[] = []
  for (const [table, spec] of Object.entries(SPECS)) {
    for (const row of await db.table(table).toArray()) {
      const key = spec.key(row)
      if (key === undefined || key === null) continue
      if (spec.kind === 'setting' && !SYNCED_SETTINGS.has(String(key))) continue
      if (want(spec.kind, String(key))) entries.push({ kind: spec.kind, key: String(key), at: 1 })
    }
  }
  for (const key of SYNCED_PREFS) if (readPref(key) !== null && want('pref', key)) entries.push({ kind: 'pref', key, at: 1 })
  const waiting = new Set((await db.outbox.toArray()).map((e) => `${e.kind}:${e.key}`))
  await db.outbox.bulkPut(entries.filter((e) => !waiting.has(`${e.kind}:${e.key}`)))
}

// Everything the device knew about syncing, apart from what it synced
async function resetDevice() {
  saveDevice(null)
  off = new Set()
  await db.outbox.clear()
  for (const key of [CLOUD.cursor, CLOUD.syncedAt, CLOUD.off]) await db.settings.delete(key)
}

// A device that just got in: the first round brings everything down, then sends up what only it had
async function firstRound(api: CloudApi) {
  await setSetting(CLOUD.cursor, 0)
  await pullAll(api)
  await noteEverything()
  await pushAll(api)
  await setSetting(CLOUD.syncedAt, Date.now())
}

async function start(name: string, device: string) {
  saveDevice({ name: name.toLowerCase(), device })
  try {
    await firstRound(cloudApi(device))
  } catch (e) {
    // still in; the next sync finishes the first round
    if (e instanceof CloudError && e.status === 401) await resetDevice()
    throw e
  }
}

// With the sync password. fresh starts a separate account when the name already has one with another password.
export async function signIn(username: string, password: string, fresh = false, entry = cloudEntry()) {
  const { device } = await entry.signIn(username, await proofFor(username, password), fresh)
  await start(username, device)
}

// With a code from a device that's already in. The code has to be for the Discogs account signed in here.
export async function joinWithCode(username: string, code: string, entry = cloudEntry()) {
  const { device, name } = await entry.join(code)
  if (name !== username.toLowerCase()) {
    await cloudApi(device)
      .leave()
      .catch(() => {})
    throw new CloudError(403, `That code is for ${name}, not ${username}.`)
  }
  await start(username, device)
}

export async function changePassword(api: CloudApi, username: string, password: string) {
  await api.password(await proofFor(username, password))
}

export async function setWhatSyncs(api: CloudApi, next: Category[]) {
  const { off: saved } = await api.setOff(next)
  await followOff(saved)
}

// This device stops syncing; the account and the other devices carry on
export async function leave(api: CloudApi) {
  await api.leave().catch(() => {})
  await resetDevice()
}

// The whole account, from every device
export async function forgetAccount(api: CloudApi) {
  await api.forget()
  await resetDevice()
}

// 'gone' when the device was signed out of sync elsewhere (or the account deleted): it stops here too
export async function syncNow(api: CloudApi): Promise<'ok' | 'gone'> {
  off = new Set((await getSetting<Category[]>(CLOUD.off)) ?? [])
  try {
    // never finished a first round: do it now, so everything here goes up
    if (!(await getSetting<number | null>(CLOUD.syncedAt))) await firstRound(api)
    else {
      await pushAll(api)
      await pullAll(api)
      await setSetting(CLOUD.syncedAt, Date.now())
    }
    return 'ok'
  } catch (e) {
    if (e instanceof CloudError && e.status === 401) {
      await resetDevice()
      return 'gone'
    }
    throw e
  }
}

// Before adding a batch record to Discogs: mark it as this device's on the server, unless another
// device changed it first (most likely by starting to add it). A server that can't be reached
// doesn't stop the add.
export async function claimBatch(api: CloudApi, item: QueueItem, by: string, startedAt: number): Promise<boolean> {
  if (!item.uid || off.has('batch')) return true
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
