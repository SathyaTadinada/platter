// Profiles: what someone chooses to show at /u/<their Discogs username>. Off until they turn a
// section on. The owner's devices publish the rows; a profile is read by username, never by account
// id, and only for an account the server has tied to a Discogs user, so the name is really theirs.
//
// Profile rows live in their own table. Nothing here reads the synced rows, so what a profile serves
// is only ever what its owner published.

import { accountById, type Account } from './account'
import { looksOf, type BadgeLook } from './badges'
import { approveWaiting, blockedEither, relation, statusOf, type Person, type Relation, type Status } from './follow'
import { MAX_PUSH, SyncError, type DB } from './sync'

export const SECTIONS = ['collection', 'wantlist', 'stats', 'year'] as const
export type Section = (typeof SECTIONS)[number]

// Whether a section is one of the parts the profile shows. Who gets to see the profile at all is
// one setting for the whole thing (Who below), not something each section decides.
export const VISIBILITY = ['off', 'public'] as const
export type Visibility = (typeof VISIBILITY)[number]

// private: there's no profile, and the link doesn't work. unlisted: anyone with the link. public:
// that, and they turn up when people search. Anything but private shows at least the name and
// picture, with whichever sections are on under them. A new account starts private.
export const WHO = ['private', 'followers', 'unlisted', 'public'] as const
export type Who = (typeof WHO)[number]

export type Sections = Partial<Record<Section, Visibility>>

// The rows each section covers. A section that's off has none of them.
export const KINDS = { collection: 'item', wantlist: 'want', stats: 'stats', year: 'year' } as const
// Their Discogs picture, which belongs to no section: it goes up while any of them is on
export const ABOUT = 'about'
export type ProfileKind = (typeof KINDS)[Section] | typeof ABOUT

const SECTION_OF = Object.fromEntries(Object.entries(KINDS).map(([s, k]) => [k, s])) as Record<string, Section>

export const MAX_ROWS = 100 // one page of a profile's records
const MAX_VALUE = 20_000 // a Stats summary or a year, with a few records' covers in it

export type ProfileRow = { kind: ProfileKind; key: string; value: string; updatedAt: number }

// What a visitor sees before any rows: who it belongs to, and which sections they can look at
export type ProfileHead = {
  // a Followers profile someone isn't approved for: their name and picture, and nothing else
  locked: boolean
  relation?: Relation // to the signed-in viewer, when there is one and it isn't them
  username: string
  badges: BadgeLook[] // as the profile shows them, names and all
  memberSince: number
  publishedAt: number | null
  sections: Section[]
  about: string | null // JSON their devices sent, with their Discogs picture
  followers: number
  following: number
  bio: string // shown even on a locked profile, so someone can decide whether to ask
  setup: Setup // only to those who can see the whole profile
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

type ProfileRecord = {
  sections: string
  published_at: number | null
  visibility: Who
  hidden: number
  details?: string
  bio?: string
  setup?: string
}

// The owner's own view: every section, with the ones they haven't touched off
export async function settings(
  db: DB,
  account: string,
): Promise<{ sections: Sections; publishedAt: number | null; who: Who; hidden: boolean; details: string[]; bio: string; setup: Setup }> {
  const row = await db
    .prepare('SELECT sections, published_at, visibility, hidden, details, bio, setup FROM profiles WHERE account = ?1')
    .bind(account)
    .first<ProfileRecord>()
  const saved = row ? readSections(row.sections) : {}
  return {
    sections: Object.fromEntries(SECTIONS.map((s) => [s, saved[s] ?? 'off'])) as Sections,
    publishedAt: row?.published_at ?? null,
    who: row?.visibility ?? 'private',
    hidden: row?.hidden === 1,
    details: readDetails(row?.details),
    bio: row?.bio ?? '',
    setup: readSetup(row?.setup),
  }
}

// ---- a bio and a setup ----

// Plain text the owner writes, shown to whoever can see the profile. Kept short, and without links,
// which is most of what would make it worth spamming.
export const BIO_MAX = 160
export const SETUP_MAX = 60
export const SETUP_SLOTS = ['turntable', 'cartridge', 'preamp', 'amp', 'speakers'] as const
export type SetupSlot = (typeof SETUP_SLOTS)[number]
export type Setup = Partial<Record<SetupSlot, string>>

const LINK = /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|me|ly|xyz|app|shop|store|link)\b/i

// One line or a few, without control characters or runs of blank lines
function cleanText(x: unknown, max: number, lines: boolean): string {
  if (typeof x !== 'string') throw new SyncError(400, 'Bad text')
  const text = x
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .replace(lines ? /\n{3,}/g : /\n+/g, lines ? '\n\n' : ' ')
    .trim()
  if ([...text].length > max) throw new SyncError(400, 'Too long')
  if (LINK.test(text)) throw new SyncError(400, 'Links can’t go on a profile')
  return text
}

export function parseSetup(x: unknown): Setup {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new SyncError(400, 'Bad setup')
  const out: Setup = {}
  for (const [key, value] of Object.entries(x as Record<string, unknown>)) {
    if (!(SETUP_SLOTS as readonly string[]).includes(key)) throw new SyncError(400, 'Bad setup')
    const text = cleanText(value, SETUP_MAX, false)
    if (text) out[key as SetupSlot] = text
  }
  return out
}

function readSetup(stored: string | undefined): Setup {
  try {
    return parseSetup(JSON.parse(stored ?? '{}'))
  } catch {
    return {}
  }
}

export async function setAbout(
  db: DB,
  account: string,
  bio: unknown,
  setup: unknown,
  now = Date.now(),
): Promise<{ bio: string; setup: Setup }> {
  const about = { bio: cleanText(bio, BIO_MAX, true), setup: parseSetup(setup) }
  await db
    .prepare(
      `INSERT INTO profiles (account, bio, setup, visibility, created_at) VALUES (?1, ?2, ?3, 'private', ?4)
       ON CONFLICT (account) DO UPDATE SET bio = excluded.bio, setup = excluded.setup`,
    )
    .bind(account, about.bio, JSON.stringify(about.setup), now)
    .run()
  return about
}

// ---- details about each copy ----

// 'rating', and the ids of the owner's Discogs fields. Each device sends just these with the
// collection; the server only keeps the choice, so every device sends the same.
const MAX_DETAILS = 40

export function parseDetails(x: unknown): string[] {
  if (!Array.isArray(x) || x.length > MAX_DETAILS) throw new SyncError(400, 'Bad details')
  if (!x.every((d) => typeof d === 'string' && (d === 'rating' || /^\d{1,9}$/.test(d)))) throw new SyncError(400, 'Bad details')
  return [...new Set(x as string[])]
}

function readDetails(stored: string | undefined): string[] {
  try {
    return parseDetails(JSON.parse(stored ?? '[]'))
  } catch {
    return []
  }
}

export async function setDetails(db: DB, account: string, input: unknown, now = Date.now()): Promise<string[]> {
  const details = parseDetails(input)
  await db
    .prepare(
      `INSERT INTO profiles (account, details, visibility, created_at) VALUES (?1, ?2, 'private', ?3)
       ON CONFLICT (account) DO UPDATE SET details = excluded.details`,
    )
    .bind(account, JSON.stringify(details), now)
    .run()
  return details
}

export async function setWho(db: DB, account: string, who: unknown, now = Date.now()): Promise<Who> {
  if (!(WHO as readonly string[]).includes(who as string)) throw new SyncError(400, 'Bad setting')
  await db
    .prepare(
      `INSERT INTO profiles (account, visibility, created_at) VALUES (?1, ?2, ?3)
       ON CONFLICT (account) DO UPDATE SET visibility = excluded.visibility`,
    )
    .bind(account, who, now)
    .run()
  if (who === 'unlisted' || who === 'public') await approveWaiting(db, account)
  return who as Who
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
        `INSERT INTO profiles (account, sections, visibility, created_at) VALUES (?1, ?2, 'private', ?3)
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
      (r.kind === ABOUT || r.kind in SECTION_OF) &&
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
export async function publish(db: DB, account: string, rows: ProfileRow[], now = Date.now()): Promise<{ saved: number }> {
  const { sections, who } = await settings(db, account)
  // their picture goes with the profile itself, which has one even with every section off
  const anything = who !== 'private' || SECTIONS.some((x) => sections[x] === 'public')
  const on = (kind: ProfileKind) => (kind === ABOUT ? anything : sections[SECTION_OF[kind]] === 'public')
  const wanted = rows.filter((r) => on(r.kind))
  if (!wanted.length) return { saved: 0 }
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
  ])
  return { saved: wanted.length }
}

// After a device has sent a whole section, whatever it didn't send isn't there any more: a sold
// record, or one it moved out of a crate. Everything in a pass carries the same time, so anything
// older than it was left out.
export async function sweep(db: DB, account: string, section: unknown, before: unknown): Promise<{ gone: number }> {
  if (!(SECTIONS as readonly string[]).includes(section as string)) throw new SyncError(400, 'Bad section')
  if (!Number.isFinite(before)) throw new SyncError(400, 'Bad time')
  const r = await db
    .prepare('DELETE FROM profile_rows WHERE account = ?1 AND kind = ?2 AND updated_at < ?3')
    .bind(account, KINDS[section as Section], before)
    .run()
  return { gone: r.meta.changes }
}

// Takes down rows by key. A device that knows which records went sends just those, so a pass only
// writes what changed rather than the whole section again.
const DELETE_AT_ONCE = 90 // D1 takes up to 100 values per statement

export async function unpublish(db: DB, account: string, section: unknown, keys: unknown): Promise<{ gone: number }> {
  if (!(SECTIONS as readonly string[]).includes(section as string)) throw new SyncError(400, 'Bad section')
  if (!Array.isArray(keys) || keys.length > MAX_PUSH || !keys.every((k) => typeof k === 'string' && k.length > 0 && k.length <= 200)) {
    throw new SyncError(400, 'Bad keys')
  }
  if (!keys.length) return { gone: 0 }
  const kind = KINDS[section as Section]
  const chunks: string[][] = []
  for (let i = 0; i < keys.length; i += DELETE_AT_ONCE) chunks.push(keys.slice(i, i + DELETE_AT_ONCE))
  const results = await db.batch(
    chunks.map((c) =>
      db
        .prepare(`DELETE FROM profile_rows WHERE account = ?1 AND kind = ?2 AND key IN (${c.map((_, i) => `?${i + 3}`).join(', ')})`)
        .bind(account, kind, ...c),
    ),
  )
  return { gone: results.reduce((n, r) => n + (r.meta?.changes ?? 0), 0) }
}

// ---- who can see what ----

// What a viewer gets of a profile: all of it, just the name and picture (a Followers profile they
// aren't approved for), or nothing (they've blocked each other). Viewers without an account are
// anonymous, which is enough for Link only and Public.
type Access = 'full' | 'locked' | 'none'

async function access(db: DB, owner: { id: string; who: Who }, viewer: string | null): Promise<Access> {
  if (viewer === owner.id) return 'full'
  if (viewer && (await blockedEither(db, viewer, owner.id))) return 'none'
  if (owner.who !== 'followers') return 'full'
  return viewer && (await statusOf(db, viewer, owner.id)) === 'accepted' ? 'full' : 'locked'
}

// Their picture, without the record count that belongs to their collection
const pictureOnly = (about: string | null) => {
  if (!about) return null
  try {
    const { avatar } = JSON.parse(about) as { avatar?: string }
    return avatar ? JSON.stringify({ avatar }) : null
  } catch {
    return null
  }
}

// ---- finding someone ----

export type Found = { username: string; about: string | null; publishedAt: number | null; following?: 'none' | Status }

export const MAX_FOUND = 20
// Part of a username finds them, among Public profiles and Followers ones (so people can ask to
// follow). Anyone the viewer has blocked, or who blocked them, isn't found. A signed-in viewer also
// gets whether they follow each one.
export async function search(db: DB, query: unknown, viewer: string | null = null): Promise<{ found: Found[] }> {
  if (query !== undefined && typeof query !== 'string') throw new SyncError(400, 'Bad search')
  const q = (query ?? '').trim().toLowerCase().replace(/^@/, '').slice(0, 100)
  if (!q) return { found: [] }
  const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`
  const { results } = await db
    .prepare(
      `SELECT a.name, p.published_at, p.visibility, f.status AS following,
         (SELECT value FROM profile_rows r WHERE r.account = a.id AND r.kind = 'about' AND r.key = 'about') AS about
       FROM accounts a JOIN profiles p ON p.account = a.id
         LEFT JOIN follows f ON f.follower = ?4 AND f.followee = a.id
       WHERE a.discogs_id IS NOT NULL AND p.visibility IN ('public', 'followers') AND p.hidden = 0
         AND a.name LIKE ?2 ESCAPE '\\'
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = a.id AND b.blocked = ?4) OR (b.blocker = ?4 AND b.blocked = a.id))
       ORDER BY (a.name = ?3) DESC, (instr(a.name, ?3) = 1) DESC, a.name
       LIMIT ?1`,
    )
    .bind(MAX_FOUND, like, q, viewer ?? '')
    .all<{ name: string; published_at: number | null; visibility: Who; following: Status | null; about: string | null }>()
  const found = results.map((r) => ({
    username: r.name,
    ...(r.visibility === 'followers' && r.following !== 'accepted'
      ? { about: pictureOnly(r.about), publishedAt: null }
      : { about: r.about, publishedAt: r.published_at }),
    ...(viewer ? { following: r.following ?? ('none' as const) } : {}),
  }))
  return { found }
}

// ---- reading a profile ----

// Found by Discogs username, and only for an account tied to that Discogs user, so nobody can put a
// profile under someone else's name. A private or hidden one isn't found at all, nor is an account
// that never set one up.
async function owner(
  db: DB,
  username: unknown,
): Promise<(Account & { createdAt: number; publishedAt: number | null; sections: Sections; who: Who; bio: string; setup: Setup }) | null> {
  if (typeof username !== 'string' || !username.trim() || username.length > 100) throw new SyncError(400, 'Bad username')
  const row = await db
    .prepare(
      `SELECT a.id, a.created_at, p.sections, p.published_at, p.visibility, p.bio, p.setup FROM accounts a JOIN profiles p ON p.account = a.id
       WHERE a.name = ?1 AND a.discogs_id IS NOT NULL AND p.visibility <> 'private' AND p.hidden = 0`,
    )
    .bind(username.trim().toLowerCase())
    .first<ProfileRecord & { id: string; created_at: number }>()
  if (!row) return null
  const account = await accountById(db, row.id)
  return (
    account && {
      ...account,
      createdAt: row.created_at,
      publishedAt: row.published_at,
      sections: readSections(row.sections),
      who: row.visibility,
      bio: row.bio ?? '',
      setup: readSetup(row.setup),
    }
  )
}

export async function head(db: DB, username: unknown, viewer: string | null = null): Promise<ProfileHead | null> {
  const found = await owner(db, username)
  if (!found) return null
  const sections = publicOnes(found.sections)
  const can = await access(db, found, viewer)
  if (can === 'none') return null
  const about = await db
    .prepare('SELECT value FROM profile_rows WHERE account = ?1 AND kind = ?2 AND key = ?2')
    .bind(found.id, ABOUT)
    .first<{ value: string }>()
  const locked = can === 'locked'
  // how many, never who: the lists themselves are only for their owner
  const count = (sql: string) =>
    db
      .prepare(sql)
      .bind(found.id)
      .first<{ n: number }>()
      .then((r) => r?.n ?? 0)
  const [followers, following] = await Promise.all([
    count("SELECT COUNT(*) AS n FROM follows WHERE followee = ?1 AND status = 'accepted'"),
    count("SELECT COUNT(*) AS n FROM follows WHERE follower = ?1 AND status = 'accepted'"),
  ])
  return {
    followers,
    following,
    locked,
    relation: viewer && viewer !== found.id ? await relation(db, viewer, found.id) : undefined,
    username: found.name,
    badges: await looksOf(db, found.badges),
    memberSince: found.createdAt,
    publishedAt: locked ? null : found.publishedAt,
    sections: locked ? [] : sections,
    about: locked ? pictureOnly(about?.value ?? null) : (about?.value ?? null),
    bio: found.bio,
    setup: locked ? {} : found.setup,
  }
}

// Who follows someone, or who they follow, for anyone who can see their profile. Only people who
// can be found in Search are named, since they already chose to be seen; the rest are counted.
// The viewer always sees themselves.
const MAX_PEOPLE = 500

export async function people(
  db: DB,
  username: unknown,
  list: unknown,
  viewer: string | null = null,
): Promise<{ people: Person[]; more: number }> {
  if (list !== 'followers' && list !== 'following') throw new SyncError(400, 'Bad list')
  const found = await owner(db, username)
  if (!found || (await access(db, found, viewer)) !== 'full') throw new SyncError(404, 'Nothing to show')
  const [theirs, other] = list === 'followers' ? ['followee', 'follower'] : ['follower', 'followee']
  const { results } = await db
    .prepare(
      `SELECT a.id, a.name AS username, x.created_at AS since, p.visibility,
         (a.discogs_id IS NOT NULL AND p.visibility IN ('public', 'followers') AND p.hidden = 0
           AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = a.id AND b.blocked = ?2) OR (b.blocker = ?2 AND b.blocked = a.id))) AS listed,
         (SELECT value FROM profile_rows r WHERE r.account = a.id AND r.kind = 'about' AND r.key = 'about') AS about
       FROM follows x JOIN accounts a ON a.id = x.${other} LEFT JOIN profiles p ON p.account = a.id
       WHERE x.${theirs} = ?1 AND x.status = 'accepted'
       ORDER BY x.created_at DESC, a.name`,
    )
    .bind(found.id, viewer ?? '')
    .all<{ id: string; username: string; since: number; visibility: Who | null; listed: number; about: string | null }>()
  const shown = results.filter((r) => r.listed === 1 || r.id === viewer)
  return {
    people: shown.slice(0, MAX_PEOPLE).map((r) => ({
      username: r.username,
      since: r.since,
      about: r.visibility === 'followers' && r.id !== viewer ? pictureOnly(r.about) : r.about,
    })),
    more: results.length - Math.min(shown.length, MAX_PEOPLE),
  }
}

// A page of one section's rows. Refused unless that section is on and the viewer may see it.
export async function rows(
  db: DB,
  username: unknown,
  section: unknown,
  after: unknown,
  viewer: string | null = null,
): Promise<{ rows: Omit<ProfileRow, 'kind'>[]; more: boolean }> {
  if (!(SECTIONS as readonly string[]).includes(section as string)) throw new SyncError(400, 'Bad section')
  const found = await owner(db, username)
  if (!found || found.sections[section as Section] !== 'public' || (await access(db, found, viewer)) !== 'full') {
    throw new SyncError(404, 'Nothing to show')
  }
  const from = after === undefined || after === null ? '' : String(after)
  if (from.length > 200) throw new SyncError(400, 'Bad cursor')
  const { results } = await db
    .prepare('SELECT key, value, updated_at FROM profile_rows WHERE account = ?1 AND kind = ?2 AND key > ?3 ORDER BY key LIMIT ?4')
    .bind(found.id, KINDS[section as Section], from, MAX_ROWS)
    .all<{ key: string; value: string; updated_at: number }>()
  return { rows: results.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updated_at })), more: results.length === MAX_ROWS }
}

// One record from someone's collection, for the record page opened from their profile. The same
// checks as a page of them: the collection is on and the viewer may see it.
export async function item(
  db: DB,
  username: unknown,
  key: unknown,
  viewer: string | null = null,
): Promise<{ key: string; value: string } | null> {
  if (typeof key !== 'string' || !key || key.length > 200) throw new SyncError(400, 'Bad record')
  const found = await owner(db, username)
  if (!found || found.sections.collection !== 'public' || (await access(db, found, viewer)) !== 'full') return null
  const row = await db
    .prepare("SELECT key, value FROM profile_rows WHERE account = ?1 AND kind = 'item' AND key = ?2")
    .bind(found.id, key)
    .first<{ key: string; value: string }>()
  return row ?? null
}
