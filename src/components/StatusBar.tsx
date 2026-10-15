import { useEffect, useState, useSyncExternalStore } from 'react'
import type { DiscogsClient } from '../api/discogs/client'
import { useSession } from '../hooks/session'
import { useQueue } from '../hooks/queue'
import { useSync } from '../hooks/sync'
import { getTask, subscribeTask } from '../lib/task'

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
  const task = useSyncExternalStore(subscribeTask, getTask)
  const waiting = status.waitUntil !== null
  const now = useNow(waiting)

  // what's running, with any rate-limit wait added on, so it's all in one pill
  let text = ''
  if (task) {
    text = task
  } else if (run) {
    text =
      run.kind === 'lookup'
        ? `Looking up scans (${Math.min(run.done + 1, run.total)} of ${run.total})`
        : `Adding to your collection (${Math.min(run.done + 1, run.total)} of ${run.total})`
  } else if (sync.running) {
    text = sync.total > 1 ? `${sync.label} (page ${sync.done} of ${sync.total})` : `${sync.label}…`
  }
  if (waiting) {
    const s = Math.max(1, Math.ceil((status.waitUntil! - now) / 1000))
    text = text ? `${text.replace(/…$/, '')} · waiting on Discogs (${s}s)` : `Waiting on Discogs (${s}s)`
  }
  if (!text) return null

  return (
    <div role="status" className="pointer-events-none flex justify-center px-4">
      <p className="rounded-full bg-stone-900 px-4 py-2 text-xs font-medium text-stone-100 shadow-lg dark:bg-accent dark:text-accent-fg">
        {text}
      </p>
    </div>
  )
}
