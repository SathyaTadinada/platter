import { useState, type FormEvent } from 'react'
import { startOAuth } from '../auth/oauthFlow'
import { useSession } from '../hooks/session'
import { signInWithToken } from '../lib/signIn'
import { toast } from './Toaster'

const button =
  'rounded-md bg-amber-900 px-2.5 py-1 font-semibold text-amber-50 hover:opacity-90 disabled:opacity-60 dark:bg-amber-100 dark:text-amber-950'

// Across the top of every page once Discogs stops accepting the sign-in (access revoked on
// Discogs, or replaced by signing in somewhere else). Signing in again keeps everything here.
export function SignInAgain() {
  const { session, setSession } = useSession()
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!session?.expired) return null

  async function viaDiscogs() {
    setBusy(true)
    try {
      await startOAuth()
    } catch (e) {
      toast(`Couldn't reach Discogs: ${(e as Error).message}`, { tone: 'error' })
      setBusy(false)
    }
  }

  async function withToken(e: FormEvent) {
    e.preventDefault()
    if (!token?.trim()) return
    setBusy(true)
    try {
      setSession(await signInWithToken(token.trim()))
    } catch (err) {
      toast(`That token didn't work: ${(err as Error).message}`, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="alert"
      className="shrink-0 bg-amber-100 px-4 pt-[env(safe-area-inset-top)] text-sm text-amber-950 dark:bg-amber-900/70 dark:text-amber-50"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5 py-2 text-center">
        <p>Discogs isn't accepting your sign-in anymore.</p>
        {session.kind === 'oauth' ? (
          <button type="button" onClick={viaDiscogs} disabled={busy} className={button}>
            {busy ? 'Opening Discogs…' : 'Log in again'}
          </button>
        ) : token === null ? (
          <button type="button" onClick={() => setToken('')} className={button}>
            Use a new token
          </button>
        ) : (
          <form onSubmit={withToken} className="flex gap-2">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              aria-label="Personal access token"
              placeholder="Personal access token"
              autoComplete="off"
              className="min-w-0 rounded-md bg-white px-2 py-1 text-stone-900 dark:bg-stone-950 dark:text-stone-100"
            />
            <button type="submit" disabled={busy || !token.trim()} className={button}>
              {busy ? 'Checking…' : 'Save'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
