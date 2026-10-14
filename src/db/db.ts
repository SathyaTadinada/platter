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

// Local index of the user's collection, for ownership checks
export type OwnedItem = { instanceId: number; releaseId: number; masterId: number; folderId: number }
export type WantItem = { releaseId: number; masterId: number }
export type Setting = { key: string; value: unknown }

export class PlatterDB extends Dexie {
  session!: EntityTable<Session, 'id'>
  cache!: EntityTable<CacheEntry, 'key'>
  collection!: EntityTable<OwnedItem, 'instanceId'>
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
  }
}

export const db = new PlatterDB()

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await db.settings.get(key))?.value as T | undefined
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}
