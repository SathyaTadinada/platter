// Badges an admin gives from the Members page. Accounts keep each badge's id, so renaming one
// shows everywhere at once, and deleting one takes it off everyone.

import { newId, SyncError, type DB } from './sync'

// How a badge looks, from a short list the app knows how to draw
export const BADGE_COLORS = ['gray', 'amber', 'blue', 'green', 'purple', 'red'] as const
export const BADGE_ICONS = ['award', 'star', 'flame', 'heart', 'disc', 'crown', 'sparkles', 'flask', 'gem', 'music'] as const
export type BadgeColor = (typeof BADGE_COLORS)[number]
export type BadgeIcon = (typeof BADGE_ICONS)[number]
export type BadgeLook = { label: string; color: BadgeColor; icon: BadgeIcon }
export type Badge = BadgeLook & { id: string; members: number }

const parseColor = (x: unknown): BadgeColor => {
  if (!(BADGE_COLORS as readonly unknown[]).includes(x)) throw new SyncError(400, 'Bad color')
  return x as BadgeColor
}
const parseIcon = (x: unknown): BadgeIcon => {
  if (!(BADGE_ICONS as readonly unknown[]).includes(x)) throw new SyncError(400, 'Bad icon')
  return x as BadgeIcon
}

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
    db.prepare('SELECT id, label, color, icon FROM badges ORDER BY created_at').all<BadgeLook & { id: string }>(),
    db.prepare("SELECT badges FROM accounts WHERE badges <> '[]'").all<{ badges: string }>(),
  ])
  const counts = new Map<string, number>()
  for (const a of accounts) for (const b of JSON.parse(a.badges) as string[]) counts.set(b, (counts.get(b) ?? 0) + 1)
  return badges.map((b) => ({ ...b, members: counts.get(b.id) ?? 0 }))
}

export async function isBadge(db: DB, id: unknown): Promise<boolean> {
  return typeof id === 'string' && Boolean(await db.prepare('SELECT 1 AS x FROM badges WHERE id = ?1').bind(id).first())
}

// What a profile shows: each badge's name and look, in the order the badges were made
export async function looksOf(db: DB, ids: string[]): Promise<BadgeLook[]> {
  if (!ids.length) return []
  const { results } = await db
    .prepare(`SELECT label, color, icon FROM badges WHERE id IN (${ids.map((_, i) => `?${i + 1}`).join(', ')}) ORDER BY created_at`)
    .bind(...ids)
    .all<BadgeLook>()
  return results
}

const taken = async (db: DB, label: string, except?: string) =>
  Boolean(
    await db
      .prepare('SELECT 1 AS x FROM badges WHERE lower(label) = lower(?1) AND id <> ?2')
      .bind(label, except ?? '')
      .first(),
  )

export async function createBadge(
  db: DB,
  label: unknown,
  color: unknown = 'gray',
  icon: unknown = 'award',
  now = Date.now(),
): Promise<Badge> {
  const name = parseLabel(label)
  const look = { color: parseColor(color ?? 'gray'), icon: parseIcon(icon ?? 'award') }
  if (await taken(db, name)) throw new SyncError(409, 'There’s already a badge with that name')
  const id = newId()
  await db
    .prepare('INSERT INTO badges (id, label, color, icon, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(id, name, look.color, look.icon, now)
    .run()
  return { id, label: name, ...look, members: 0 }
}

// Renames a badge, or changes how it looks; whatever isn't given stays as it was
export async function editBadge(db: DB, id: unknown, changes: { label?: unknown; color?: unknown; icon?: unknown }) {
  const badge = parseId(id)
  const name = changes.label === undefined ? null : parseLabel(changes.label)
  const color = changes.color === undefined ? null : parseColor(changes.color)
  const icon = changes.icon === undefined ? null : parseIcon(changes.icon)
  if (name && (await taken(db, name, badge))) throw new SyncError(409, 'There’s already a badge with that name')
  const r = await db
    .prepare('UPDATE badges SET label = COALESCE(?2, label), color = COALESCE(?3, color), icon = COALESCE(?4, icon) WHERE id = ?1')
    .bind(badge, name, color, icon)
    .run()
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
