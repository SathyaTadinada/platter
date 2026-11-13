// Cloud sync: keeps what a person saves in Platter (plays, value history, settings…) so every
// device they use gets the same. An account belongs to a Discogs user, confirmed by the server
// (account.ts). A password is optional and never reaches the server: the browser stretches it into
// a proof, and the server keeps a fingerprint of that. Each browser that gets in holds a device key
// of its own, and a device that's in can hand out a short pairing code to let another one in.

import { categoryOf, parseOff, type Category } from './categories'

// The parts of D1 used here, so tests can run the same code on SQLite
export type Stmt = {
  bind(...values: unknown[]): Stmt
  all<T>(): Promise<{ results: T[] }>
  first<T>(): Promise<T | null>
  run(): Promise<{ meta: { changes: number } }>
}
export type DB = {
  prepare(sql: string): Stmt
  batch(stmts: Stmt[]): Promise<{ results?: unknown[]; meta: { changes: number } }[]>
}

export type SyncEnv = {
  DB: DB
  SYNC_KEY?: string // base64, 32 bytes; encrypts secrets like the ListenBrainz token
}

export type InRow = { kind: string; key: string; value: string | null; updatedAt: number; deleted?: boolean; ifSeq?: number }
export type OutRow = { kind: string; key: string; value: string | null; updatedAt: number; deleted: boolean; seq: number }

export const KINDS = new Set(['play', 'value', 'cover', 'year', 'length', 'barcode', 'batch', 'setting', 'pref'])
// encrypted at rest; the key is a Worker secret, not in the database
const SECRET = new Set(['setting:listenbrainz'])

export const MAX_PUSH = 200
export const MAX_PULL = 1000
const MAX_VALUE = 100_000
export const PAIRING_TTL = 10 * 60 * 1000

export class SyncError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

// ---- bits ----

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
export const sha256 = async (s: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

export function parseName(x: unknown): string {
  if (typeof x !== 'string' || !x.trim() || x.length > 100) throw new SyncError(400, 'Bad name')
  return x.trim().toLowerCase()
}

export function parseProof(x: unknown): string {
  if (typeof x !== 'string' || !/^[0-9a-f]{64}$/.test(x)) throw new SyncError(400, 'Bad password')
  return x
}

// ---- accounts and devices ----

export const newId = () => b64url(random(16))

// What the browser calls itself ("Safari on iPhone"), for the device list
export function parseDeviceName(x: unknown): string | null {
  return typeof x === 'string' && x.trim() ? x.trim().slice(0, 60) : null
}

export async function newDevice(db: DB, account: string, now: number, name: string | null = null): Promise<string> {
  const token = b64url(random(32))
  await db
    .prepare('INSERT INTO devices (token, account, created_at, name, last_seen_at) VALUES (?1, ?2, ?3, ?4, ?3)')
    .bind(await sha256(token), account, now, name)
    .run()
  return token
}

export async function nameExists(db: DB, name: string): Promise<boolean> {
  return Boolean(await db.prepare('SELECT 1 AS x FROM accounts WHERE name = ?1 LIMIT 1').bind(name).first())
}

// Lets a browser in with a password. Accounts are found by Discogs user ID; one that hasn't been
// tied to its Discogs user yet (made before the server could confirm them) by name. A password
// never makes an account.
export async function signIn(
  db: DB,
  who: { discogsId?: number; name: string },
  proof: string,
  now = Date.now(),
  deviceName: string | null = null,
): Promise<{ device: string }> {
  const proofHash = await sha256(proof)
  const found =
    (who.discogsId !== undefined
      ? await db
          .prepare('SELECT id FROM accounts WHERE discogs_id = ?1 AND proof = ?2')
          .bind(who.discogsId, proofHash)
          .first<{ id: string }>()
      : null) ??
    (await db
      .prepare('SELECT id FROM accounts WHERE name = ?1 AND proof = ?2 AND discogs_id IS NULL')
      .bind(who.name, proofHash)
      .first<{ id: string }>())
  if (!found) throw new SyncError(401, 'Wrong password')
  return { device: await newDevice(db, found.id, now, deviceName) }
}

const SEEN_EVERY = 60 * 60 * 1000

export async function deviceAccount(db: DB, device: unknown, now = Date.now()): Promise<string> {
  if (typeof device !== 'string' || !device || device.length > 100) throw new SyncError(401, 'Not signed in to sync')
  const token = await sha256(device)
  const row = await db
    .prepare('SELECT account, last_seen_at FROM devices WHERE token = ?1')
    .bind(token)
    .first<{ account: string; last_seen_at: number | null }>()
  if (!row) throw new SyncError(401, 'Not signed in to sync')
  // for the device list; an hour is close enough, and saves a write on every request
  if ((row.last_seen_at ?? 0) < now - SEEN_EVERY)
    await db.prepare('UPDATE devices SET last_seen_at = ?2 WHERE token = ?1').bind(token, now).run()
  return row.account
}

export async function setPassword(db: DB, account: string, proof: string) {
  await db
    .prepare('UPDATE accounts SET proof = ?2 WHERE id = ?1')
    .bind(account, await sha256(proof))
    .run()
}

// This browser stops syncing; the account and other devices carry on
export async function leave(db: DB, device: string) {
  await db
    .prepare('DELETE FROM devices WHERE token = ?1')
    .bind(await sha256(device))
    .run()
}

// Everything kept for the account: its rows, devices, codes, passkeys, and the account itself
export async function forget(db: DB, account: string) {
  await db.batch([
    db.prepare('DELETE FROM rows WHERE account = ?1').bind(account),
    db.prepare('DELETE FROM devices WHERE account = ?1').bind(account),
    db.prepare('DELETE FROM pairings WHERE account = ?1').bind(account),
    db.prepare('DELETE FROM passkeys WHERE account = ?1').bind(account),
    db.prepare('DELETE FROM challenges WHERE account = ?1').bind(account),
    db.prepare('DELETE FROM accounts WHERE id = ?1').bind(account),
  ])
}

// ---- pairing codes ----

// no 0/O or 1/I, so a code read off a screen is typed right
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const normalCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '')

export async function newPairing(db: DB, account: string, now = Date.now()): Promise<{ code: string; expiresAt: number }> {
  const raw = [...random(6)].map((b) => ALPHABET[b % ALPHABET.length]).join('')
  const expiresAt = now + PAIRING_TTL
  await db.batch([
    db.prepare('DELETE FROM pairings WHERE expires_at < ?1 OR account = ?2').bind(now, account),
    db.prepare('INSERT INTO pairings (code, account, expires_at) VALUES (?1, ?2, ?3)').bind(await sha256(raw), account, expiresAt),
  ])
  return { code: `${raw.slice(0, 3)}-${raw.slice(3)}`, expiresAt }
}

export async function usePairing(
  db: DB,
  code: unknown,
  now = Date.now(),
  deviceName: string | null = null,
): Promise<{ device: string; name: string }> {
  if (typeof code !== 'string' || normalCode(code).length !== 6) throw new SyncError(400, 'Bad code')
  const hash = await sha256(normalCode(code))
  const found = await db
    .prepare('SELECT p.account, a.name FROM pairings p JOIN accounts a ON a.id = p.account WHERE p.code = ?1 AND p.expires_at >= ?2')
    .bind(hash, now)
    .first<{ account: string; name: string }>()
  if (!found) throw new SyncError(401, 'That code is wrong or has expired')
  await db.prepare('DELETE FROM pairings WHERE code = ?1').bind(hash).run()
  return { device: await newDevice(db, found.account, now, deviceName), name: found.name }
}

// ---- what syncs ----

// The rows a category covers, as a WHERE clause on kind and key
function rowsOf(c: Category): string {
  switch (c) {
    case 'plays':
      return "kind = 'play'"
    case 'value':
      return "kind = 'value'"
    case 'covers':
      return "kind = 'cover'"
    case 'batch':
      return "(kind = 'batch' OR (kind = 'setting' AND key = 'batchShared'))"
    case 'listenbrainz':
      return "(kind = 'setting' AND key = 'listenbrainz')"
    case 'catalog':
      return "kind IN ('year', 'length', 'barcode')"
    case 'settings':
      return "(kind = 'pref' OR (kind = 'setting' AND key NOT IN ('listenbrainz', 'batchShared')))"
  }
}

// Switching a category off deletes what the server has of it; devices keep their own
export async function setOff(db: DB, account: string, off: unknown): Promise<Category[]> {
  const list = parseOff(off)
  await db.batch([
    db.prepare('UPDATE accounts SET off = ?2 WHERE id = ?1').bind(account, JSON.stringify(list)),
    ...list.map((c) => db.prepare(`DELETE FROM rows WHERE account = ?1 AND ${rowsOf(c)}`).bind(account)),
  ])
  return list
}

// ---- secrets ----

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function aesKey(env: SyncEnv): Promise<CryptoKey> {
  if (!env.SYNC_KEY) throw new SyncError(500, 'Sync key missing')
  return crypto.subtle.importKey('raw', unb64(env.SYNC_KEY), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function seal(env: SyncEnv, plain: string): Promise<string> {
  const iv = random(12)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), new TextEncoder().encode(plain)))
  return 'enc1:' + b64(new Uint8Array([...iv, ...ct]))
}

export async function unseal(env: SyncEnv, stored: string): Promise<string> {
  if (!stored.startsWith('enc1:')) return stored
  const all = unb64(stored.slice(5))
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, await aesKey(env), all.slice(12))
  return new TextDecoder().decode(plain)
}

// ---- push and pull ----

export function parseRows(x: unknown): InRow[] {
  if (!Array.isArray(x) || x.length > MAX_PUSH) throw new SyncError(400, 'Bad rows')
  return x.map((r: InRow) => {
    const ok =
      r &&
      KINDS.has(r.kind) &&
      typeof r.key === 'string' &&
      r.key.length > 0 &&
      r.key.length <= 200 &&
      (r.value === null || (typeof r.value === 'string' && r.value.length <= MAX_VALUE)) &&
      Number.isFinite(r.updatedAt) &&
      (r.ifSeq === undefined || Number.isInteger(r.ifSeq))
    if (!ok) throw new SyncError(400, 'Bad row')
    const deleted = Boolean(r.deleted) || r.value === null
    return { kind: r.kind, key: r.key, value: deleted ? null : r.value, updatedAt: r.updatedAt, deleted, ifSeq: r.ifSeq }
  })
}

async function accountState(db: DB, account: string): Promise<{ seq: number; off: Category[] } | null> {
  const acc = await db.prepare('SELECT seq, off FROM accounts WHERE id = ?1').bind(account).first<{ seq: number; off: string }>()
  return acc && { seq: acc.seq, off: parseOff(JSON.parse(acc.off)) }
}

// Saves rows; the newest edit of each wins, and rows in a switched-off category are left out. A row
// with ifSeq is only saved if nothing changed it since the device last saw it (seq 0: it doesn't
// exist yet), which is how two devices can't both start adding the same batch record. Returns each
// row's new seq, or 0 where it wasn't saved.
export async function push(db: DB, env: SyncEnv, account: string, input: InRow[]): Promise<{ seq: number; seqs: number[] }> {
  const acc = await accountState(db, account)
  if (!acc) throw new SyncError(401, 'Not signed in to sync')
  const off = new Set(acc.off)
  const keep = input.map((r) => !off.has(categoryOf(r.kind, r.key)))
  const rows = input.filter((_, i) => keep[i])
  if (!rows.length) return { seq: acc.seq, seqs: input.map(() => 0) }

  const values = await Promise.all(rows.map((r) => (r.value !== null && SECRET.has(`${r.kind}:${r.key}`) ? seal(env, r.value) : r.value)))
  const n = rows.length
  const del = (r: InRow, i: number) => (r.deleted || values[i] === null ? 1 : 0)
  // every row gets the next number up, all in one transaction, so a pull never sees half a push
  const stmts = [
    db.prepare('UPDATE accounts SET seq = seq + ?2 WHERE id = ?1').bind(account, n),
    ...rows.map((r, i) => {
      const seq = `(SELECT seq FROM accounts WHERE id = ?1) - ${n - 1 - i}`
      if (r.ifSeq === undefined) {
        return db
          .prepare(
            `INSERT INTO rows (account, kind, key, value, updated_at, deleted, seq) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ${seq})
             ON CONFLICT (account, kind, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at,
               deleted = excluded.deleted, seq = excluded.seq
             WHERE excluded.updated_at > rows.updated_at`,
          )
          .bind(account, r.kind, r.key, values[i], r.updatedAt, del(r, i))
      }
      if (r.ifSeq === 0) {
        return db
          .prepare(
            `INSERT INTO rows (account, kind, key, value, updated_at, deleted, seq) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ${seq})
             ON CONFLICT (account, kind, key) DO NOTHING`,
          )
          .bind(account, r.kind, r.key, values[i], r.updatedAt, del(r, i))
      }
      return db
        .prepare(
          `UPDATE rows SET value = ?4, updated_at = ?5, deleted = ?6, seq = ${seq}
           WHERE account = ?1 AND kind = ?2 AND key = ?3 AND seq = ?7`,
        )
        .bind(account, r.kind, r.key, values[i], r.updatedAt, del(r, i), r.ifSeq)
    }),
    db.prepare('SELECT seq FROM accounts WHERE id = ?1').bind(account),
  ]
  const results = await db.batch(stmts)
  const last = (results.at(-1)?.results?.[0] as { seq: number } | undefined)?.seq ?? 0
  const saved = rows.map((_, i) => (results[i + 1].meta.changes > 0 ? last - (n - 1 - i) : 0))
  let j = 0
  return { seq: last, seqs: keep.map((k) => (k ? saved[j++] : 0)) }
}

export async function pull(
  db: DB,
  env: SyncEnv,
  account: string,
  since: number,
): Promise<{ rows: OutRow[]; seq: number; more: boolean; off: Category[] }> {
  const acc = await accountState(db, account)
  if (!acc) throw new SyncError(401, 'Not signed in to sync')
  const { results } = await db
    .prepare('SELECT kind, key, value, updated_at, deleted, seq FROM rows WHERE account = ?1 AND seq > ?2 ORDER BY seq LIMIT ?3')
    .bind(account, since, MAX_PULL)
    .all<{ kind: string; key: string; value: string | null; updated_at: number; deleted: number; seq: number }>()
  const rows = await Promise.all(
    results.map(async (r) => ({
      kind: r.kind,
      key: r.key,
      value: r.value !== null && SECRET.has(`${r.kind}:${r.key}`) ? await unseal(env, r.value) : r.value,
      updatedAt: r.updated_at,
      deleted: r.deleted === 1,
      seq: r.seq,
    })),
  )
  const more = rows.length === MAX_PULL
  // A push saves its rows and the account's seq together, so everything up to acc.seq was already
  // there for the query above. Numbers taken by edits that lost to a newer one leave gaps.
  const seq = more ? rows.at(-1)!.seq : Math.max(since, acc.seq, rows.at(-1)?.seq ?? 0)
  return { rows, seq, more, off: acc.off }
}
