import { db } from './db'

// Discogs API terms: don't show data more than 6 hours older than the site.
export const DISCOGS_MAX_AGE = 6 * 60 * 60 * 1000

export async function readCache<T>(key: string, maxAge: number, now = Date.now()): Promise<T | undefined> {
  const hit = await db.cache.get(key)
  if (hit && now - hit.fetchedAt < maxAge) return hit.data as T
}

export async function writeCache(key: string, data: unknown, now = Date.now()): Promise<void> {
  await db.cache.put({ key, data, fetchedAt: now })
}

export async function pruneCache(maxAge = DISCOGS_MAX_AGE, now = Date.now()): Promise<number> {
  return db.cache
    .where('fetchedAt')
    .below(now - maxAge)
    .delete()
}
