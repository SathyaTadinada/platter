import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { toast } from '../components/Toaster'
import { getProfile } from '../api/discogs/endpoints'
import { DiscogsError, type DiscogsClient } from '../api/discogs/client'
import { forgetDiscogs } from '../db/cache'
import { db, setSetting } from '../db/db'
import { flushScrobbles } from '../lib/plays'
import { recordCollectionValue, recordedToday } from '../lib/pricing'
import { checkPrices, stopPriceCheck } from './prices'
import { recheckSession } from '../lib/signIn'
import { isStale, syncCollection, syncWants } from '../lib/sync'
import { RETRY_AFTER, useOnReturn } from './onReturn'
import { useSession } from './session'

type SyncState = { running: boolean; label: string; done: number; total: number; error: string | null }
type Ctx = SyncState & { sync: (force?: boolean) => Promise<void>; refresh: () => Promise<void> }

const SyncContext = createContext<Ctx | null>(null)
const idle: SyncState = { running: false, label: '', done: 0, total: 0, error: null }

// Keeps the local collection and wantlist index fresh in the background.
export function SyncProvider({ children }: { children: ReactNode }) {
  const { client, session, setSession } = useSession()
  const [state, setState] = useState<SyncState>(idle)
  const busy = useRef(false)
  const syncRef = useRef<(force?: boolean) => Promise<void>>(async () => {})
  const failures = useRef(0)
  const retry = useRef<ReturnType<typeof setTimeout>>(undefined)

  const sync = useCallback(
    async (force = false) => {
      // nothing goes to Discogs while it isn't accepting the sign-in
      if (!client || !session || session.expired || busy.current) return
      busy.current = true
      clearTimeout(retry.current)
      try {
        if (force || (await isStale('collectionSyncedAt'))) {
          setState({ ...idle, running: true, label: 'Syncing your collection' })
          await syncCollection(client, session.username, (done, total) => setState((s) => ({ ...s, done, total })))
        }
        if (force || (await isStale('wantsSyncedAt'))) {
          setState({ ...idle, running: true, label: 'Syncing your wantlist' })
          await syncWants(client, session.username, (done, total) => setState((s) => ({ ...s, done, total })))
        }
        failures.current = 0
        setState(idle)
        updateValues(client, session.username)
      } catch (e) {
        if (e instanceof DiscogsError && (e.status === 401 || e.status === 403)) {
          const next = await recheckSession(client, session)
          if (next) {
            setState(idle)
            setSession(next)
            return
          }
        }
        const message = (e as Error).message
        setState({ ...idle, error: message })
        // usually Discogs' rate limit or a network blip, so try again on its own, backing off.
        // A hidden app catches up when it's back in front.
        const wait = RETRY_AFTER[Math.min(failures.current++, RETRY_AFTER.length - 1)]
        retry.current = setTimeout(() => document.visibilityState === 'visible' && syncRef.current(), wait)
        // an out-of-date collection says so on its own page; otherwise only say when asked
        if (force && !(await isStale('collectionSyncedAt'))) {
          toast(`Couldn't update your collection from Discogs. ${message}`, {
            tone: 'error',
            action: { label: 'Try again', onClick: () => syncRef.current(true) },
          })
        }
      } finally {
        busy.current = false
      }
    },
    [client, session],
  )

  syncRef.current = sync
  const stopRetry = useCallback(() => clearTimeout(retry.current), [])
  useOnReturn(sync, stopRetry)

  // Refresh from Discogs: everything kept from Discogs is out of date, so records ask for their
  // details again when opened, and album years, lengths, and prices are all checked again
  const refresh = useCallback(async () => {
    await setSetting('refreshedAt', Date.now())
    await forgetDiscogs()
    stopPriceCheck()
    await sync(true)
  }, [sync])

  return <SyncContext.Provider value={{ ...state, sync, refresh }}>{children}</SyncContext.Provider>
}

export function useSync() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync outside SyncProvider')
  return ctx
}

// Keeps value data current without anyone asking: one reading of the total a day
// for the chart, and per-record prices refreshed in the background once they're
// over six hours old. Failures just wait for the next sync.
async function updateValues(client: DiscogsClient, username: string) {
  try {
    const currency = (await getProfile(client, username)).curr_abbr ?? 'USD'
    if (!(await recordedToday())) await recordCollectionValue(client, username, currency)
    const ids = (await db.collection.toArray()).map((i) => i.releaseId)
    await flushScrobbles(client).catch(() => {})
    await checkPrices(client, ids, currency)
  } catch {
    // next sync
  }
}
