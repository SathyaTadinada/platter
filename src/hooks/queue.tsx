import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  addToFolder,
  editInstance,
  getFields,
  getOwnedInstances,
  getProfile,
  removeWant,
  searchReleases,
  setFieldValue,
} from '../api/discogs/endpoints'
import { searchMbBarcode } from '../api/musicbrainz'
import { holdBackground } from '../lib/task'
import { toast } from '../components/Toaster'
import { db, getSetting, setSetting } from '../db/db'
import { lookupBarcode } from '../lib/lookup'
import { matchFields, type FieldMap } from '../lib/fields'
import type { Metadata } from '../lib/metadata'
import { addReady, applyBatchDetails, lookupPending, resetInterrupted, type AddDeps } from '../lib/queue'
import { useSession } from './session'
import { useSync } from './sync'

type Run = { kind: 'lookup' | 'add'; done: number; total: number } | null
type AddJob = { folderId: number; removeFromWantlist: boolean }

type Ctx = {
  run: Run
  online: boolean
  kick: () => void // look up anything pending
  startAdding: (job: AddJob) => Promise<void>
}

const QueueContext = createContext<Ctx | null>(null)
const JOB_KEY = 'batchAddJob' // remembered so adding resumes after a reload
export const SHARED_KEY = 'batchShared' // store, date, and location for the whole batch

const useOnline = () => {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

// Works through the batch in the background: looks up scans as soon as there's
// a connection, and finishes an add-to-collection run even across reloads.
export function QueueProvider({ children }: { children: ReactNode }) {
  const { client, session } = useSession()
  const { sync } = useSync()
  const online = useOnline()
  const [run, setRun] = useState<Run>(null)
  const busy = useRef(false)

  const lookups = useCallback(async () => {
    if (!client || busy.current || !navigator.onLine) return
    busy.current = true
    const release = holdBackground()
    try {
      const search = (p: Parameters<typeof searchReleases>[1]) => searchReleases(client, p).then((r) => r.results)
      await lookupPending((b) => lookupBarcode(b, { searchDiscogs: search, searchMb: (x) => searchMbBarcode(x) }), {
        onProgress: (done, total) => setRun(total ? { kind: 'lookup', done, total } : null),
      })
    } finally {
      release()
      busy.current = false
      setRun(null)
    }
  }, [client])

  const adds = useCallback(
    async (job: AddJob) => {
      if (!client || !session || busy.current) return
      busy.current = true
      const release = holdBackground()
      const u = session.username
      const deps: AddDeps = {
        addToFolder: async (folderId, releaseId) => (await addToFolder(client, u, folderId, releaseId)).instance_id,
        setField: (t, fieldId, value) => setFieldValue(client, u, t, fieldId, value),
        setRating: (t, rating) => editInstance(client, u, t, { rating }),
        removeWant: (releaseId) => removeWant(client, u, releaseId),
        ownedInstances: async (releaseId) => (await getOwnedInstances(client, u, releaseId)).releases,
      }
      try {
        const hadCsv =
          (await db.queue
            .where('status')
            .equals('ready')
            .filter((i) => i.source === 'csv')
            .count()) > 0
        const wants = new Set((await db.wants.toArray()).map((w) => w.releaseId))
        const r = await addReady(deps, { ...job, wants, onProgress: (done, total) => setRun({ kind: 'add', done, total }) })
        if (r.end === 'offline') {
          toast("Lost the connection. Adding will carry on when you're back online.", { tone: 'error' })
          return // keep the job so it resumes
        }
        await setSetting(JOB_KEY, null)
        const n = (k: number) => `${k} record${k === 1 ? '' : 's'}`
        if (r.failed) toast(`Added ${n(r.added)}. ${r.failed} didn't go through. Check the batch.`, { tone: 'error' })
        else if (r.added) toast(`Added ${n(r.added)} to your collection.`, { tone: 'success' })
        // CSV rows have no search result to build collection entries from, so refresh
        if (hadCsv && r.added) sync(true)
      } finally {
        release()
        busy.current = false
        setRun(null)
      }
    },
    [client, session, sync],
  )

  const startAdding = useCallback(
    async (job: AddJob) => {
      if (client && session) {
        // work out each record's field values from the shared and per-record details
        const [{ fields }, profile, map, shared] = await Promise.all([
          getFields(client, session.username),
          getProfile(client, session.username).catch(() => null),
          getSetting<FieldMap>('fieldMap'),
          getSetting<Metadata>(SHARED_KEY),
        ])
        await applyBatchDetails(shared ?? {}, matchFields(fields, map ?? {}), profile?.curr_abbr ?? 'USD')
      }
      await setSetting(JOB_KEY, job)
      await adds(job)
    },
    [adds, client, session],
  )

  // on start: tidy up anything a reload interrupted, then carry on
  useEffect(() => {
    if (!client || !online) return
    ;(async () => {
      await resetInterrupted()
      const job = await getSetting<AddJob | null>(JOB_KEY)
      if (job) await adds(job)
      await lookups()
    })()
  }, [client, online, adds, lookups])

  return <QueueContext.Provider value={{ run, online, kick: lookups, startAdding }}>{children}</QueueContext.Provider>
}

export function useQueue() {
  const ctx = useContext(QueueContext)
  if (!ctx) throw new Error('useQueue outside QueueProvider')
  return ctx
}
