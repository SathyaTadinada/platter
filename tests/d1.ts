import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import type { DB, Stmt } from '../worker/sync'

// D1 on SQLite in memory, enough of it for the sync code, with the real migrations applied
export function testDB(): DB {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../migrations/0001_sync.sql', import.meta.url), 'utf8'))

  const stmt = (sql: string, values: unknown[] = []): Stmt & { exec(): { results: unknown[]; meta: { changes: number } } } => {
    const exec = () => {
      // D1 binds ?1, ?2… by position; node:sqlite wants them named
      const p = sqlite.prepare(sql.replace(/\?(\d+)/g, '$p$1'))
      const args = Object.fromEntries((values as (string | number | null)[]).map((v, i) => [`p${i + 1}`, v]))
      if (/^\s*(SELECT|.*\bRETURNING\b)/is.test(sql)) return { results: p.all(args), meta: { changes: 0 } }
      const r = p.run(args)
      return { results: [], meta: { changes: Number(r.changes) } }
    }
    return {
      bind: (...v: unknown[]) => stmt(sql, v),
      all: async <T>() => ({ results: exec().results as T[] }),
      first: async <T>() => (exec().results[0] as T | undefined) ?? null,
      run: async () => exec(),
      exec,
    }
  }

  return {
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => {
      sqlite.exec('BEGIN')
      try {
        const out = stmts.map((s) => (s as ReturnType<typeof stmt>).exec())
        sqlite.exec('COMMIT')
        return out
      } catch (e) {
        sqlite.exec('ROLLBACK')
        throw e
      }
    },
  }
}
