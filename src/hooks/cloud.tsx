import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'wouter'
import type { Category } from '../../worker/categories'
import type { Sections, Who } from '../../worker/profile'
import { searchReleases } from '../api/discogs/endpoints'
import { searchMbBarcode } from '../api/musicbrainz'
import { toast } from '../components/Toaster'
import { quiet } from '../db/capture'
import { db, getSetting, type QueueItem } from '../db/db'
import type { Session } from '../db/db'
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
  type CloudApi,
  type Login,
  type ProfileReader,
  type WaysIn,
} from '../lib/cloud'
import { demoCloudApi } from '../lib/demoCloud'
import { deviceId } from '../lib/device'
import { forgetSent, publishProfile, type ProfileAbout } from '../lib/profile'
import { getProfile } from '../api/discogs/endpoints'
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
  api: CloudApi | null // while this device is in: the account's devices, passkeys, and so on
  // reads profiles as this account when signed in to one, otherwise anonymously
  reader: ProfileReader
  // the profile's sections, once they've been read from the server. null while that's happening.
  sections: Sections | null
  setSections: (next: Sections) => Promise<void>
  who: Who
  setWho: (who: Who) => Promise<void>
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

const CloudContext = createContext<Ctx | null>(null)
const RETRY_AFTER = [30_000, 60_000, 120_000, 300_000]
// Changes go up a few seconds after the last one, and automatic syncs are at least half a minute
// apart: background work (album years, record lengths) saves something every couple of seconds
const PUSH_AFTER = 5000
const AVATAR_WAIT = 4000
const SHARE_EVERY = 10 * 60_000
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

  const [sections, setSections] = useState<Sections | null>(null)
  const [who, setWho] = useState<Who>('public')
  const [hidden, setHidden] = useState(false)
  const shared = useRef<Sections>({})
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

  // What the profile shows goes up after a sync, and only when something in it changed
  const sharing = useRef<Promise<void>>(Promise.resolve())
  const shareNow = useCallback(async () => {
    if (!api || !Object.values(shared.current).some((v) => v === 'public')) return
    // how many records they have is part of their collection, so it only goes with that section
    const about: ProfileAbout = shared.current.collection === 'public' ? { records: await db.collection.count() } : {}
    if (client && session && session.kind !== 'demo') {
      // Their Discogs picture is worth having but not worth waiting on: the client keeps retrying a
      // request Discogs turns down, and the profile shouldn't sit unpublished while it does. Without
      // it the profile goes up anyway, and the next pass picks the picture up.
      const avatar = await Promise.race([
        getProfile(client, session.username)
          .then((p) => p.avatar_url)
          .catch(() => undefined),
        new Promise<undefined>((r) => setTimeout(r, AVATAR_WAIT)),
      ])
      if (avatar) about.avatar = avatar
    }
    await publishProfile(api, shared.current, about)
  }, [api, client, session])
  // One pass at a time: two switches flipped in a row shouldn't send everything twice at once. After
  // a sync it waits SHARE_EVERY since the last one, so a busy session doesn't rework the whole
  // collection every half minute; changing the profile's settings sends straight away.
  const lastShared = useRef(0)
  const share = useCallback(
    (now = true) => {
      if (!now && Date.now() - lastShared.current < SHARE_EVERY) return Promise.resolve()
      lastShared.current = Date.now()
      const next = sharing.current.then(shareNow)
      sharing.current = next.catch(() => {})
      return next
    },
    [shareNow],
  )

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
        await share(false)
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
    if (!username || device || joining.current || !session || session.kind === 'demo' || session.expired) return
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

  useEffect(() => {
    if (!api) {
      setSections(null)
      shared.current = {}
      return
    }
    api
      .profileSettings()
      .then(({ sections: saved, who: found, hidden: down }) => {
        shared.current = saved
        setSections(saved)
        setWho(found)
        setHidden(down)
      })
      .catch(() => {})
  }, [api])

  const anonymous = useMemo(() => cloudEntry(), [])
  const demoValue = useDemoCloud()
  const value: Ctx = {
    api,
    reader: api ?? anonymous,
    waysIn: async () => {
      const entry = cloudEntry()
      const ways = await entry.waysIn(session!.userId)
      if (ways.exists) return { ...ways, legacy: false }
      const legacy = await entry.exists(username)
      return { exists: legacy, password: legacy, passkeys: false, legacy }
    },
    available: Boolean(username),
    username,
    enabled,
    running,
    error,
    syncedAt: saved?.syncedAt ?? null,
    off: saved?.off ?? [],
    sections,
    setSections: async (next) => {
      if (!api) return
      const { sections: saved } = await api.setSections(next)
      shared.current = saved
      setSections(saved)
      await forgetSent(saved)
      await share()
    },
    who,
    hidden,
    setWho: async (next) => {
      if (!api) return
      setWho((await api.setWho(next)).who)
    },
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

// The demo shows sync as if it were on, with nothing behind it: switches flip, codes count down,
// and nothing leaves the browser
function useDemoCloud(): Ctx {
  const [enabled, setEnabled] = useState(true)
  const [exists, setExists] = useState(true)
  const [off, setOff] = useState<Category[]>([])
  const [demoSections, setDemoSections] = useState<Sections>({ collection: 'public', wantlist: 'off', stats: 'off', year: 'off' })
  const [demoWho, setDemoWho] = useState<Who>('public')
  const [syncedAt, setSyncedAt] = useState(() => Date.now() - 2 * 60_000)
  const [running, setRunning] = useState(false)
  const api = useMemo(() => demoCloudApi(), [])
  const anonymous = useMemo(() => cloudEntry(), [])
  const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
  const signIn = async () => {
    await pause(600)
    setEnabled(true)
    setExists(true)
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
    api: enabled ? api : null,
    // the demo has no account to read as, so profiles come from the real server like anyone's
    reader: anonymous,
    sections: demoSections,
    setSections: async (next) => {
      await pause(300)
      setDemoSections((s) => ({ ...s, ...next }))
    },
    who: demoWho,
    hidden: false,
    setWho: async (next) => {
      await pause(300)
      setDemoWho(next)
    },
    waysIn: async () => ({ exists, password: false, passkeys: exists, legacy: false }),
    signInWithDiscogs: async () => {
      await signIn()
      return true
    },
    signInWithPasskey: signIn,
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
    forget: async () => {
      setEnabled(false)
      setExists(false)
    },
    beforeSignOut: async () => {},
  }
}

export function useCloud() {
  const ctx = useContext(CloudContext)
  if (!ctx) throw new Error('useCloud outside CloudProvider')
  return ctx
}
