// The Platter account: one per Discogs user, found by the Discogs user ID the server confirmed
// itself (confirm.ts). Logging in with Discogs is always a way in; passkeys, a password, and pairing
// codes are the others.

import type { Identity } from './confirm'
import { newDevice, newId, SyncError, UNSAID, type About, type DB, type DeviceKind } from './sync'

export type Account = {
  id: string
  name: string
  discogsId: number | null
  password: boolean
  passkeys: number
  admin: boolean
  badges: string[]
}

type AccountRow = {
  id: string
  name: string
  discogs_id: number | null
  proof: string | null
  admin: number
  badges: string
  passkeys: number
}

const SELECT =
  'SELECT a.id, a.name, a.discogs_id, a.proof, a.admin, a.badges, (SELECT COUNT(*) FROM passkeys p WHERE p.account = a.id) AS passkeys FROM accounts a'

function account(r: AccountRow): Account {
  let badges: string[] = []
  try {
    const b = JSON.parse(r.badges)
    if (Array.isArray(b)) badges = b.filter((x) => typeof x === 'string')
  } catch {
    // none
  }
  return { id: r.id, name: r.name, discogsId: r.discogs_id, password: r.proof !== null, passkeys: r.passkeys, admin: r.admin === 1, badges }
}

export function parseDiscogsId(x: unknown): number {
  if (!Number.isSafeInteger(x) || (x as number) <= 0) throw new SyncError(400, 'Bad Discogs ID')
  return x as number
}

export async function accountById(db: DB, id: string): Promise<Account | null> {
  const r = await db.prepare(`${SELECT} WHERE a.id = ?1`).bind(id).first<AccountRow>()
  return r && account(r)
}

export async function accountByDiscogs(db: DB, discogsId: number): Promise<Account | null> {
  const r = await db.prepare(`${SELECT} WHERE a.discogs_id = ?1`).bind(discogsId).first<AccountRow>()
  return r && account(r)
}

// Whether this Discogs user has an account, and which ways in it has besides Discogs, so the app
// only spends a confirmation when there's an account to join and can offer the right fallback
export async function waysIn(db: DB, discogsId: number): Promise<{ exists: boolean; password: boolean; passkeys: boolean }> {
  const a = await accountByDiscogs(db, discogsId)
  return { exists: Boolean(a), password: Boolean(a?.password), passkeys: Boolean(a?.passkeys) }
}

// After a confirmed Discogs login: lets this browser into the user's account, or makes one when
// asked. Keeps the name in step with Discogs, which allows renames.
export async function discogsSignIn(
  db: DB,
  who: Identity,
  create: boolean,
  now = Date.now(),
  about: About = UNSAID,
): Promise<{ device: string | null; created: boolean }> {
  const name = who.username.toLowerCase()
  const found = await accountByDiscogs(db, who.id)
  if (found) {
    if (found.name !== name) await db.prepare('UPDATE accounts SET name = ?2 WHERE id = ?1').bind(found.id, name).run()
    return { device: await newDevice(db, found.id, now, about), created: false }
  }
  if (!create) return { device: null, created: false }
  const id = newId()
  await db.prepare('INSERT INTO accounts (id, name, discogs_id, created_at) VALUES (?1, ?2, ?3, ?4)').bind(id, name, who.id, now).run()
  return { device: await newDevice(db, id, now, about), created: true }
}

// An account made before confirmation existed picks up its Discogs user the first time one of its
// devices confirms. Only an account with no Discogs user yet, and only if no other account has it.
export async function link(db: DB, accountId: string, who: Identity): Promise<void> {
  const mine = await accountById(db, accountId)
  if (!mine) throw new SyncError(401, 'Not signed in to sync')
  if (mine.discogsId === who.id) return
  if (mine.discogsId !== null) throw new SyncError(409, 'This account belongs to another Discogs user')
  if (await accountByDiscogs(db, who.id)) throw new SyncError(409, 'This Discogs user already has an account')
  await db
    .prepare('UPDATE accounts SET discogs_id = ?2, name = ?3 WHERE id = ?1 AND discogs_id IS NULL')
    .bind(accountId, who.id, who.username.toLowerCase())
    .run()
}

// Only once the account has its Discogs user, which is then always a way back in
export async function removePassword(db: DB, accountId: string) {
  const r = await db.prepare('UPDATE accounts SET proof = NULL WHERE id = ?1 AND discogs_id IS NOT NULL').bind(accountId).run()
  if (!r.meta.changes) throw new SyncError(409, 'Log in with Discogs here first')
}

// ---- devices ----

export type DeviceInfo = {
  id: string
  name: string | null
  kind: DeviceKind | null
  createdAt: number
  lastSeenAt: number | null
  current: boolean
}

// Devices are told apart by the start of their key's fingerprint, never the key itself
const DEVICE_ID = 16

export async function listDevices(db: DB, accountId: string, currentToken: string): Promise<DeviceInfo[]> {
  const { results } = await db
    .prepare(
      'SELECT token, name, kind, created_at, last_seen_at FROM devices WHERE account = ?1 ORDER BY COALESCE(last_seen_at, created_at) DESC',
    )
    .bind(accountId)
    .all<{ token: string; name: string | null; kind: DeviceKind | null; created_at: number; last_seen_at: number | null }>()
  return results.map((d) => ({
    id: d.token.slice(0, DEVICE_ID),
    name: d.name,
    kind: d.kind,
    createdAt: d.created_at,
    lastSeenAt: d.last_seen_at,
    current: d.token === currentToken,
  }))
}

const parseDeviceId = (id: unknown) => {
  if (typeof id !== 'string' || id.length !== DEVICE_ID) throw new SyncError(400, 'Bad device')
  return id
}

export async function removeDevice(db: DB, accountId: string, id: unknown) {
  await db.prepare('DELETE FROM devices WHERE account = ?1 AND substr(token, 1, 16) = ?2').bind(accountId, parseDeviceId(id)).run()
}

export async function renameDevice(db: DB, accountId: string, id: unknown, name: unknown) {
  if (typeof name !== 'string' || !name.trim()) throw new SyncError(400, 'Bad name')
  await db
    .prepare('UPDATE devices SET name = ?3 WHERE account = ?1 AND substr(token, 1, 16) = ?2')
    .bind(accountId, parseDeviceId(id), name.trim().slice(0, 60))
    .run()
}
