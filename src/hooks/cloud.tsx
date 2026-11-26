import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'wouter'
import type { Category } from '../../worker/categories'
import type { Sections, Who } from '../../worker/profile'
import { searchReleases } from '../api/discogs/endpoints'
import { searchMbBarcode } from '../api/musicbrainz'
import { toast } from '../components/Toaster'
import { quiet } from '../db/capture'
import { db, getSetting, type QueueItem, type Session } from '../db/db'
import {
  capture,
  changePassword as savePassword,
  claimBatch,
  CLOUD,
  cloudApi,
  CloudError,
  cloudEntry,
  deviceFor,
  forgetAccount,
  joinWithCode,
  leave as leaveSync,
  setWhatSyncs,
  signIn as signInSync,
  signInWithDiscogs,
  signInWithPasskey,
  signOutOfSync,
  syncNow,
  takeNeedCandidates,
  type About,
  type CloudApi,
  type Login,
  type ProfileReader,
  type WaysIn,
} from '../lib/cloud'
import { deviceId } from '../lib/device'
import { lookupBarcode } from '../lib/lookup'
import { useDemoCloud } from './demoCloud'
import { RETRY_AFTER, useOnReturn } from './onReturn'
import { useProfileSharing } from './profileSharing'
import { useSession } from './session'

export type CloudCtx = {
  available: boolean // signed in with Discogs (not the demo), on a copy with Platter accounts
  username: string
  enabled: boolean
  running: boolean
  error: string | null
  syncedAt: number | null
  off: Category[]
  api: CloudApi | null // while this device is in: the account's devices, passkeys, and so on
  // reads profiles as this account when signed in to one, otherwise anonymously
  reader: ProfileReader
  // the profile's sections, once they've been read from the server. null while that's happening.
  sections: Sections | null
  setSections: (next: Sections) => Promise<void>
  who: Who
  setWho: (who: Who) => Promise<void>
  // which details about each copy the profile shows: 'rating' and Discogs field ids
  details: string[]
  setDetails: (details: string[]) => Promise<void>
  // what the profile says about its owner: a bio, their setup, links, and the rest
  about: About
  // published: done once the profile shows it, for what goes up with the rest (the record last played)
  setAbout: (about: About) => Promise<{ published: Promise<void> }>
  hidden: boolean // hidden by an admin
  // whether this Discogs user has an account, and its ways in. legacy: one made before Discogs
  // logins were confirmed, which only its password or a code opens
  waysIn: () => Promise<WaysIn & { legacy: boolean }>
  syncNow: () => Promise<void>
  signInWithDiscogs: (create: boolean) => Promise<boolean>
  signInWithPasskey: () => Promise<void>
  signIn: (password: string) => Promise<void>
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

const CloudContext = createContext<CloudCtx | null>(null)
// Changes go up a few seconds after the last one, and automatic syncs are at least half a minute
// apart: background work (album years, record lengths) saves something every couple of seconds
const PUSH_AFTER = 5000
const MIN_GAP = 30_000

const loginOf = (s: Session): Login => (s.kind === 'oauth' ? { token: s.token, tokenSecret: s.secret ?? '' } : { token: s.token })

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

  const profile = useProfileSharing(api)
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
  const stopTimers = useCallback(() => {
    clearTimeout(retry.current)
    clearTimeout(soon.current)
  }, [])
  useOnReturn(api ? run : undefined, stopTimers)

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

  // Once per open on a browser that isn't in: if this Discogs user has an account, confirm the login
  // and join it. Nothing to click; the synced data just arrives. When the check can't run, say so
  // once, with the other ways in a tap away.
  const joining = useRef(false)
  useEffect(() => {
    if (!__ACCOUNTS__ || !username || device || joining.current || !session || session.kind === 'demo' || session.expired) return
    joining.current = true
    ;(async () => {
      if (await getSetting<boolean>(CLOUD.left)) return
      const ways = await cloudEntry()
        .waysIn(session.userId)
        .catch(() => null)
      if (!ways?.exists) return
      try {
        await entered(async () => void (await signInWithDiscogs(username, loginOf(session), false)))
      } catch (e) {
        if (e instanceof CloudError && e.status !== 401)
          toast('Couldn’t sign in to your Platter account', { action: { label: 'Sign in', onClick: () => navigate('/account') } })
      }
    })()
  }, [username, device, session, entered, navigate])

  // An account made before Discogs logins were confirmed picks up its Discogs user from the first
  // device that's in, once per open until it has
  const linking = useRef(false)
  useEffect(() => {
    if (!api || linking.current || !session || session.kind === 'demo' || session.expired) return
    linking.current = true
    ;(async () => {
      const acc = await api.account().catch(() => null)
      if (acc && acc.discogsId === null) await api.link(loginOf(session)).catch(() => {})
    })()
  }, [api, session])

  const anonymous = useMemo(() => cloudEntry(), [])
  const demoValue = useDemoCloud()
  const value: CloudCtx = {
    api,
    reader: api ?? anonymous,
    waysIn: async () => {
      const entry = cloudEntry()
      const ways = await entry.waysIn(session!.userId)
      if (ways.exists) return { ...ways, legacy: false }
      const legacy = await entry.exists(username)
      return { exists: legacy, password: legacy, passkeys: false, legacy }
    },
    available: __ACCOUNTS__ && Boolean(username),
    username,
    enabled,
    running,
    error,
    syncedAt: saved?.syncedAt ?? null,
    off: saved?.off ?? [],
    ...profile,
    syncNow: () => run(true),
    signInWithDiscogs: async (create) => {
      let joined = false
      await entered(async () => {
        joined = await signInWithDiscogs(username, loginOf(session!), create)
      })
      return joined
    },
    signInWithPasskey: () => entered(() => signInWithPasskey(username, session!.userId)),
    signIn: (password) => entered(() => signInSync(username, password, session!.userId)),
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

export function useCloud() {
  const ctx = useContext(CloudContext)
  if (!ctx) throw new Error('useCloud outside CloudProvider')
  return ctx
}

// Where "you" goes, from the sidebar's picture or the top of Settings: your profile when you share
// one, the Platter account (where it's switched on) when you could, and without a Platter account
// (it's opt-in) undefined, for your Discogs profile
export function useYourPage(): string | undefined {
  const cloud = useCloud()
  if (!cloud.enabled) return undefined
  const sharing = !cloud.hidden && cloud.who !== 'private'
  return sharing ? `/u/${encodeURIComponent(cloud.username)}` : '/account'
}
