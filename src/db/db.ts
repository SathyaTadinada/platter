import Dexie, { type EntityTable } from 'dexie'

export type Session = {
  id: 'current'
  kind: 'token' | 'oauth'
  token: string
  secret?: string // OAuth token secret
  username: string
  userId: number
}

export type CacheEntry = { key: string; data: unknown; fetchedAt: number }

// Enough to check ownership
export type OwnedItem = { instanceId: number; releaseId: number; masterId: number; folderId: number }

// One copy in the user's collection, as shown in the library
export type LibraryItem = OwnedItem & {
  title: string
  artist: string
  year: number
  thumb?: string
  cover?: string
  label?: string
  catno?: string
  format: string // display text, e.g. "2× Vinyl, LP, Album"
  formatNames: string[] // Vinyl, CD, Cassette…
  formatTags: string[] // LP, 7", Album, Reissue…
  genres: string[]
  styles: string[]
  dateAdded: string
  rating: number
  fields: Record<number, string> // custom field id -> value
}
export type WantItem = { releaseId: number; masterId: number }
export type Setting = { key: string; value: unknown }

export class PlatterDB extends Dexie {
  session!: EntityTable<Session, 'id'>
  cache!: EntityTable<CacheEntry, 'key'>
  collection!: EntityTable<LibraryItem, 'instanceId'>
  wants!: EntityTable<WantItem, 'releaseId'>
  settings!: EntityTable<Setting, 'key'>

  constructor(name = 'platter') {
    super(name)
    this.version(1).stores({
      session: 'id',
      cache: 'key, fetchedAt',
      collection: 'instanceId, releaseId, masterId',
      wants: 'releaseId, masterId',
      settings: 'key',
    })
    // v2 keeps full details for the library; resync to fill them in
    this.version(2)
      .stores({ collection: 'instanceId, releaseId, masterId, folderId, dateAdded' })
      .upgrade(async (tx) => {
        await tx.table('collection').clear()
        await tx.table('settings').delete('collectionSyncedAt')
      })
  }
}

export const db = new PlatterDB()

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await db.settings.get(key))?.value as T | undefined
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}
