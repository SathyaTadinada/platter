import { DiscogsError, type DiscogsClient } from '../api/discogs/client'
import { getMaster } from '../api/discogs/endpoints'
import { CATALOG_MAX_AGE } from '../db/cache'
import { db, type LibraryItem, type MasterYear } from '../db/db'
import { dueOf, type Due } from './due'

// A record's year on Discogs is when that pressing came out, so a 2023 reissue of a 1973
// album says 2023. The album's master has the original year. Platter keeps those years
// next to the collection and refreshes them in the background, like prices.
//
// Release dates are CC0 under the Discogs API terms (prices and images aren't), and an
// album's year hardly ever changes, so these are checked monthly rather than every six
// hours, outlast signing out, and travel in Platter's CSV export.
// Masters in the collection without a year checked in the last month
export async function staleMasters(now = Date.now()): Promise<Due[]> {
  const at = new Map((await db.masters.toArray()).map((m) => [m.masterId, m.at]))
  const ids = (await db.collection.toArray()).map((i) => i.masterId).filter(Boolean)
  return dueOf(ids, at, CATALOG_MAX_AGE, now)
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
