import { useLocation } from 'wouter'
import { setAccentScope } from '../lib/accent'
import { applyTheme } from '../lib/theme'
import { stopPriceCheck } from './prices'
import { useSession } from './session'

// Signing out or leaving the demo: off to the welcome page first, then the device is cleared,
// so the page being left never shows up emptied for a moment on the way out
export function useSignOut() {
  const { auth, setSession } = useSession()
  const [, navigate] = useLocation()
  return async (opts?: { everything?: boolean }) => {
    stopPriceCheck()
    navigate('/', { replace: true })
    setSession(null)
    await auth?.signOut(opts)
    // the theme and accent go back to their defaults with the rest
    if (opts?.everything) {
      applyTheme()
      setAccentScope('none')
    }
  }
}
