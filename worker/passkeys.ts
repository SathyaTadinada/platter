// Passkeys for the Platter account: any number, each with a name. Registering needs a device that's
// already in; signing in with one gives this browser a device key, like a password or pairing code.

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { accountByDiscogs, accountById } from './account'
import { newDevice, newId, SyncError, type DB } from './sync'

// Passkeys belong to a domain, so they only work on the real site and in local testing. Preview
// links and 127.0.0.1 (an IP can't have passkeys) use the other ways in.
const RELYING_PARTIES: Record<string, string> = {
  'https://platter.tadinada.com': 'platter.tadinada.com',
  'http://localhost:5173': 'localhost',
}

export type RelyingParty = { id: string; origin: string }

export function relyingParty(origin: string | null): RelyingParty {
  const id = origin ? RELYING_PARTIES[origin] : undefined
  if (!id) throw new SyncError(400, "Passkeys don't work on this address")
  return { id, origin: origin! }
}

export const CHALLENGE_TTL = 5 * 60 * 1000

type PasskeyRow = {
  id: string
  account: string
  public_key: string
  counter: number
  transports: string
  name: string
  created_at: number
  last_used_at: number | null
}
export type PasskeyInfo = { id: string; name: string; createdAt: number; lastUsedAt: number | null }

const transportsOf = (r: PasskeyRow): string[] => {
  try {
    return JSON.parse(r.transports)
  } catch {
    return []
  }
}

export function parsePasskeyName(x: unknown): string {
  if (typeof x !== 'string' || !x.trim()) return 'Passkey'
  return x.trim().slice(0, 60)
}

async function rows(db: DB, account: string): Promise<PasskeyRow[]> {
  const { results } = await db.prepare('SELECT * FROM passkeys WHERE account = ?1 ORDER BY created_at').bind(account).all<PasskeyRow>()
  return results
}

async function saveChallenge(
  db: DB,
  account: string | null,
  challenge: string,
  purpose: 'register' | 'signin',
  now: number,
): Promise<string> {
  const id = newId()
  await db.batch([
    db.prepare('DELETE FROM challenges WHERE expires_at < ?1').bind(now),
    db
      .prepare('INSERT INTO challenges (id, account, challenge, purpose, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(id, account, challenge, purpose, now + CHALLENGE_TTL),
  ])
  return id
}

// One use: taken out as it's read
async function takeChallenge(
  db: DB,
  id: unknown,
  purpose: 'register' | 'signin',
  now: number,
): Promise<{ account: string | null; challenge: string }> {
  if (typeof id !== 'string' || !id || id.length > 100) throw new SyncError(400, 'Bad challenge')
  const row = await db
    .prepare('SELECT account, challenge FROM challenges WHERE id = ?1 AND purpose = ?2 AND expires_at >= ?3')
    .bind(id, purpose, now)
    .first<{ account: string | null; challenge: string }>()
  await db.prepare('DELETE FROM challenges WHERE id = ?1').bind(id).run()
  if (!row) throw new SyncError(401, 'That took too long. Try again.')
  return row
}

// ---- adding one ----

export async function registerOptions(db: DB, account: string, rp: RelyingParty, now = Date.now()) {
  const acc = await accountById(db, account)
  if (!acc) throw new SyncError(401, 'Not signed in to sync')
  const options = await generateRegistrationOptions({
    rpName: 'Platter',
    rpID: rp.id,
    userName: acc.name,
    userID: new TextEncoder().encode(acc.id),
    attestationType: 'none',
    excludeCredentials: (await rows(db, account)).map((r) => ({ id: r.id, transports: transportsOf(r) })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  })
  return { id: await saveChallenge(db, account, options.challenge, 'register', now), options }
}

export async function register(
  db: DB,
  account: string,
  rp: RelyingParty,
  challengeId: unknown,
  response: unknown,
  name: string,
  now = Date.now(),
): Promise<PasskeyInfo> {
  const ch = await takeChallenge(db, challengeId, 'register', now)
  if (ch.account !== account) throw new SyncError(401, 'That took too long. Try again.')
  let result: Awaited<ReturnType<typeof verifyRegistrationResponse>>
  try {
    result = await verifyRegistrationResponse({
      response: response as RegistrationResponseJSON,
      expectedChallenge: ch.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: false,
    })
  } catch {
    throw new SyncError(400, "That passkey didn't work")
  }
  if (!result.verified) throw new SyncError(400, "That passkey didn't work")
  const c = result.registrationInfo.credential
  await db
    .prepare(
      'INSERT INTO passkeys (id, account, public_key, counter, transports, name, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT (id) DO NOTHING',
    )
    .bind(c.id, account, isoBase64URL.fromBuffer(c.publicKey), c.counter, JSON.stringify(c.transports ?? []), name, now)
    .run()
  return { id: c.id, name, createdAt: now, lastUsedAt: null }
}

// ---- signing in with one ----

// For the account of the Discogs user logged in here: only its passkeys are offered, and only they're
// accepted, so a passkey never brings in someone else's account
export async function signInOptions(db: DB, rp: RelyingParty, discogsId: number, now = Date.now()) {
  const acc = await accountByDiscogs(db, discogsId)
  if (!acc?.passkeys) throw new SyncError(404, 'No passkeys for this account')
  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: 'preferred',
    allowCredentials: (await rows(db, acc.id)).map((r) => ({ id: r.id, transports: transportsOf(r) })),
  })
  return { id: await saveChallenge(db, acc.id, options.challenge, 'signin', now), options }
}

export async function signInWithPasskey(
  db: DB,
  rp: RelyingParty,
  challengeId: unknown,
  response: unknown,
  now = Date.now(),
  deviceName: string | null = null,
): Promise<{ device: string; name: string }> {
  const ch = await takeChallenge(db, challengeId, 'signin', now)
  const res = response as AuthenticationResponseJSON
  if (typeof res?.id !== 'string') throw new SyncError(400, "That passkey didn't work")
  const key = await db.prepare('SELECT * FROM passkeys WHERE id = ?1').bind(res.id).first<PasskeyRow>()
  if (!key || key.account !== ch.account) throw new SyncError(401, "That passkey isn't for this account")
  let result: Awaited<ReturnType<typeof verifyAuthenticationResponse>>
  try {
    result = await verifyAuthenticationResponse({
      response: res,
      expectedChallenge: ch.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: false,
      credential: { id: key.id, publicKey: isoBase64URL.toBuffer(key.public_key), counter: key.counter, transports: transportsOf(key) },
    })
  } catch {
    throw new SyncError(401, "That passkey didn't work")
  }
  if (!result.verified) throw new SyncError(401, "That passkey didn't work")
  await db
    .prepare('UPDATE passkeys SET counter = ?2, last_used_at = ?3 WHERE id = ?1')
    .bind(key.id, result.authenticationInfo.newCounter, now)
    .run()
  const acc = await accountById(db, key.account)
  if (!acc) throw new SyncError(401, "That passkey isn't for this account")
  return { device: await newDevice(db, acc.id, now, deviceName), name: acc.name }
}

// ---- managing them ----

export async function listPasskeys(db: DB, account: string): Promise<PasskeyInfo[]> {
  return (await rows(db, account)).map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, lastUsedAt: r.last_used_at }))
}

const parseKeyId = (x: unknown) => {
  if (typeof x !== 'string' || !x || x.length > 1400) throw new SyncError(400, 'Bad passkey')
  return x
}

export async function renamePasskey(db: DB, account: string, id: unknown, name: unknown) {
  await db
    .prepare('UPDATE passkeys SET name = ?3 WHERE account = ?1 AND id = ?2')
    .bind(account, parseKeyId(id), parsePasskeyName(name))
    .run()
}

export async function removePasskey(db: DB, account: string, id: unknown) {
  await db.prepare('DELETE FROM passkeys WHERE account = ?1 AND id = ?2').bind(account, parseKeyId(id)).run()
}
