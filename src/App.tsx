import { useEffect, useState } from 'react'
import { Route, Switch, useLocation } from 'wouter'
import { loadSession, takeOAuthFragment } from './auth/auth'
import { BottomNav } from './components/BottomNav'
import { StatusBar } from './components/StatusBar'
import { Spinner } from './components/ui'
import { pruneCache } from './db/cache'
import type { Session } from './db/db'
import { SessionProvider, useSession } from './hooks/session'
import { SyncProvider } from './hooks/sync'
import { describeAuthError, signInWithOAuth } from './lib/signIn'
import { About } from './screens/About'
import { Results } from './screens/Results'
import { Scan } from './screens/Scan'
import { Search } from './screens/Search'
import { Settings } from './screens/Settings'
import { Setup } from './screens/Setup'
import { Welcome } from './screens/Welcome'

type Boot = { state: 'loading' } | { state: 'ready'; session: Session | null; error?: string; justSignedIn?: boolean }

type Ready = Extract<Boot, { state: 'ready' }>

async function start(): Promise<Ready> {
  pruneCache().catch(() => {})
  const frag = takeOAuthFragment()
  if (frag && 'error' in frag) return { state: 'ready', session: null, error: describeAuthError(frag.error) }
  if (frag) {
    try {
      return { state: 'ready', session: await signInWithOAuth(frag.token, frag.secret), justSignedIn: true }
    } catch {
      return { state: 'ready', session: null, error: describeAuthError('access_token') }
    }
  }
  return { state: 'ready', session: (await loadSession()) ?? null }
}

// module-level so it runs once, even if the component mounts twice
let booting: Promise<Ready> | null = null

function useBoot(): Boot {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' })
  useEffect(() => {
    booting ??= start()
    booting.then(setBoot)
  }, [])
  return boot
}

export default function App() {
  const boot = useBoot()
  if (boot.state === 'loading') return <Spinner label="Opening Platter" />
  return (
    <SessionProvider initial={boot.session}>
      <Routes error={boot.error} justSignedIn={boot.justSignedIn} />
    </SessionProvider>
  )
}

function Routes({ error, justSignedIn }: { error?: string; justSignedIn?: boolean }) {
  const { session } = useSession()
  const [, navigate] = useLocation()

  useEffect(() => {
    if (justSignedIn) navigate('/setup', { replace: true })
  }, [justSignedIn, navigate])

  if (!session) {
    return (
      <Switch>
        <Route path="/about" component={About} />
        <Route>
          <Welcome error={error} />
        </Route>
      </Switch>
    )
  }

  return (
    <SyncProvider>
      <StatusBar />
      <main>
        <Switch>
          <Route path="/" component={Scan} />
          <Route path="/search" component={Search} />
          <Route path="/results" component={Results} />
          <Route path="/setup" component={Setup} />
          <Route path="/settings" component={Settings} />
          <Route path="/about" component={About} />
          <Route component={Scan} />
        </Switch>
      </main>
      <BottomNav />
    </SyncProvider>
  )
}
