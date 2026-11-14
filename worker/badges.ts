// Badges an admin gives from the Members page. Accounts keep each badge's id, so renaming one
// shows everywhere at once, and deleting one takes it off everyone.

import { newId, SyncError, type DB } from './sync'

export type Badge = { id: string; label: string; members: number }

const parseLabel = (x: unknown) => {
  if (typeof x !== 'string' || !x.trim() || x.trim().length > 30) throw new SyncError(400, 'Bad name')
  return x.trim()
}
const parseId = (x: unknown) => {
  if (typeof x !== 'string' || !x || x.length > 40) throw new SyncError(400, 'Bad badge')
  return x
}

// The accounts that have a badge. Badges are kept as a JSON list on each account, and there are few
// enough of either that reading them back is fine.
async function holders(db: DB, id: string): Promise<{ id: string; badges: string[] }[]> {
  const { results } = await db
    .prepare('SELECT id, badges FROM accounts WHERE badges LIKE ?1')
    .bind(`%${JSON.stringify(id)}%`)
    .all<{ id: string; badges: string }>()
  return results.map((r) => ({ id: r.id, badges: JSON.parse(r.badges) as string[] })).filter((r) => r.badges.includes(id))
}

export async function listBadges(db: DB): Promise<Badge[]> {
  const [{ results: badges }, { results: accounts }] = await Promise.all([
    db.prepare('SELECT id, label FROM badges ORDER BY created_at').all<{ id: string; label: string }>(),
    db.prepare("SELECT badges FROM accounts WHERE badges <> '[]'").all<{ badges: string }>(),
  ])
  const counts = new Map<string, number>()
  for (const a of accounts) for (const b of JSON.parse(a.badges) as string[]) counts.set(b, (counts.get(b) ?? 0) + 1)
  return badges.map((b) => ({ ...b, members: counts.get(b.id) ?? 0 }))
}

export async function isBadge(db: DB, id: unknown): Promise<boolean> {
  return typeof id === 'string' && Boolean(await db.prepare('SELECT 1 AS x FROM badges WHERE id = ?1').bind(id).first())
}

// What a profile shows: each badge's name, in the order the badges were made
export async function labelsOf(db: DB, ids: string[]): Promise<string[]> {
  if (!ids.length) return []
  const all = await listBadges(db)
  return all.filter((b) => ids.includes(b.id)).map((b) => b.label)
}

const taken = async (db: DB, label: string, except?: string) =>
  Boolean(
    await db
      .prepare('SELECT 1 AS x FROM badges WHERE lower(label) = lower(?1) AND id <> ?2')
      .bind(label, except ?? '')
      .first(),
  )

export async function createBadge(db: DB, label: unknown, now = Date.now()): Promise<Badge> {
  const name = parseLabel(label)
  if (await taken(db, name)) throw new SyncError(409, 'There’s already a badge with that name')
  const id = newId()
  await db.prepare('INSERT INTO badges (id, label, created_at) VALUES (?1, ?2, ?3)').bind(id, name, now).run()
  return { id, label: name, members: 0 }
}

export async function renameBadge(db: DB, id: unknown, label: unknown) {
  const badge = parseId(id)
  const name = parseLabel(label)
  if (await taken(db, name, badge)) throw new SyncError(409, 'There’s already a badge with that name')
  const r = await db.prepare('UPDATE badges SET label = ?2 WHERE id = ?1').bind(badge, name).run()
  if (!r.meta.changes) throw new SyncError(404, 'No such badge')
}

export async function deleteBadge(db: DB, id: unknown) {
  const badge = parseId(id)
  const accounts = await holders(db, badge)
  await db.batch([
    ...accounts.map((a) =>
      db.prepare('UPDATE accounts SET badges = ?2 WHERE id = ?1').bind(a.id, JSON.stringify(a.badges.filter((b) => b !== badge))),
    ),
    db.prepare('DELETE FROM badges WHERE id = ?1').bind(badge),
  ])
}
