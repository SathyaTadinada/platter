import type { DBCore, DBCoreMutateRequest, DBCoreTable, Middleware } from 'dexie'

// Notes which synced rows change, so cloud sync knows what to send. It sits under every write to
// these tables; sync itself decides whether to listen (see setCapture).

export type Kind = 'play' | 'value' | 'cover' | 'year' | 'length' | 'barcode' | 'batch' | 'setting' | 'pref'

type Spec = { kind: Kind; key: (row: Record<string, unknown>) => unknown; byUid?: boolean }

// Plays and batch records are numbered per device, so between devices they go by a random uid
export const SPECS: Record<string, Spec> = {
  plays: { kind: 'play', key: (r) => r.uid, byUid: true },
  queue: { kind: 'batch', key: (r) => r.uid, byUid: true },
  valueHistory: { kind: 'value', key: (r) => r.date },
  covers: { kind: 'cover', key: (r) => r.instanceId },
  masters: { kind: 'year', key: (r) => r.masterId },
  lengths: { kind: 'length', key: (r) => r.releaseId },
  barcodes: { kind: 'barcode', key: (r) => r.barcode },
  settings: { kind: 'setting', key: (r) => r.key },
}

// Settings worth having on every device. The rest (sync times, the add in progress…) are per device.
export const SYNCED_SETTINGS = new Set(['stylus', 'fieldMap', 'recentSearches', 'lastFolderId', 'batchShared', 'listenbrainz'])

export const newUid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)

type Recorder = (kind: Kind, keys: string[], at: number) => void
let recorder: Recorder | null = null
export const setCapture = (r: Recorder | null) => {
  recorder = r
}

// Transactions that apply what came from the server; their writes aren't sent back
export const quiet = new WeakSet<object>()

const withUids = (req: DBCoreMutateRequest): DBCoreMutateRequest =>
  req.type === 'add' || req.type === 'put' ? { ...req, values: req.values.map((v) => (v.uid ? v : { ...v, uid: newUid() })) } : req

function wrap(t: DBCoreTable, spec: Spec): DBCoreTable {
  return {
    ...t,
    async mutate(req) {
      if (spec.byUid) req = withUids(req)
      const record = recorder
      if (!record || quiet.has(req.trans)) return t.mutate(req)

      let keys: unknown[] = []
      if (req.type === 'delete' || req.type === 'deleteRange') {
        const primary =
          req.type === 'delete'
            ? req.keys
            : (await t.query({ trans: req.trans, values: false, query: { index: t.schema.primaryKey, range: req.range } })).result
        keys = spec.byUid ? (await t.getMany({ trans: req.trans, keys: primary })).map((r) => r?.uid) : primary
      }
      const res = await t.mutate(req)
      if (req.type === 'add' || req.type === 'put') keys = req.values.map(spec.key)
      let list = keys.filter((k) => k !== undefined && k !== null).map(String)
      if (spec.kind === 'setting') list = list.filter((k) => SYNCED_SETTINGS.has(k))
      if (list.length) {
        const at = Date.now()
        // only once it's saved: a write that's rolled back never happened
        ;(req.trans as unknown as IDBTransaction).addEventListener('complete', () => record(spec.kind, list, at))
      }
      return res
    },
  }
}

export const captureMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'cloudCapture',
  create: (down) => ({
    ...down,
    table: (name) => (SPECS[name] ? wrap(down.table(name), SPECS[name]) : down.table(name)),
  }),
}
