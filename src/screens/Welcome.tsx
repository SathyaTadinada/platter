import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { DiscogsError } from '../api/discogs/client'
import { Disc3 } from 'lucide-react'
import { startOAuth } from '../auth/oauthFlow'
import { Button, Card, ExternalLink, Notice } from '../components/ui'
import { useSession } from '../hooks/session'
import { signInWithToken } from '../lib/signIn'

export function Welcome({ error }: { error?: string }) {
  const [useToken, setUseToken] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  async function logIn() {
    setStarting(true)
    setStartError(null)
    try {
      await startOAuth() // navigates away to Discogs
    } catch (e) {
      setStartError((e as Error).message)
      setStarting(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center px-6 pt-[max(env(safe-area-inset-top),1.5rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <div className="flex w-full max-w-sm flex-1 flex-col items-center justify-center text-center">
        <Disc3 size={56} strokeWidth={1.5} className="text-accent-500" aria-hidden />
        <h1 className="mt-4 text-4xl font-bold tracking-tight">Platter</h1>
        <p className="mt-2 text-stone-500">Scan your records into Discogs.</p>

        <div className="mt-10 w-full space-y-3 text-left">
          {(startError ?? error) && <Notice tone="error">{startError ?? error}</Notice>}
          {useToken ? (
            <TokenForm onCancel={() => setUseToken(false)} />
          ) : (
            <>
              <Button className="w-full" onClick={logIn} disabled={starting}>
                {starting ? 'Opening Discogs…' : 'Log in with Discogs'}
              </Button>
              <button
                type="button"
                onClick={() => setUseToken(true)}
                className="block w-full py-2 text-center text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
              >
                Use a personal access token
              </button>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-stone-500">
        Free and open source ·{' '}
        <Link href="/about" className="underline underline-offset-2">
          Privacy
        </Link>
      </p>
    </div>
  )
}

function TokenForm({ onCancel }: { onCancel: () => void }) {
  const { setSession } = useSession()
  const [, navigate] = useLocation()
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const session = await signInWithToken(token.trim())
      navigate('/setup', { replace: true })
      setSession(session)
    } catch (err) {
      setError(
        err instanceof DiscogsError && err.status === 401
          ? "Discogs didn't accept that token. Check you copied all of it."
          : (err as Error).message,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-4">
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>
          Open <ExternalLink href="https://www.discogs.com/settings/developers">Discogs developer settings</ExternalLink>
        </li>
        <li>
          Agree to the API terms and choose <b>Generate new token</b>
        </li>
        <li>Copy the token and paste it here</li>
      </ol>
      <form onSubmit={submit} className="space-y-3">
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Paste your token"
          aria-label="Personal access token"
          className="min-h-12 w-full rounded-xl border border-stone-300 bg-transparent px-3 dark:border-stone-700"
        />
        {error && <Notice tone="error">{error}</Notice>}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Back
          </Button>
          <Button type="submit" disabled={busy || token.trim().length < 20}>
            {busy ? 'Checking…' : 'Continue'}
          </Button>
        </div>
      </form>
      <p className="text-xs text-stone-500">The token stays on this device. Deleting it on Discogs signs Platter out.</p>
    </Card>
  )
}
