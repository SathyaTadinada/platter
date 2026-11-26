import type { DBCore, Middleware } from 'dexie'

// Tells listeners which table a write changed, once it's saved. Cloud sync has its own, finer
// record of what changed (capture.ts); this is for anything that only needs to know that a table did.

type Listener = (table: string) => void
const listeners = new Set<Listener>()

export function onTableChange(listener: Listener) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export const changesMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'tableChanges',
  create: (down) => ({
    ...down,
    table: (name) => {
      const t = down.table(name)
      return {
        ...t,
        async mutate(req) {
          const res = await t.mutate(req)
          // only once it's saved: a write that's rolled back never happened
          if (listeners.size)
            (req.trans as unknown as IDBTransaction).addEventListener('complete', () => {
              for (const l of listeners) l(name)
            })
          return res
        },
      }
    },
  }),
}
