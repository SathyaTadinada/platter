import type { DiscogsClient } from '../api/discogs/client'
import { getCollectionPage, getWantsPage } from '../api/discogs/endpoints'
import { db, getSetting, setSetting, type LibraryItem, type WantItem } from '../db/db'
import { toLibraryItem } from './library'

export const SYNC_MAX_AGE = 6 * 60 * 60 * 1000

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
  const items = await allPages<LibraryItem>(async (page) => {
    const r = await getCollectionPage(client, username, page)
    return { pages: r.pagination.pages, items: r.releases.map(toLibraryItem) }
  }, onProgress)
  await db.transaction('rw', db.collection, async () => {
    await db.collection.clear()
    await db.collection.bulkPut(items)
  })
  await setSetting('collectionSyncedAt', Date.now())
  return items.length
}

export async function syncWants(client: DiscogsClient, username: string, onProgress?: Progress) {
  const items = await allPages<WantItem>(async (page) => {
    const r = await getWantsPage(client, username, page)
    return {
      pages: r.pagination.pages,
      items: r.wants.map((w) => ({ releaseId: w.id, masterId: w.basic_information.master_id })),
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
