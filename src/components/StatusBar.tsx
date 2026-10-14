import { useEffect, useState, useSyncExternalStore } from 'react'
import type { DiscogsClient } from '../api/discogs/client'
import { useSession } from '../hooks/session'
import { useSync } from '../hooks/sync'

const idle = { active: 0, waitUntil: null }

function useClientStatus(client: DiscogsClient | null) {
  return useSyncExternalStore(client?.subscribe ?? (() => () => {}), () => client?.status ?? idle)
}

function useNow(enabled: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!enabled) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [enabled])
  return now
}

// Thin bar at the top for background work: sync progress and rate-limit waits.
export function StatusBar() {
  const { client } = useSession()
  const status = useClientStatus(client)
  const sync = useSync()
  const waiting = status.waitUntil !== null
  const now = useNow(waiting)

  let text = ''
  if (waiting) {
    const s = Math.max(1, Math.ceil((status.waitUntil! - now) / 1000))
    text = `Discogs rate limit, continuing in ${s}s`
  } else if (sync.running) {
    text = sync.total > 1 ? `${sync.label} (page ${sync.done} of ${sync.total})` : `${sync.label}…`
  }
  if (!text) return null

  return (
    <div role="status" className="fixed inset-x-0 top-0 z-30 bg-stone-900 pt-[env(safe-area-inset-top)] text-center text-xs font-medium text-stone-100 dark:bg-accent-500 dark:text-stone-950">
      <div className="px-3 py-1.5">{text}</div>
    </div>
  )
}
