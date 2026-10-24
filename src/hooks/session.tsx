import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { DiscogsClient, RateLimiter } from '../api/discogs/client'
import { getDemoFetch, isDemoLocal } from '../demo/registry'
import { authFromSession } from '../auth/auth'
import type { Auth } from '../auth/types'
import type { Session } from '../db/db'
import { setAccentScope } from '../lib/accent'

type Ctx = {
  session: Session | null
  auth: Auth | null
  client: DiscogsClient | null
  setSession: (s: Session | null) => void
}

const SessionContext = createContext<Ctx | null>(null)

// While Discogs isn't accepting the sign-in, nothing is sent: every request gets the same
// answer straight away instead of failing (and being retried) against Discogs
const refused: typeof fetch = async () =>
  new Response(JSON.stringify({ message: 'Log in to Discogs again to continue.' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })

export function SessionProvider({ initial, children }: { initial: Session | null; children: ReactNode }) {
  const [session, setSession] = useState(initial)
  useLayoutEffect(() => setAccentScope(!session ? 'none' : session.kind === 'demo' ? 'demo' : 'user'), [session])
  const value = useMemo(() => {
    const auth = session ? authFromSession(session) : null
    // signed-out requests get a lower Discogs rate limit (25 a minute)
    const demoFetch = session?.kind === 'demo' ? getDemoFetch() : null
    const client = auth
      ? demoFetch
        ? new DiscogsClient(auth, demoFetch, new RateLimiter(22), undefined, undefined, isDemoLocal)
        : session?.expired
          ? new DiscogsClient(auth, refused, undefined, undefined, undefined, () => true)
          : new DiscogsClient(auth)
      : null
    return { session, auth, client, setSession }
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
