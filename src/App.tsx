import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Route, Switch, useLocation, useSearch } from 'wouter'
import { loadSession } from './auth/auth'
import { finishOAuth } from './auth/oauthFlow'
import { ErrorBoundary } from './components/ErrorBoundary'
import { BottomNav, SideNav } from './components/Nav'
import { StatusBar } from './components/StatusBar'
import { Toaster } from './components/Toaster'
import { Spinner } from './components/ui'
import { SignInAgain } from './components/SignInAgain'
import { pruneCache } from './db/cache'
import type { Session } from './db/db'
import { useSignOut } from './hooks/signOut'
import { SessionProvider, useSession } from './hooks/session'
import { QueueProvider } from './hooks/queue'
import { SyncProvider } from './hooks/sync'
import { useTrimPlays } from './hooks/plays'
import { useNewRecordPrices } from './hooks/prices'
import { rememberScroll, savedScroll, trackLocation } from './lib/nav'
import { signInWithOAuth } from './lib/signIn'
import { About } from './screens/About'
import { Batch } from './screens/Batch'
import { Crates } from './screens/Crates'
import { Import } from './screens/Import'
import { Results } from './screens/Results'
import { Collection } from './screens/Collection'
import { Record } from './screens/Record'
import { Release } from './screens/Release'
import { Scan } from './screens/Scan'
import { Search } from './screens/Search'
import { Settings } from './screens/Settings'
import { Setup } from './screens/Setup'
import { ListenBrainz } from './screens/ListenBrainz'
import { NowPlaying } from './screens/NowPlaying'
import { Stats } from './screens/Stats'
import { YearReview } from './screens/YearReview'
import { Wantlist } from './screens/Wantlist'
import { Welcome } from './screens/Welcome'

type Boot = { state: 'loading' } | { state: 'ready'; session: Session | null; error?: string }

type Ready = Extract<Boot, { state: 'ready' }>

async function start(): Promise<Ready> {
  pruneCache().catch(() => {})
  // Discogs sends people back here after they approve Platter
  if (location.pathname === '/auth/callback') {
    try {
      const { token, secret } = await finishOAuth(location.search)
      const session = await signInWithOAuth(token, secret)
      history.replaceState(null, '', '/')
      return { state: 'ready', session }
    } catch (e) {
      history.replaceState(null, '', '/')
      return { state: 'ready', session: null, error: (e as Error).message }
    }
  }
  const session = (await loadSession()) ?? null
  if (session?.kind === 'demo') await import('./demo')
  // a shared ?demo link opens the demo, unless someone is already signed in
  if (!session && new URLSearchParams(location.search).has('demo')) {
    const { enterDemo } = await import('./demo')
    history.replaceState(null, '', '/')
    return { state: 'ready', session: await enterDemo() }
  }
  return { state: 'ready', session }
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
    <ErrorBoundary>
      <SessionProvider initial={boot.session}>
        <Routes error={boot.error} />
      </SessionProvider>
    </ErrorBoundary>
  )
}

function Routes({ error }: { error?: string }) {
  const { session } = useSession()
  const [path] = useLocation()
  const search = useSearch()
  useEffect(() => trackLocation(path, search), [path, search])

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
      <QueueProvider>
        <Shell>
          <Switch>
            <Route path="/" component={Collection} />
            <Route path="/collection/:id">{(p) => <Record id={p.id} />}</Route>
            <Route path="/release/:id">{(p) => <Release id={p.id} />}</Route>
            <Route path="/scan" component={Scan} />
            <Route path="/batch" component={Batch} />
            <Route path="/import" component={Import} />
            <Route path="/search" component={Search} />
            <Route path="/results" component={Results} />
            <Route path="/setup" component={Setup} />
            <Route path="/settings" component={Settings} />
            <Route path="/crates" component={Crates} />
            <Route path="/wantlist" component={Wantlist} />
            <Route path="/stats" component={Stats} />
            <Route path="/stats/year/:year?">{(p) => <YearReview year={p.year} />}</Route>
            <Route path="/play" component={NowPlaying} />
            <Route path="/listenbrainz" component={ListenBrainz} />
            <Route path="/value" component={Stats} />
            <Route path="/about" component={About} />
            <Route component={Collection} />
          </Switch>
        </Shell>
      </QueueProvider>
    </SyncProvider>
  )
}

function DemoBar() {
  const { session } = useSession()
  const leave = useSignOut()
  if (session?.kind !== 'demo') return null
  return (
    <div className="flex shrink-0 items-center justify-center gap-3 bg-accent px-4 pt-[env(safe-area-inset-top)] text-sm text-accent-fg">
      <p className="py-1.5">
        <b>Demo</b>
      </p>
      <button type="button" onClick={leave} className="rounded-md bg-accent-fg px-2 py-0.5 font-medium text-accent hover:opacity-90">
        Exit
      </button>
    </div>
  )
}

// Pinned to the screen edges rather than sized with 100dvh, which installed iOS apps get
// wrong at launch. Only the middle scrolls, so the header and tab bar stay put.
function Shell({ children }: { children: ReactNode }) {
  useNewRecordPrices()
  useTrimPlays()
  const { session } = useSession()
  const [path] = useLocation()
  const scroller = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const target = savedScroll()
    el.scrollTo(0, 0)
    if (!target) return
    // the page may still be loading its content; keep trying for a moment
    const until = Date.now() + 1000
    let frame = 0
    const tick = () => {
      el.scrollTo(0, target)
      if (Math.abs(el.scrollTop - target) > 1 && Date.now() < until) frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [path])

  return (
    <div className="fixed inset-0 flex flex-col">
      <DemoBar />
      <SignInAgain />
      {/* either bar already covers the status bar area */}
      <div
        className={`flex min-h-0 flex-1 flex-col lg:flex-row ${session?.kind === 'demo' || session?.expired ? '[--header-inset:0px]' : ''}`}
      >
        <SideNav />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <main
            ref={scroller}
            onScroll={(e) => rememberScroll(e.currentTarget.scrollTop)}
            className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-none [container-type:size]"
          >
            {children}
          </main>
          <div className="pointer-events-none absolute inset-x-0 bottom-[calc(0.75rem+var(--status-lift,0px))] z-30 space-y-2">
            <Toaster />
            <StatusBar />
          </div>
        </div>
        <BottomNav />
      </div>
    </div>
  )
}
