import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { DiscogsError } from '../api/discogs/client'
import { DiscIcon } from '../components/Icons'
import { Button, buttonClass, Card, ExternalLink, Notice } from '../components/ui'
import { useSession } from '../hooks/session'
import { signInWithToken } from '../lib/signIn'

export function Welcome({ error }: { error?: string }) {
  const [useToken, setUseToken] = useState(false)

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[max(env(safe-area-inset-top),2rem)] pb-8">
      <div className="flex flex-1 flex-col justify-center gap-6">
        <div className="space-y-3">
          <DiscIcon width={48} height={48} className="text-accent-500" />
          <h1 className="text-4xl font-bold tracking-tight">Platter</h1>
          <p className="text-lg text-stone-600 dark:text-stone-400">Scan the barcode on a record and add it to your Discogs collection in a couple of taps.</p>
        </div>

        {error && <Notice tone="error">{error}</Notice>}

        {useToken ? (
          <TokenForm onCancel={() => setUseToken(false)} />
        ) : (
          <div className="space-y-3">
            <a href="/auth/start" className={buttonClass('primary', 'w-full')}>
              Log in with Discogs
            </a>
            <Button variant="ghost" className="w-full" onClick={() => setUseToken(true)}>
              Use a personal access token instead
            </Button>
          </div>
        )}

        <p className="text-sm text-stone-500">
          Platter runs entirely on your device. Your sign-in is stored in this browser and is only ever sent to Discogs.{' '}
          <Link href="/about" className="underline">
            More about privacy
          </Link>
        </p>
      </div>
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
      setSession(await signInWithToken(token.trim()))
      navigate('/setup', { replace: true })
    } catch (err) {
      setError(err instanceof DiscogsError && err.status === 401 ? "Discogs didn't accept that token. Check you copied all of it." : (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-4">
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>
          Open your <ExternalLink href="https://www.discogs.com/settings/developers">Discogs developer settings</ExternalLink> and log in if asked.
        </li>
        <li>Tick the box to agree to the API terms, then tap <b>Generate new token</b>.</li>
        <li>Copy the long string next to "Current token" and paste it below.</li>
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
      <p className="text-xs text-stone-500">The token stays on this device. You can delete it on Discogs any time, which signs Platter out.</p>
    </Card>
  )
}
