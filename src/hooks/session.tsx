import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { DiscogsClient } from '../api/discogs/client'
import { authFromSession } from '../auth/auth'
import type { Auth } from '../auth/types'
import type { Session } from '../db/db'

type Ctx = {
  session: Session | null
  auth: Auth | null
  client: DiscogsClient | null
  setSession: (s: Session | null) => void
}

const SessionContext = createContext<Ctx | null>(null)

export function SessionProvider({ initial, children }: { initial: Session | null; children: ReactNode }) {
  const [session, setSession] = useState(initial)
  const value = useMemo(() => {
    const auth = session ? authFromSession(session) : null
    return { session, auth, client: auth ? new DiscogsClient(auth) : null, setSession }
  }, [session])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession outside SessionProvider')
  return ctx
}

// For screens that only render when signed in
export function useSignedIn() {
  const { session, auth, client, setSession } = useSession()
  if (!session || !auth || !client) throw new Error('Not signed in')
  return { session, auth, client, setSession, username: session.username }
}
