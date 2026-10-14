import { useEffect, useState, useSyncExternalStore } from 'react'
import type { DiscogsClient } from '../api/discogs/client'
import { useSession } from '../hooks/session'
import { useQueue } from '../hooks/queue'
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

// Small pill for background work: sync progress and rate-limit waits.
export function StatusBar() {
  const { client } = useSession()
  const status = useClientStatus(client)
  const sync = useSync()
  const { run } = useQueue()
  const waiting = status.waitUntil !== null
  const now = useNow(waiting)

  let text = ''
  if (waiting) {
    const s = Math.max(1, Math.ceil((status.waitUntil! - now) / 1000))
    text = `Discogs rate limit, continuing in ${s}s`
  } else if (run) {
    text =
      run.kind === 'lookup'
        ? `Looking up scans (${Math.min(run.done + 1, run.total)} of ${run.total})`
        : `Adding to your collection (${Math.min(run.done + 1, run.total)} of ${run.total})`
  } else if (sync.running) {
    text = sync.total > 1 ? `${sync.label} (page ${sync.done} of ${sync.total})` : `${sync.label}…`
  }
  if (!text) return null

  return (
    <div role="status" className="pointer-events-none flex justify-center px-4">
      <p className="rounded-full bg-stone-900 px-4 py-2 text-xs font-medium text-stone-100 shadow-lg dark:bg-accent-500 dark:text-stone-950">
        {text}
      </p>
    </div>
  )
}
