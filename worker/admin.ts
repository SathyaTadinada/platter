// For accounts with the admin flag, which is only ever set by hand with wrangler d1 execute

import { accountById } from './account'
import { isBadge } from './badges'
import { forget, SyncError, type DB } from './sync'

export type Member = {
  id: string
  name: string
  discogsId: number | null
  createdAt: number
  lastSeenAt: number | null
  devices: number
  passkeys: number
  password: boolean
  admin: boolean
  badges: string[]
}

export async function requireAdmin(db: DB, account: string) {
  if (!(await accountById(db, account))?.admin) throw new SyncError(403, 'Not allowed')
}

export async function members(db: DB): Promise<Member[]> {
  const { results } = await db
    .prepare(
      `SELECT a.id, a.name, a.discogs_id, a.created_at, a.proof IS NOT NULL AS password, a.admin, a.badges,
         (SELECT COUNT(*) FROM devices d WHERE d.account = a.id) AS devices,
         (SELECT MAX(last_seen_at) FROM devices d WHERE d.account = a.id) AS last_seen_at,
         (SELECT COUNT(*) FROM passkeys p WHERE p.account = a.id) AS passkeys
       FROM accounts a ORDER BY a.created_at`,
    )
    .all<{
      id: string
      name: string
      discogs_id: number | null
      created_at: number
      password: number
      admin: number
      badges: string
      devices: number
      last_seen_at: number | null
      passkeys: number
    }>()
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    discogsId: r.discogs_id,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    devices: r.devices,
    passkeys: r.passkeys,
    password: r.password === 1,
    admin: r.admin === 1,
    badges: JSON.parse(r.badges),
  }))
}

const parseMember = (x: unknown) => {
  if (typeof x !== 'string' || !x || x.length > 100) throw new SyncError(400, 'Bad member')
  return x
}

export async function setBadge(db: DB, member: unknown, badge: unknown, on: boolean) {
  if (!isBadge(badge)) throw new SyncError(400, 'Bad badge')
  const acc = await accountById(db, parseMember(member))
  if (!acc) throw new SyncError(404, 'No such member')
  const badges = on ? [...new Set([...acc.badges, badge])] : acc.badges.filter((b) => b !== badge)
  await db.prepare('UPDATE accounts SET badges = ?2 WHERE id = ?1').bind(acc.id, JSON.stringify(badges)).run()
  return badges
}

// The password, passkeys, codes, and every device. Logging in with Discogs still gets them back in.
export async function clearWaysIn(db: DB, member: unknown) {
  const id = parseMember(member)
  await db.batch([
    db.prepare('UPDATE accounts SET proof = NULL WHERE id = ?1').bind(id),
    db.prepare('DELETE FROM passkeys WHERE account = ?1').bind(id),
    db.prepare('DELETE FROM pairings WHERE account = ?1').bind(id),
    db.prepare('DELETE FROM devices WHERE account = ?1').bind(id),
  ])
}

export async function deleteMember(db: DB, member: unknown) {
  await forget(db, parseMember(member))
}
