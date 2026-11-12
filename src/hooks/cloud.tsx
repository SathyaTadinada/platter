import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { searchReleases } from '../api/discogs/endpoints'
import { searchMbBarcode } from '../api/musicbrainz'
import { quiet } from '../db/capture'
import { db, getSetting, type QueueItem } from '../db/db'
import {
  capture,
  claimBatch,
  CLOUD,
  cloudApi,
  joinIfSynced,
  syncNow,
  takeNeedCandidates,
  turnOff as stopSyncing,
  turnOn as startSyncing,
} from '../lib/cloud'
import { deviceId } from '../lib/device'
import { lookupBarcode } from '../lib/lookup'
import { useSession } from './session'

type Ctx = {
  available: boolean // signed in with Discogs (not the demo)
  enabled: boolean
  running: boolean
  error: string | null
  syncedAt: number | null
  turnOn: () => Promise<void>
  turnOff: () => Promise<void>
  forget: () => Promise<void>
  // set while sync is on: false when another device has started adding this batch record
  claim?: (item: QueueItem, startedAt: number) => Promise<boolean>
}

const CloudContext = createContext<Ctx | null>(null)
const RETRY_AFTER = [30_000, 60_000, 120_000, 300_000]
const PUSH_AFTER = 2000

export function CloudProvider({ children }: { children: ReactNode }) {
  const { session, client } = useSession()
  const api = useMemo(
    () =>
      session && session.kind !== 'demo' && !session.expired
        ? cloudApi({ kind: session.kind, token: session.token, secret: session.secret })
        : null,
    [session],
  )
  const saved = useLiveQuery(async () => ({
    enabled: Boolean(await getSetting<boolean>(CLOUD.enabled)),
    syncedAt: (await getSetting<number | null>(CLOUD.syncedAt)) ?? null,
  }))
  const enabled = Boolean(api && saved?.enabled)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const busy = useRef(false)
  const again = useRef(false)
  const failures = useRef(0)
  const retry = useRef<ReturnType<typeof setTimeout>>(undefined)
  const soon = useRef<ReturnType<typeof setTimeout>>(undefined)
  const runRef = useRef<() => Promise<void>>(async () => {})

  // "Which release is…?" records from another device come without Discogs' results; look them up here
  const refill = useCallback(async () => {
    const ids = takeNeedCandidates()
    if (!ids.length || !client) return
    const search = (p: Parameters<typeof searchReleases>[1]) => searchReleases(client, p).then((r) => r.results)
    for (const id of ids) {
      const item = await db.queue.get(id)
      if (!item?.barcode || item.status !== 'choose' || item.candidates?.length) continue
      const r = await lookupBarcode(item.barcode, { searchDiscogs: search, searchMb: (b) => searchMbBarcode(b) }).catch(() => null)
      if (!r || r.kind === 'none') continue
      await db.transaction('rw', db.queue, async (tx) => {
        quiet.add(tx.idbtrans)
        await db.queue.update(id, { candidates: r.results })
      })
    }
  }, [client])

  const run = useCallback(async () => {
    if (!api) return
    if (busy.current) {
      again.current = true
      return
    }
    busy.current = true
    clearTimeout(retry.current)
    const on = Boolean(await getSetting<boolean>(CLOUD.enabled))
    try {
      if (on) {
        setRunning(true)
        await syncNow(api)
      } else {
        // once per sign-in, in case this account already syncs from another device
        await joinIfSynced(api)
      }
      failures.current = 0
      setError(null)
      await refill()
    } catch (e) {
      if (on) {
        setError((e as Error).message)
        const wait = RETRY_AFTER[Math.min(failures.current++, RETRY_AFTER.length - 1)]
        retry.current = setTimeout(() => document.visibilityState === 'visible' && runRef.current(), wait)
      }
    } finally {
      busy.current = false
      setRunning(false)
      if (again.current) {
        again.current = false
        runRef.current()
      }
    }
  }, [api, refill])
  runRef.current = run

  // note changes while on, and send them shortly after
  useEffect(() => {
    capture(enabled, () => {
      // after a failure the retry timer goes next; changes wait for it rather than adding calls
      if (failures.current > 0) return
      clearTimeout(soon.current)
      soon.current = setTimeout(() => runRef.current(), PUSH_AFTER)
    })
    return () => capture(false)
  }, [enabled])

  // on open, back in front, and back online
  useEffect(() => {
    if (!api) return
    run()
    const onVisible = () => document.visibilityState === 'visible' && run()
    const onOnline = () => run()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      clearTimeout(retry.current)
      clearTimeout(soon.current)
    }
  }, [api, run])

  const turnOn = useCallback(async () => {
    if (!api) return
    setRunning(true)
    setError(null)
    try {
      await startSyncing(api)
      await refill()
    } finally {
      setRunning(false)
    }
  }, [api, refill])

  const turnOff = useCallback(async () => {
    await stopSyncing()
    setError(null)
  }, [])

  const forget = useCallback(async () => {
    if (!api) return
    await api.forget()
    await stopSyncing()
    setError(null)
  }, [api])

  const claim = useMemo(
    () => (api && enabled ? (item: QueueItem, startedAt: number) => claimBatch(api, item, deviceId(), startedAt) : undefined),
    [api, enabled],
  )

  return (
    <CloudContext.Provider
      value={{ available: Boolean(api), enabled, running, error, syncedAt: saved?.syncedAt ?? null, turnOn, turnOff, forget, claim }}
    >
      {children}
    </CloudContext.Provider>
  )
}

export function useCloud() {
  const ctx = useContext(CloudContext)
  if (!ctx) throw new Error('useCloud outside CloudProvider')
  return ctx
}
