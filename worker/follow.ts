// Following and blocking. Following a Followers profile sends a request its owner approves; following
// a Link only or Public one is instant, since it's already there to see. Only an account tied to
// a Discogs user can follow, so a name on someone's list is really that person.
//
// Blocking takes them off your followers and stops them following or seeing a Followers profile. It
// can't keep a Link only or Public profile from someone signed out, since nobody is checked there.

import { SyncError, type DB } from './sync'

export type Status = 'pending' | 'accepted'
export type Relation = { following: 'none' | Status; followsYou: boolean; blocked: boolean }
export type Person = { username: string; about: string | null; since: number }

const parseName = (x: unknown) => {
  if (typeof x !== 'string' || !x.trim() || x.length > 100) throw new SyncError(400, 'Bad username')
  return x.trim().toLowerCase()
}

// Someone by their Discogs username, if their account is tied to Discogs
async function idOf(db: DB, username: unknown): Promise<string | null> {
  const r = await db
    .prepare('SELECT id FROM accounts WHERE name = ?1 AND discogs_id IS NOT NULL')
    .bind(parseName(username))
    .first<{ id: string }>()
  return r?.id ?? null
}

async function tied(db: DB, account: string) {
  const r = await db.prepare('SELECT discogs_id FROM accounts WHERE id = ?1').bind(account).first<{ discogs_id: number | null }>()
  if (r?.discogs_id == null) throw new SyncError(403, 'Log in with Discogs on this device first')
}

export async function blockedEither(db: DB, a: string, b: string): Promise<boolean> {
  return Boolean(
    await db
      .prepare('SELECT 1 AS x FROM blocks WHERE (blocker = ?1 AND blocked = ?2) OR (blocker = ?2 AND blocked = ?1)')
      .bind(a, b)
      .first(),
  )
}

export async function statusOf(db: DB, follower: string, followee: string): Promise<Status | null> {
  const r = await db
    .prepare('SELECT status FROM follows WHERE follower = ?1 AND followee = ?2')
    .bind(follower, followee)
    .first<{ status: Status }>()
  return r?.status ?? null
}

export async function relation(db: DB, viewer: string, owner: string): Promise<Relation> {
  const [mine, theirs, blocked] = await Promise.all([
    statusOf(db, viewer, owner),
    statusOf(db, owner, viewer),
    db.prepare('SELECT 1 AS x FROM blocks WHERE blocker = ?1 AND blocked = ?2').bind(viewer, owner).first(),
  ])
  return { following: mine ?? 'none', followsYou: theirs === 'accepted', blocked: Boolean(blocked) }
}

// ---- following ----

export async function follow(db: DB, me: string, username: unknown, now = Date.now()): Promise<{ status: Status }> {
  await tied(db, me)
  const them = await idOf(db, username)
  if (!them || them === me) throw new SyncError(404, 'No profile here')
  // someone who blocked you looks the same as nobody at all
  if (await blockedEither(db, me, them)) throw new SyncError(404, 'No profile here')
  const p = await db
    .prepare('SELECT visibility, hidden FROM profiles WHERE account = ?1')
    .bind(them)
    .first<{ visibility: string; hidden: number }>()
  if (!p || p.hidden || p.visibility === 'private') throw new SyncError(404, 'No profile here')
  const status: Status = p.visibility === 'followers' ? 'pending' : 'accepted'
  await db
    .prepare(
      'INSERT INTO follows (follower, followee, status, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (follower, followee) DO NOTHING',
    )
    .bind(me, them, status, now)
    .run()
  return { status: (await statusOf(db, me, them)) ?? status }
}

// Unfollows, or takes back a request
export async function unfollow(db: DB, me: string, username: unknown) {
  const them = await idOf(db, username)
  if (them) await db.prepare('DELETE FROM follows WHERE follower = ?1 AND followee = ?2').bind(me, them).run()
}

export async function respond(db: DB, me: string, username: unknown, approve: boolean) {
  const them = await idOf(db, username)
  if (!them) throw new SyncError(404, 'No such request')
  const r = approve
    ? await db
        .prepare("UPDATE follows SET status = 'accepted' WHERE follower = ?1 AND followee = ?2 AND status = 'pending'")
        .bind(them, me)
        .run()
    : await db.prepare("DELETE FROM follows WHERE follower = ?1 AND followee = ?2 AND status = 'pending'").bind(them, me).run()
  if (!r.meta.changes) throw new SyncError(404, 'No such request')
}

export async function removeFollower(db: DB, me: string, username: unknown) {
  const them = await idOf(db, username)
  if (them) await db.prepare('DELETE FROM follows WHERE follower = ?1 AND followee = ?2').bind(them, me).run()
}

// How many are waiting to be approved, for the account page
export async function waiting(db: DB, me: string): Promise<number> {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM follows WHERE followee = ?1 AND status = 'pending'").bind(me).first<{ n: number }>()
  return r?.n ?? 0
}

// Moving off Followers lets in everyone who was waiting, since they could see it now anyway
export async function approveWaiting(db: DB, me: string) {
  await db.prepare("UPDATE follows SET status = 'accepted' WHERE followee = ?1 AND status = 'pending'").bind(me).run()
}

// ---- blocking ----

export async function block(db: DB, me: string, username: unknown, now = Date.now()) {
  const them = await idOf(db, username)
  if (!them || them === me) throw new SyncError(404, 'No such member')
  await db.batch([
    db.prepare('INSERT INTO blocks (blocker, blocked, created_at) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING').bind(me, them, now),
    db.prepare('DELETE FROM follows WHERE (follower = ?1 AND followee = ?2) OR (follower = ?2 AND followee = ?1)').bind(me, them),
  ])
}

export async function unblock(db: DB, me: string, username: unknown) {
  const them = await idOf(db, username)
  if (them) await db.prepare('DELETE FROM blocks WHERE blocker = ?1 AND blocked = ?2').bind(me, them).run()
}

// ---- lists ----

const PEOPLE = `SELECT a.name AS username, x.created_at AS since,
  (SELECT value FROM profile_rows r WHERE r.account = a.id AND r.kind = 'about' AND r.key = 'about') AS about`

export async function lists(
  db: DB,
  me: string,
): Promise<{ followers: Person[]; following: Person[]; requests: Person[]; blocked: Person[] }> {
  const q = (sql: string) =>
    db
      .prepare(`${PEOPLE} ${sql} ORDER BY x.created_at DESC, a.name`)
      .bind(me)
      .all<Person>()
      .then((r) => r.results)
  const [followers, following, requests, blocked] = await Promise.all([
    q("FROM follows x JOIN accounts a ON a.id = x.follower WHERE x.followee = ?1 AND x.status = 'accepted'"),
    q('FROM follows x JOIN accounts a ON a.id = x.followee WHERE x.follower = ?1'),
    q("FROM follows x JOIN accounts a ON a.id = x.follower WHERE x.followee = ?1 AND x.status = 'pending'"),
    q('FROM blocks x JOIN accounts a ON a.id = x.blocked WHERE x.blocker = ?1'),
  ])
  return { followers, following, requests, blocked }
}

// ---- what the people you follow added ----

export const FEED_PAGE = 50

// Newest first across everyone you follow whose Collection you can see. Item keys count down by date
// added, so ordering by key is already newest first, whoever's they are.
export async function feed(
  db: DB,
  me: string,
  after: unknown,
): Promise<{ items: { username: string; key: string; value: string }[]; more: boolean }> {
  const from = typeof after === 'string' && after.length <= 200 ? after : ''
  const { results } = await db
    .prepare(
      `SELECT a.name AS username, r.key, r.value FROM profile_rows r
       JOIN follows f ON f.followee = r.account AND f.follower = ?1 AND f.status = 'accepted'
       JOIN accounts a ON a.id = r.account
       JOIN profiles p ON p.account = r.account
       WHERE r.kind = 'item' AND p.visibility <> 'private' AND p.hidden = 0
         AND p.sections LIKE '%"collection":"public"%' AND r.key > ?2
       ORDER BY r.key LIMIT ?3`,
    )
    .bind(me, from, FEED_PAGE)
    .all<{ username: string; key: string; value: string }>()
  return { items: results, more: results.length === FEED_PAGE }
}
