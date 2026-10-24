import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from '../components/Toaster'
import { getProfile } from '../api/discogs/endpoints'
import { DiscogsError, type DiscogsClient } from '../api/discogs/client'
import { db } from '../db/db'
import { flushScrobbles } from '../lib/plays'
import { recordCollectionValue, recordedToday } from '../lib/pricing'
import { checkPrices } from './prices'
import { checkSignIn } from '../lib/signIn'
import { isStale, syncCollection, syncWants } from '../lib/sync'
import { useSession } from './session'

type SyncState = { running: boolean; label: string; done: number; total: number; error: string | null }
type Ctx = SyncState & { sync: (force?: boolean) => Promise<void> }

const SyncContext = createContext<Ctx | null>(null)
const idle: SyncState = { running: false, label: '', done: 0, total: 0, error: null }

// Keeps the local collection and wantlist index fresh in the background.
export function SyncProvider({ children }: { children: ReactNode }) {
  const { client, session, setSession } = useSession()
  const [state, setState] = useState<SyncState>(idle)
  const busy = useRef(false)
  const syncRef = useRef<(force?: boolean) => Promise<void>>(async () => {})

  const sync = useCallback(
    async (force = false) => {
      // nothing goes to Discogs while it isn't accepting the sign-in
      if (!client || !session || session.expired || busy.current) return
      busy.current = true
      try {
        if (force || (await isStale('collectionSyncedAt'))) {
          setState({ ...idle, running: true, label: 'Syncing your collection' })
          await syncCollection(client, session.username, (done, total) => setState((s) => ({ ...s, done, total })))
        }
        if (force || (await isStale('wantsSyncedAt'))) {
          setState({ ...idle, running: true, label: 'Syncing your wantlist' })
          await syncWants(client, session.username, (done, total) => setState((s) => ({ ...s, done, total })))
        }
        setState(idle)
        updateValues(client, session.username)
      } catch (e) {
        if (e instanceof DiscogsError && (e.status === 401 || e.status === 403)) {
          const check = await checkSignIn(client, session.username).catch(() => 'ok' as const)
          if (check !== 'ok') {
            // a banner asks to sign in again; a changed username just needs the session updated
            const next = check === 'expired' ? { ...session, expired: true } : { ...session, username: check.username }
            await db.session.put(next)
            setState(idle)
            setSession(next)
            return
          }
        }
        const message = (e as Error).message
        setState({ ...idle, error: message })
        toast(`Couldn't update your collection from Discogs. ${message}`, {
          tone: 'error',
          action: { label: 'Retry', onClick: () => syncRef.current(true) },
        })
      } finally {
        busy.current = false
      }
    },
    [client, session],
  )

  // check on open and whenever the app comes back to the foreground
  syncRef.current = sync
  useEffect(() => {
    sync()
    const onVisible = () => document.visibilityState === 'visible' && sync()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [sync])

  return <SyncContext.Provider value={{ ...state, sync }}>{children}</SyncContext.Provider>
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
