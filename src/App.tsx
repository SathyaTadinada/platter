import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Route, Switch, useLocation } from 'wouter'
import { loadSession, takeOAuthFragment } from './auth/auth'
import { BottomNav, SideNav } from './components/Nav'
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

type Boot = { state: 'loading' } | { state: 'ready'; session: Session | null; error?: string }

type Ready = Extract<Boot, { state: 'ready' }>

async function start(): Promise<Ready> {
  pruneCache().catch(() => {})
  const frag = takeOAuthFragment()
  if (frag && 'error' in frag) return { state: 'ready', session: null, error: describeAuthError(frag.error) }
  if (frag) {
    try {
      const session = await signInWithOAuth(frag.token, frag.secret)
      // set the URL before the first render so the scanner never mounts
      history.replaceState(null, '', '/setup')
      return { state: 'ready', session }
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
      <Routes error={boot.error} />
    </SessionProvider>
  )
}

function Routes({ error }: { error?: string }) {
  const { session } = useSession()

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
      <Shell>
        <Switch>
          <Route path="/" component={Scan} />
          <Route path="/search" component={Search} />
          <Route path="/results" component={Results} />
          <Route path="/setup" component={Setup} />
          <Route path="/settings" component={Settings} />
          <Route path="/about" component={About} />
          <Route component={Scan} />
        </Switch>
      </Shell>
    </SyncProvider>
  )
}

// Full-height layout: only the middle scrolls, so the nav never moves.
function Shell({ children }: { children: ReactNode }) {
  const [path] = useLocation()
  const scroller = useRef<HTMLElement>(null)
  useEffect(() => {
    scroller.current?.scrollTo(0, 0)
  }, [path])

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      <SideNav />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <main ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </main>
        <StatusBar />
      </div>
      <BottomNav />
    </div>
  )
}
