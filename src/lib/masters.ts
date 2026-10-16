import { DiscogsError, type DiscogsClient } from '../api/discogs/client'
import { getMaster } from '../api/discogs/endpoints'
import { DISCOGS_MAX_AGE } from '../db/cache'
import { db, type LibraryItem, type MasterYear } from '../db/db'

// A record's year on Discogs is when that pressing came out, so a 2023 reissue of a 1973
// album says 2023. The album's master has the original year. Platter keeps those years
// next to the collection and refreshes them in the background, like prices.

// Masters in the collection without a year from the last six hours
export async function staleMasters(now = Date.now()): Promise<number[]> {
  const fresh = new Set((await db.masters.toArray()).filter((m) => now - m.at < DISCOGS_MAX_AGE).map((m) => m.masterId))
  const ids = (await db.collection.toArray()).map((i) => i.masterId).filter((id) => id && !fresh.has(id))
  return [...new Set(ids)]
}

export async function fetchMasterYear(client: DiscogsClient, masterId: number, now = Date.now) {
  let year = 0
  try {
    year = (await getMaster(client, masterId)).year || 0
  } catch (e) {
    // a master that's gone just has no year; anything else is worth stopping for
    if (!(e instanceof DiscogsError && e.status === 404)) throw e
  }
  await db.masters.put({ masterId, year, at: now() })
}

export function withOriginalYears(items: LibraryItem[], masters: MasterYear[]): LibraryItem[] {
  const years = new Map(masters.filter((m) => m.year).map((m) => [m.masterId, m.year]))
  return items.map((i) => {
    const year = years.get(i.masterId)
    return year ? { ...i, originalYear: year } : i
  })
}

// The collection with original years filled in
export async function libraryItems(): Promise<LibraryItem[]> {
  const [items, masters] = await Promise.all([db.collection.toArray(), db.masters.toArray()])
  return withOriginalYears(items, masters)
}
