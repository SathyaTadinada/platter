// Profiles: what someone chooses to show at /u/<their Discogs username>. Off until they turn a
// section on. The owner's devices publish the rows; a profile is read by username, never by account
// id, and only for an account the server has tied to a Discogs user, so the name is really theirs.
//
// Profile rows live in their own table. Nothing here reads the synced rows, so what a profile serves
// is only ever what its owner published.

import { accountById, type Account } from './account'
import { MAX_PUSH, SyncError, type DB } from './sync'

export const SECTIONS = ['collection', 'wantlist', 'stats', 'year'] as const
export type Section = (typeof SECTIONS)[number]

// Followers arrives with following, in phase 3
export const VISIBILITY = ['off', 'public'] as const
export type Visibility = (typeof VISIBILITY)[number]

export type Sections = Partial<Record<Section, Visibility>>

// The rows each section covers. A section that's off has none of them.
export const KINDS = { collection: 'item', wantlist: 'want', stats: 'stats', year: 'year' } as const
export type ProfileKind = (typeof KINDS)[Section]

const SECTION_OF = Object.fromEntries(Object.entries(KINDS).map(([s, k]) => [k, s])) as Record<ProfileKind, Section>

export const MAX_ROWS = 100 // one page of a profile's records
const MAX_VALUE = 4000

export type ProfileRow = { kind: ProfileKind; key: string; value: string; updatedAt: number }

// What a visitor sees before any rows: who it belongs to, and which sections they can look at
export type ProfileHead = {
  username: string
  badges: string[]
  memberSince: number
  publishedAt: number | null
  sections: Section[]
}

// ---- reading what the owner chose ----

export function parseSections(x: unknown): Sections {
  if (!x || typeof x !== 'object') throw new SyncError(400, 'Bad sections')
  const out: Sections = {}
  for (const [key, value] of Object.entries(x as Record<string, unknown>)) {
    if (!(SECTIONS as readonly string[]).includes(key)) throw new SyncError(400, 'Bad section')
    if (!(VISIBILITY as readonly string[]).includes(value as string)) throw new SyncError(400, 'Bad section')
    out[key as Section] = value as Visibility
  }
  return out
}

function readSections(stored: string): Sections {
  try {
    return parseSections(JSON.parse(stored))
  } catch {
    return {}
  }
}

const publicOnes = (s: Sections): Section[] => SECTIONS.filter((x) => s[x] === 'public')

type ProfileRecord = { sections: string; published_at: number | null }

// The owner's own view: every section, with the ones they haven't touched off
export async function settings(db: DB, account: string): Promise<{ sections: Sections; publishedAt: number | null }> {
  const row = await db.prepare('SELECT sections, published_at FROM profiles WHERE account = ?1').bind(account).first<ProfileRecord>()
  const saved = row ? readSections(row.sections) : {}
  return { sections: Object.fromEntries(SECTIONS.map((s) => [s, saved[s] ?? 'off'])) as Sections, publishedAt: row?.published_at ?? null }
}

// Turning a section off deletes what the server holds for it, so nothing lingers after it stops
// being shown. The rows go back up the next time its owner opens Platter.
export async function setSections(db: DB, account: string, input: unknown, now = Date.now()): Promise<Sections> {
  const wanted = parseSections(input)
  const { sections: before } = await settings(db, account)
  const sections = { ...before, ...wanted }
  const gone = SECTIONS.filter((s) => sections[s] === 'off' && before[s] !== 'off')
  await db.batch([
    db
      .prepare(
        `INSERT INTO profiles (account, sections, created_at) VALUES (?1, ?2, ?3)
         ON CONFLICT (account) DO UPDATE SET sections = excluded.sections`,
      )
      .bind(account, JSON.stringify(sections), now),
    ...gone.map((s) => db.prepare('DELETE FROM profile_rows WHERE account = ?1 AND kind = ?2').bind(account, KINDS[s])),
  ])
  return sections
}

// ---- publishing ----

export function parseRows(x: unknown): ProfileRow[] {
  if (!Array.isArray(x) || x.length > MAX_PUSH) throw new SyncError(400, 'Bad rows')
  return x.map((r: ProfileRow) => {
    const ok =
      r &&
      typeof r.kind === 'string' &&
      r.kind in SECTION_OF &&
      typeof r.key === 'string' &&
      r.key.length > 0 &&
      r.key.length <= 200 &&
      typeof r.value === 'string' &&
      r.value.length <= MAX_VALUE &&
      Number.isFinite(r.updatedAt)
    if (!ok) throw new SyncError(400, 'Bad row')
    return { kind: r.kind, key: r.key, value: r.value, updatedAt: r.updatedAt }
  })
}

// Rows for a section that's off are dropped rather than refused: a device that hasn't heard about
// the change yet shouldn't have its whole push turned away.
export async function publish(db: DB, account: string, rows: ProfileRow[], keys: unknown, now = Date.now()): Promise<{ saved: number }> {
  const { sections } = await settings(db, account)
  const on = (kind: ProfileKind) => sections[SECTION_OF[kind]] === 'public'
  const wanted = rows.filter((r) => on(r.kind))
  // the records this device no longer has, so a sold record leaves the profile
  const dropping = parseKeys(keys).filter((k) => on(k.kind))
  if (!wanted.length && !dropping.length) return { saved: 0 }
  await db.batch([
    db.prepare('UPDATE profiles SET published_at = ?2 WHERE account = ?1').bind(account, now),
    ...wanted.map((r) =>
      db
        .prepare(
          `INSERT INTO profile_rows (account, kind, key, value, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT (account, kind, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
           WHERE excluded.updated_at >= profile_rows.updated_at`,
        )
        .bind(account, r.kind, r.key, r.value, r.updatedAt),
    ),
    ...dropping.map((k) =>
      db.prepare('DELETE FROM profile_rows WHERE account = ?1 AND kind = ?2 AND key = ?3').bind(account, k.kind, k.key),
    ),
  ])
  return { saved: wanted.length }
}

function parseKeys(x: unknown): { kind: ProfileKind; key: string }[] {
  if (x === undefined) return []
  if (!Array.isArray(x) || x.length > MAX_PUSH) throw new SyncError(400, 'Bad keys')
  return x.map((k: { kind: ProfileKind; key: string }) => {
    if (!k || typeof k.key !== 'string' || !(k.kind in SECTION_OF)) throw new SyncError(400, 'Bad key')
    return { kind: k.kind, key: k.key }
  })
}

// ---- reading a profile ----

// Found by Discogs username, and only for an account tied to that Discogs user, so nobody can put a
// profile under someone else's name
async function owner(
  db: DB,
  username: unknown,
): Promise<(Account & { createdAt: number; publishedAt: number | null; sections: Sections }) | null> {
  if (typeof username !== 'string' || !username.trim() || username.length > 100) throw new SyncError(400, 'Bad username')
  const row = await db
    .prepare(
      `SELECT a.id, a.created_at, p.sections, p.published_at FROM accounts a JOIN profiles p ON p.account = a.id
       WHERE a.name = ?1 AND a.discogs_id IS NOT NULL`,
    )
    .bind(username.trim().toLowerCase())
    .first<ProfileRecord & { id: string; created_at: number }>()
  if (!row) return null
  const account = await accountById(db, row.id)
  return account && { ...account, createdAt: row.created_at, publishedAt: row.published_at, sections: readSections(row.sections) }
}

export async function head(db: DB, username: unknown): Promise<ProfileHead | null> {
  const found = await owner(db, username)
  if (!found) return null
  const sections = publicOnes(found.sections)
  if (!sections.length) return null // nothing shared, so there's nothing to show
  return { username: found.name, badges: found.badges, memberSince: found.createdAt, publishedAt: found.publishedAt, sections }
}

// A page of one section's rows. Refused unless that section is on, whoever is asking.
export async function rows(
  db: DB,
  username: unknown,
  section: unknown,
  after: unknown,
): Promise<{ rows: Omit<ProfileRow, 'kind'>[]; more: boolean }> {
  if (!(SECTIONS as readonly string[]).includes(section as string)) throw new SyncError(400, 'Bad section')
  const found = await owner(db, username)
  if (!found || found.sections[section as Section] !== 'public') throw new SyncError(404, 'Nothing to show')
  const from = after === undefined || after === null ? '' : String(after)
  if (from.length > 200) throw new SyncError(400, 'Bad cursor')
  const { results } = await db
    .prepare('SELECT key, value, updated_at FROM profile_rows WHERE account = ?1 AND kind = ?2 AND key > ?3 ORDER BY key LIMIT ?4')
    .bind(found.id, KINDS[section as Section], from, MAX_ROWS)
    .all<{ key: string; value: string; updated_at: number }>()
  return { rows: results.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updated_at })), more: results.length === MAX_ROWS }
}
