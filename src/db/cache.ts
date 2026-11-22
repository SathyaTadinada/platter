import { db } from './db'

// Discogs API terms: don't show data more than 6 hours older than the site.
export const DISCOGS_MAX_AGE = 6 * 60 * 60 * 1000

// Catalog data (tracklists, credits, identifiers, album years) is CC0 under the same terms, so it
// keeps for a month, or until Refresh from Discogs. Photos, prices, and marketplace numbers in it
// still come off after six hours.
export const CATALOG_MAX_AGE = 30 * 24 * 60 * 60 * 1000
const RESTRICTED = ['images', 'thumb', 'lowest_price', 'num_for_sale', 'community'] as const

// A catalog entry without what can't be kept. How many photos it had is kept, so a page can say
// so without asking Discogs again.
export function catalogOnly<T>(data: T): T {
  if (!data || typeof data !== 'object' || !RESTRICTED.some((k) => k in data)) return data
  const rest = { ...(data as Record<string, unknown>) }
  const images = rest.images
  for (const k of RESTRICTED) delete rest[k]
  if (Array.isArray(images)) rest.imageCount = images.length
  return rest as T
}

export async function readCache<T>(key: string, maxAge: number, now = Date.now()): Promise<T | undefined> {
  const hit = await db.cache.get(key)
  if (hit && now - hit.fetchedAt < maxAge) return hit.data as T
}

// A catalog entry, kept a month. whole: only if it still has its photos and prices (six hours).
export async function readCatalog<T>(key: string, whole: boolean, now = Date.now()): Promise<T | undefined> {
  const hit = await db.cache.get(key)
  if (!hit || now - hit.fetchedAt >= CATALOG_MAX_AGE) return
  if (now - hit.fetchedAt < DISCOGS_MAX_AGE) return hit.data as T
  if (!whole) return catalogOnly(hit.data as T)
}

export async function writeCache(key: string, data: unknown, now = Date.now()): Promise<void> {
  await db.cache.put({ key, data, fetchedAt: now })
}

// Discogs entries go after 6 hours, catalog entries lose their photos and prices then and go after
// a month, and other lookups (Apple Music links) keep for a month
const OTHER_MAX_AGE = 30 * 24 * 60 * 60 * 1000

export async function pruneCache(now = Date.now()): Promise<void> {
  const old = await db.cache
    .where('fetchedAt')
    .below(now - DISCOGS_MAX_AGE)
    .toArray()
  const gone: string[] = []
  const trimmed: typeof old = []
  for (const e of old) {
    if (e.key.startsWith('catalog:')) {
      if (now - e.fetchedAt >= CATALOG_MAX_AGE) gone.push(e.key)
      else if (catalogOnly(e.data) !== e.data) trimmed.push({ ...e, data: catalogOnly(e.data) })
    } else if (e.key.startsWith('discogs:') || now - e.fetchedAt >= OTHER_MAX_AGE) gone.push(e.key)
  }
  await db.cache.bulkDelete(gone)
  await db.cache.bulkPut(trimmed)
}

// Refresh from Discogs: everything kept from Discogs goes, so it's all asked for again
export async function forgetDiscogs(): Promise<void> {
  await db.cache.filter((e) => e.key.startsWith('discogs:') || e.key.startsWith('catalog:')).delete()
}
