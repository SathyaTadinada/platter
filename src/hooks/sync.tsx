import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { isStale, syncCollection, syncWants } from '../lib/sync'
import { useSession } from './session'

type SyncState = { running: boolean; label: string; done: number; total: number; error: string | null }
type Ctx = SyncState & { sync: (force?: boolean) => Promise<void> }

const SyncContext = createContext<Ctx | null>(null)
const idle: SyncState = { running: false, label: '', done: 0, total: 0, error: null }

// Keeps the local collection and wantlist index fresh in the background.
export function SyncProvider({ children }: { children: ReactNode }) {
  const { client, session } = useSession()
  const [state, setState] = useState<SyncState>(idle)
  const busy = useRef(false)

  const sync = useCallback(
    async (force = false) => {
      if (!client || !session || busy.current) return
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
      } catch (e) {
        setState({ ...idle, error: (e as Error).message })
      } finally {
        busy.current = false
      }
    },
    [client, session],
  )

  // check on open and whenever the app comes back to the foreground
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
