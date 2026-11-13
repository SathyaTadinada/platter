import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DiscogsClient, RateLimiter } from '../api/discogs/client'
import { getDemoFetch, isDemoLocal } from '../demo/registry'
import { authFromSession } from '../auth/auth'
import type { Auth } from '../auth/types'
import type { Session } from '../db/db'
import { setAccentScope } from '../lib/accent'
import { recheckSession } from '../lib/signIn'

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

// Calls back when Discogs answers a request with 401, whatever asked for it
const watching =
  (rejected: () => void): typeof fetch =>
  async (...a) => {
    const res = await fetch(...a)
    if (res.status === 401) rejected()
    return res
  }

export function SessionProvider({ initial, children }: { initial: Session | null; children: ReactNode }) {
  const [session, setSession] = useState(initial)
  const rejected = useRef(() => {})
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
          : new DiscogsClient(
              auth,
              watching(() => rejected.current()),
            )
      : null
    return { session, auth, client, setSession }
  }, [session])

  // Any request turned down, not just the collection sync, checks whether the sign-in still works,
  // so a dropped sign-in shows "Log in again" instead of errors on whatever page is open. A sign-in
  // that checks out isn't checked again for a minute.
  const checkedAt = useRef(0)
  useEffect(() => {
    checkedAt.current = 0
    rejected.current = async () => {
      const { client, session } = value
      if (!client || !session || session.kind === 'demo' || session.expired) return
      if (Date.now() - checkedAt.current < 60_000) return
      checkedAt.current = Date.now()
      const next = await recheckSession(client, session)
      if (next) setSession(next)
    }
  }, [value])
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
