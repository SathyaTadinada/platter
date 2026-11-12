import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'wouter'
import type { Category } from '../../worker/categories'
import { searchReleases } from '../api/discogs/endpoints'
import { searchMbBarcode } from '../api/musicbrainz'
import { toast } from '../components/Toaster'
import { quiet } from '../db/capture'
import { db, getSetting, setSetting, type QueueItem } from '../db/db'
import {
  capture,
  changePassword as savePassword,
  claimBatch,
  CLOUD,
  cloudApi,
  cloudEntry,
  deviceFor,
  forgetAccount,
  joinWithCode,
  leave as leaveSync,
  setWhatSyncs,
  signIn as signInSync,
  signOutOfSync,
  syncNow,
  takeNeedCandidates,
} from '../lib/cloud'
import { deviceId } from '../lib/device'
import { lookupBarcode } from '../lib/lookup'
import { useSession } from './session'

type Ctx = {
  available: boolean // signed in with Discogs (not the demo)
  username: string
  enabled: boolean
  running: boolean
  error: string | null
  syncedAt: number | null
  off: Category[]
  exists: () => Promise<boolean> // whether this Discogs account already syncs somewhere
  syncNow: () => Promise<void>
  signIn: (password: string, fresh?: boolean) => Promise<void>
  join: (code: string) => Promise<void>
  pair: () => Promise<{ code: string; expiresAt: number }>
  changePassword: (password: string) => Promise<void>
  setOff: (off: Category[]) => Promise<void>
  leave: () => Promise<void>
  forget: () => Promise<void>
  // before signing out of Discogs: sends what's left and takes this device out of sync. Throws if it couldn't send.
  beforeSignOut: () => Promise<void>
  // set while sync is on: false when another device has started adding this batch record
  claim?: (item: QueueItem, startedAt: number) => Promise<boolean>
}

const CloudContext = createContext<Ctx | null>(null)
const RETRY_AFTER = [30_000, 60_000, 120_000, 300_000]
// Changes go up a few seconds after the last one, and automatic syncs are at least half a minute
// apart: background work (album years, record lengths) saves something every couple of seconds
const PUSH_AFTER = 5000
const MIN_GAP = 30_000

export function CloudProvider({ children }: { children: ReactNode }) {
  const { session, client } = useSession()
  const [, navigate] = useLocation()
  const username = session && session.kind !== 'demo' && !session.expired ? session.username : ''
  // bumped when this device gets in or out, so its saved key is read again
  const [version, setVersion] = useState(0)
  const device = useMemo(() => (username && version >= 0 ? deviceFor(username) : null), [username, version])
  const api = useMemo(() => (device ? cloudApi(device.device) : null), [device])
  const saved = useLiveQuery(async () => ({
    syncedAt: (await getSetting<number | null>(CLOUD.syncedAt)) ?? null,
    off: (await getSetting<Category[]>(CLOUD.off)) ?? [],
  }))
  const enabled = Boolean(api)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const busy = useRef(false)
  const again = useRef(false)
  const failures = useRef(0)
  const retry = useRef<ReturnType<typeof setTimeout>>(undefined)
  const soon = useRef<ReturnType<typeof setTimeout>>(undefined)
  const runRef = useRef<(shown?: boolean) => Promise<void>>(async () => {})
  const lastRun = useRef(0)

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

  // shown: someone asked (Sync now), so the page says it's syncing; automatic ones stay quiet
  const run = useCallback(
    async (shown = false) => {
      if (!api) return
      if (busy.current) {
        again.current = true
        return
      }
      busy.current = true
      clearTimeout(retry.current)
      clearTimeout(soon.current)
      lastRun.current = Date.now()
      if (shown) setRunning(true)
      try {
        if ((await syncNow(api)) === 'gone') setVersion((v) => v + 1)
        failures.current = 0
        setError(null)
        await refill()
      } catch (e) {
        setError((e as Error).message)
        const wait = RETRY_AFTER[Math.min(failures.current++, RETRY_AFTER.length - 1)]
        retry.current = setTimeout(() => document.visibilityState === 'visible' && runRef.current(), wait)
      } finally {
        busy.current = false
        setRunning(false)
        if (again.current) {
          again.current = false
          runRef.current()
        }
      }
    },
    [api, refill],
  )
  runRef.current = run

  // note changes while on, and send them shortly after
  useEffect(() => {
    capture(enabled, () => {
      // after a failure the retry timer goes next; changes wait for it rather than adding calls
      if (failures.current > 0) return
      clearTimeout(soon.current)
      const wait = Math.max(PUSH_AFTER, lastRun.current + MIN_GAP - Date.now())
      soon.current = setTimeout(() => runRef.current(), wait)
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

  // Once per sign-in on a browser that isn't syncing: if this Discogs account syncs elsewhere, say so
  useEffect(() => {
    if (!username || device) return
    ;(async () => {
      if (await getSetting<boolean>(CLOUD.checked)) return
      const exists = await cloudEntry()
        .exists(username)
        .catch(() => null)
      if (exists === null) return // try again next time
      await setSetting(CLOUD.checked, true)
      if (exists) toast('Sync is set up on another device', { action: { label: 'Sync here', onClick: () => navigate('/sync') } })
    })()
  }, [username, device, navigate])

  // getting in or out: the saved key changes, so read it again either way
  const entered = useCallback(async (go: () => Promise<void>) => {
    setRunning(true)
    setError(null)
    try {
      await go()
    } finally {
      setVersion((v) => v + 1)
      setRunning(false)
    }
  }, [])

  const demoValue = useDemoCloud()
  const value: Ctx = {
    exists: () => cloudEntry().exists(username),
    available: Boolean(username),
    username,
    enabled,
    running,
    error,
    syncedAt: saved?.syncedAt ?? null,
    off: saved?.off ?? [],
    syncNow: () => run(true),
    signIn: (password, fresh) => entered(() => signInSync(username, password, fresh)),
    join: (code) => entered(() => joinWithCode(username, code)),
    pair: async () => {
      if (!api) throw new Error('Not syncing')
      return api.pair()
    },
    changePassword: async (password) => {
      if (api) await savePassword(api, username, password)
    },
    setOff: async (next) => {
      if (api) await setWhatSyncs(api, next)
    },
    leave: async () => {
      if (api) await entered(() => leaveSync(api))
    },
    forget: async () => {
      if (api) await entered(() => forgetAccount(api))
    },
    beforeSignOut: async () => {
      if (api) await entered(() => signOutOfSync(api))
    },
    claim: api && !saved?.off.includes('batch') ? (item, startedAt) => claimBatch(api, item, deviceId(), startedAt) : undefined,
  }

  return <CloudContext.Provider value={session?.kind === 'demo' ? demoValue : value}>{children}</CloudContext.Provider>
}

// The demo shows sync as if it were on, with nothing behind it: switches flip, codes count down,
// and nothing leaves the browser
function useDemoCloud(): Ctx {
  const [enabled, setEnabled] = useState(true)
  const [off, setOff] = useState<Category[]>([])
  const [syncedAt, setSyncedAt] = useState(() => Date.now() - 2 * 60_000)
  const [running, setRunning] = useState(false)
  const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
  const signIn = async () => {
    await pause(600)
    setEnabled(true)
    setSyncedAt(Date.now())
  }
  return {
    available: true,
    username: 'demo',
    enabled,
    running,
    error: null,
    syncedAt,
    off,
    exists: async () => true,
    syncNow: async () => {
      setRunning(true)
      await pause(800)
      setSyncedAt(Date.now())
      setRunning(false)
    },
    signIn,
    join: signIn,
    pair: async () => {
      await pause(300)
      const pick = () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
      const code = Array.from({ length: 6 }, pick).join('')
      return { code: `${code.slice(0, 3)}-${code.slice(3)}`, expiresAt: Date.now() + 10 * 60_000 }
    },
    changePassword: () => pause(500),
    setOff: async (next) => setOff(next),
    leave: async () => setEnabled(false),
    forget: async () => setEnabled(false),
    beforeSignOut: async () => {},
  }
}

export function useCloud() {
  const ctx = useContext(CloudContext)
  if (!ctx) throw new Error('useCloud outside CloudProvider')
  return ctx
}
