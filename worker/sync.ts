// Cloud sync: keeps what a person saves in Platter (plays, value history, settings…) so every
// device they sign in on gets the same. Who they are comes from their Discogs sign-in, which is
// checked with Discogs once and then remembered only as a hash.

import { header, signParams } from './oauth'

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
  DISCOGS_CONSUMER_KEY: string
  DISCOGS_CONSUMER_SECRET: string
}

export type Login = { kind: 'token' | 'oauth'; token: string; secret?: string }

export type InRow = { kind: string; key: string; value: string | null; updatedAt: number; deleted?: boolean; ifSeq?: number }
export type OutRow = { kind: string; key: string; value: string | null; updatedAt: number; deleted: boolean; seq: number }

export const KINDS = new Set(['play', 'value', 'cover', 'year', 'length', 'barcode', 'batch', 'setting', 'pref'])
// encrypted at rest; the key is a Worker secret, not in the database
const SECRET = new Set(['setting:listenbrainz'])

export const MAX_PUSH = 200
export const MAX_PULL = 1000
const MAX_VALUE = 100_000
const REVERIFY = 30 * 24 * 60 * 60 * 1000

export class SyncError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

// ---- who's asking ----

export async function loginHash(l: Login): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${l.kind}\n${l.token}\n${l.secret ?? ''}`))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function parseLogin(x: unknown): Login {
  const l = x as Login | undefined
  if (!l || (l.kind !== 'token' && l.kind !== 'oauth') || typeof l.token !== 'string' || !l.token || l.token.length > 200) {
    throw new SyncError(400, 'Bad sign-in')
  }
  if (l.kind === 'oauth' && (typeof l.secret !== 'string' || !l.secret || l.secret.length > 200)) throw new SyncError(400, 'Bad sign-in')
  return { kind: l.kind, token: l.token, secret: l.kind === 'oauth' ? l.secret : undefined }
}

const IDENTITY = 'https://api.discogs.com/oauth/identity'
const USER_AGENT = 'Platter/1.0 +https://platter.tadinada.com'

// Asks Discogs whose sign-in this is. null means Discogs turned it down. A busy Discogs gets
// one more try after a moment: this goes out from Cloudflare's shared addresses.
export async function askDiscogs(
  l: Login,
  env: SyncEnv,
  fetchFn: typeof fetch = fetch,
  sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
): Promise<string | null> {
  let auth: string
  if (l.kind === 'token') auth = `Discogs token=${l.token}`
  else {
    const params = await signParams({
      method: 'GET',
      url: IDENTITY,
      consumerKey: env.DISCOGS_CONSUMER_KEY,
      consumerSecret: env.DISCOGS_CONSUMER_SECRET,
      token: l.token,
      tokenSecret: l.secret,
    })
    auth = header(params)
  }
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null
    try {
      res = await fetchFn(IDENTITY, { headers: { Authorization: auth, 'User-Agent': USER_AGENT } })
    } catch {
      // no answer at all
    }
    if (res?.status === 401 || res?.status === 403) return null
    if (res?.ok) {
      const body = (await res.json()) as { username?: unknown }
      if (typeof body.username !== 'string' || !body.username) throw new SyncError(503, 'Discogs sent no username')
      return body.username
    }
    if (attempt === 0 && (!res || res.status === 429 || res.status >= 500)) {
      await sleep(1500)
      continue
    }
    throw new SyncError(503, res ? `Discogs returned ${res.status}` : "Couldn't reach Discogs")
  }
}

// The account a sign-in belongs to: remembered, or checked with Discogs (again after 30 days,
// so a sign-in revoked on Discogs stops working here too). With remember off, a newly checked
// sign-in isn't kept: a new device asking whether its account syncs leaves nothing behind
// unless it does (see remember below).
export async function whoIs(
  db: DB,
  l: Login,
  ask: (l: Login) => Promise<string | null>,
  now = Date.now(),
  keep = true,
): Promise<{ username: string; hash: string }> {
  const hash = await loginHash(l)
  const known = await db
    .prepare('SELECT username, verified_at FROM logins WHERE hash = ?1')
    .bind(hash)
    .first<{ username: string; verified_at: number }>()
  if (known && now - known.verified_at < REVERIFY) return { username: known.username, hash }
  const username = await ask(l)
  if (!username) {
    await db.prepare('DELETE FROM logins WHERE hash = ?1').bind(hash).run()
    throw new SyncError(401, 'Discogs no longer accepts this sign-in')
  }
  if (keep) await remember(db, hash, username, now)
  return { username, hash }
}

export async function remember(db: DB, hash: string, username: string, now = Date.now()) {
  await db
    .prepare(
      'INSERT INTO logins (hash, username, verified_at) VALUES (?1, ?2, ?3) ON CONFLICT (hash) DO UPDATE SET username = ?2, verified_at = ?3',
    )
    .bind(hash, username, now)
    .run()
}

// ---- secrets ----

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function aesKey(env: SyncEnv): Promise<CryptoKey> {
  if (!env.SYNC_KEY) throw new SyncError(500, 'Sync key missing')
  return crypto.subtle.importKey('raw', unb64(env.SYNC_KEY), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function seal(env: SyncEnv, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
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

// Saves rows; the newest edit of each wins. A row with ifSeq is only saved if nothing changed it
// since the device last saw it (seq 0: it doesn't exist yet), which is how two devices can't both
// start adding the same batch record. Returns each row's new seq, or 0 where it wasn't saved.
export async function push(db: DB, env: SyncEnv, username: string, rows: InRow[]): Promise<{ seq: number; seqs: number[] }> {
  if (!rows.length) {
    const acc = await db.prepare('SELECT seq FROM accounts WHERE username = ?1').bind(username).first<{ seq: number }>()
    return { seq: acc?.seq ?? 0, seqs: [] }
  }
  const values = await Promise.all(rows.map((r) => (r.value !== null && SECRET.has(`${r.kind}:${r.key}`) ? seal(env, r.value) : r.value)))
  const n = rows.length
  // every row gets the next number up, all in one transaction, so a pull never sees half a push
  const stmts = [
    db
      .prepare('INSERT INTO accounts (username, seq) VALUES (?1, ?2) ON CONFLICT (username) DO UPDATE SET seq = seq + ?2')
      .bind(username, n),
    ...rows.map((r, i) => {
      const seq = `(SELECT seq FROM accounts WHERE username = ?1) - ${n - 1 - i}`
      if (r.ifSeq === undefined) {
        return db
          .prepare(
            `INSERT INTO rows (username, kind, key, value, updated_at, deleted, seq) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ${seq})
             ON CONFLICT (username, kind, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at,
               deleted = excluded.deleted, seq = excluded.seq
             WHERE excluded.updated_at > rows.updated_at`,
          )
          .bind(username, r.kind, r.key, values[i], r.updatedAt, r.deleted || values[i] === null ? 1 : 0)
      }
      if (r.ifSeq === 0) {
        return db
          .prepare(
            `INSERT INTO rows (username, kind, key, value, updated_at, deleted, seq) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ${seq})
             ON CONFLICT (username, kind, key) DO NOTHING`,
          )
          .bind(username, r.kind, r.key, values[i], r.updatedAt, r.deleted || values[i] === null ? 1 : 0)
      }
      return db
        .prepare(
          `UPDATE rows SET value = ?4, updated_at = ?5, deleted = ?6, seq = ${seq}
           WHERE username = ?1 AND kind = ?2 AND key = ?3 AND seq = ?7`,
        )
        .bind(username, r.kind, r.key, values[i], r.updatedAt, r.deleted || values[i] === null ? 1 : 0, r.ifSeq)
    }),
    db.prepare('SELECT seq FROM accounts WHERE username = ?1').bind(username),
  ]
  const results = await db.batch(stmts)
  const last = (results.at(-1)?.results?.[0] as { seq: number } | undefined)?.seq ?? 0
  const seqs = rows.map((_, i) => (results[i + 1].meta.changes > 0 ? last - (n - 1 - i) : 0))
  return { seq: last, seqs }
}

export async function pull(
  db: DB,
  env: SyncEnv,
  username: string,
  since: number,
): Promise<{ exists: boolean; rows: OutRow[]; seq: number; more: boolean }> {
  const acc = await db.prepare('SELECT seq FROM accounts WHERE username = ?1').bind(username).first<{ seq: number }>()
  if (!acc) return { exists: false, rows: [], seq: 0, more: false }
  const { results } = await db
    .prepare('SELECT kind, key, value, updated_at, deleted, seq FROM rows WHERE username = ?1 AND seq > ?2 ORDER BY seq LIMIT ?3')
    .bind(username, since, MAX_PULL)
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
  return { exists: true, rows, seq, more }
}

// Everything kept for the account, and every sign-in remembered for it
export async function forget(db: DB, username: string) {
  await db.batch([
    db.prepare('DELETE FROM rows WHERE username = ?1').bind(username),
    db.prepare('DELETE FROM accounts WHERE username = ?1').bind(username),
    db.prepare('DELETE FROM logins WHERE username = ?1').bind(username),
  ])
}
