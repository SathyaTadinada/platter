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
        const rows = f.tables?.[name]
        if (!Array.isArray(rows)) continue
        await db.table(name).bulkPut(rows)
        count += rows.length
      }
    },
  )
  return count
}
