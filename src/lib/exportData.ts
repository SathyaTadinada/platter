import { db } from '../db/db'

// Tables worth backing up: settings, the batch queue, chosen covers, value history, and plays. Session (the token)
// and caches are left out on purpose.
const TABLES = ['settings', 'queue', 'covers', 'valueHistory', 'plays'] as const

export type ExportFile = {
  app: 'platter'
  version: 1
  exportedAt: string
  tables: Record<string, unknown[]>
}

export async function exportLocalData(): Promise<ExportFile> {
  const tables: Record<string, unknown[]> = {}
  for (const name of TABLES) tables[name] = await db.table(name).toArray()
  return { app: 'platter', version: 1, exportedAt: new Date().toISOString(), tables }
}

// Plays and batch records are numbered per browser, so a backup's numbers can belong to different
// rows here (another device's, or ones that came in through sync). They're matched instead by their
// sync ID and by what they are (a play's record and time, a batch record's release and when it was
// queued), since a row saved without a sync ID gets one here. Only the missing ones are added.
// The rest are keyed by what they're about (a setting, a record's cover, a day), so they're put as is.
type Row = Record<string, unknown> & { id?: number; uid?: string }
const withUid = (r: Row) => (r.uid ? [`uid:${r.uid}`] : [])
const sameness: Partial<Record<(typeof TABLES)[number], (r: Row) => string[]>> = {
  plays: (r) => [`${r.instanceId}@${r.at}`, ...withUid(r)],
  queue: (r) => [`${(r.release as { id?: number } | undefined)?.id ?? r.barcode}@${r.createdAt}`, ...withUid(r)],
}

// How many rows were added or updated
export async function importLocalData(file: unknown): Promise<number> {
  const f = file as Partial<ExportFile>
  if (f?.app !== 'platter' || f.version !== 1 || typeof f.tables !== 'object') {
    throw new Error("This doesn't look like a Platter export.")
  }
  let count = 0
  await db.transaction(
    'rw',
    TABLES.map((t) => db.table(t)),
    async () => {
      for (const name of TABLES) {
        const rows = f.tables?.[name] as Row[] | undefined
        if (!Array.isArray(rows)) continue
        const key = sameness[name]
        if (!key) {
          await db.table(name).bulkPut(rows)
          count += rows.length
          continue
        }
        const here = new Set(((await db.table(name).toArray()) as Row[]).flatMap(key))
        const missing = rows
          .filter((r) => {
            if (key(r).some((k) => here.has(k))) return false
            key(r).forEach((k) => here.add(k)) // the same row twice in the file
            return true
          })
          .map(({ id: _, ...r }) => r)
        await db.table(name).bulkAdd(missing)
        count += missing.length
      }
    },
  )
  return count
}
