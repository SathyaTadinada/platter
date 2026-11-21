import type { DiscogsClient } from '../api/discogs/client'
import { getCollectionPage, getOwnedInstances, getWantsPage } from '../api/discogs/endpoints'
import { db, getSetting, setSetting, type LibraryItem, type WantItem } from '../db/db'
import { applyCoverChoices } from './covers'
import { toLibraryItem, wantFromApi } from './library'
import { awaitPlayFields, noticedPlays } from './plays'

export const SYNC_MAX_AGE = 6 * 60 * 60 * 1000
// how long a refresh waits for the play count fields before it stops looking for plays logged elsewhere
const FIELDS_WAIT = 15_000

type Progress = (done: number, total: number) => void

async function allPages<T>(fetchPage: (page: number) => Promise<{ items: T[]; pages: number }>, onProgress?: Progress) {
  const out: T[] = []
  let pages = 1
  for (let page = 1; page <= pages; page++) {
    const r = await fetchPage(page)
    pages = r.pages
    out.push(...r.items)
    onProgress?.(page, pages)
  }
  return out
}

// Pulls the whole collection for the library and ownership checks.
export async function syncCollection(client: DiscogsClient, username: string, onProgress?: Progress) {
  // plays logged somewhere else since the last refresh are found by the play count going up, which
  // needs to know the play count fields; they usually arrive while the pages load
  const fields = awaitPlayFields(FIELDS_WAIT)
  const items = await allPages<LibraryItem>(async (page) => {
    const r = await getCollectionPage(client, username, page)
    return { pages: r.pagination.pages, items: r.releases.map(toLibraryItem) }
  }, onProgress)
  const withCovers = await applyCoverChoices(items)
  const ids = await fields
  const since = (await getSetting<number>('collectionSyncedAt')) ?? 0
  await db.transaction('rw', db.collection, db.plays, async () => {
    const found = ids && since ? noticedPlays(await db.collection.toArray(), withCovers, await db.plays.toArray(), ids, since) : []
    await db.collection.clear()
    await db.collection.bulkPut(withCovers)
    if (found.length) await db.plays.bulkAdd(found)
  })
  await setSetting('collectionSyncedAt', Date.now())
  return items.length
}

// Fetches just these releases' copies, after adding a few records. One request each, so it's only
// worth it while that's fewer than reloading the whole collection a page at a time.
export async function refreshReleases(client: DiscogsClient, username: string, releaseIds: number[]) {
  const pages = Math.max(1, Math.ceil((await db.collection.count()) / 100))
  if (releaseIds.length >= pages) return false
  for (const id of releaseIds) {
    const r = await getOwnedInstances(client, username, id)
    await db.collection.bulkPut(await applyCoverChoices(r.releases.map(toLibraryItem)))
  }
  return true
}

export async function syncWants(client: DiscogsClient, username: string, onProgress?: Progress) {
  const items = await allPages<WantItem>(async (page) => {
    const r = await getWantsPage(client, username, page)
    return {
      pages: r.pagination.pages,
      items: r.wants.map(wantFromApi),
    }
  }, onProgress)
  await db.transaction('rw', db.wants, async () => {
    await db.wants.clear()
    await db.wants.bulkPut(items)
  })
  await setSetting('wantsSyncedAt', Date.now())
  return items.length
}

export async function isStale(key: 'collectionSyncedAt' | 'wantsSyncedAt', now = Date.now()) {
  const at = await getSetting<number>(key)
  return !at || now - at > SYNC_MAX_AGE
}
