import { useEffect } from 'react'

// after a failed sync, how long until it tries again on its own
export const RETRY_AFTER = [30_000, 60_000, 120_000, 300_000]

// Runs now, whenever the app comes back to the front, and when the network returns. stop runs when
// it's done with, for the caller's timers.
export function useOnReturn(run: (() => unknown) | undefined, stop: () => void) {
  useEffect(() => {
    if (!run) return
    run()
    const onVisible = () => document.visibilityState === 'visible' && run()
    const onOnline = () => run()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      stop()
    }
  }, [run, stop])
}
