import Dexie, { type EntityTable } from 'dexie'
import type { SearchResult } from '../api/discogs/types'
import type { Metadata } from '../lib/metadata'

export type Session = {
  id: 'current'
  kind: 'token' | 'oauth' | 'demo'
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
  originalCover?: string // set when the user picked a different cover
  originalThumb?: string
}
export type WantItem = { releaseId: number; masterId: number }
export type Setting = { key: string; value: unknown }

// A cover the user picked from the release's other Discogs images
export type CoverChoice = { instanceId: number; cover: string; thumb: string }

// Short description of a release, enough to show it in the batch list
export type ReleaseSummary = {
  id: number
  masterId?: number
  title: string
  artist: string
  thumb?: string
  label?: string
  catno?: string
  year?: string
  format?: string
}

export type QueueStatus =
  | 'pending' // waiting to be looked up
  | 'looking'
  | 'ready' // one release chosen, waiting to be added
  | 'choose' // several matches, the user picks
  | 'notfound'
  | 'adding'
  | 'added'
  | 'failed' // lookup or add went wrong; error says why

// One record in a batch: a scan, a typed barcode, or a row from a CSV import
export type QueueItem = {
  id?: number
  createdAt: number
  source: 'scan' | 'typed' | 'csv'
  status: QueueStatus
  barcode?: string
  candidates?: SearchResult[]
  via?: 'discogs' | 'musicbrainz'
  guess?: string // what MusicBrainz said the barcode was
  release?: ReleaseSummary
  raw?: SearchResult // the chosen search result, to add it to the library right away
  folderId?: number // set by CSV import; otherwise the batch folder is used
  rating?: number
  fields?: Record<number, string>
  meta?: Metadata // details typed in the batch for this record (scans only)
  dropped?: string[] // details that had nowhere to go
  error?: string
  addStartedAt?: number
  instanceId?: number
  warning?: string // added, but something minor went wrong (e.g. a field didn't save)
}

export class PlatterDB extends Dexie {
  session!: EntityTable<Session, 'id'>
  cache!: EntityTable<CacheEntry, 'key'>
  collection!: EntityTable<LibraryItem, 'instanceId'>
  wants!: EntityTable<WantItem, 'releaseId'>
  settings!: EntityTable<Setting, 'key'>
  queue!: EntityTable<QueueItem, 'id'>
  covers!: EntityTable<CoverChoice, 'instanceId'>

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
    this.version(3).stores({ queue: '++id, status, createdAt' })
    this.version(4).stores({ covers: 'instanceId' })
  }
}

export const db = new PlatterDB()

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await db.settings.get(key))?.value as T | undefined
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}
