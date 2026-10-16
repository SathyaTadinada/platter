import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { validateToken } from '../api/listenbrainz'
import { Button, Card, ExternalLink, Notice, Screen, Section } from '../components/ui'
import { db, setSetting } from '../db/db'
import { LISTENBRAINZ_KEY, type ListenBrainzSettings } from '../lib/plays'

export function ListenBrainz() {
  const saved = useLiveQuery(async () => ((await db.settings.get(LISTENBRAINZ_KEY))?.value as ListenBrainzSettings | undefined) ?? null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function connect(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await validateToken(token.trim())
      if (!r.valid || !r.user) setError("ListenBrainz didn't accept that token.")
      else await setSetting(LISTENBRAINZ_KEY, { token: token.trim(), user: r.user, enabled: true } satisfies ListenBrainzSettings)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="ListenBrainz" back="/settings">
      {saved === undefined ? null : saved ? (
        <Section>
          <Card className="space-y-4">
            <p>
              Connected as{' '}
              <ExternalLink href={`https://listenbrainz.org/user/${encodeURIComponent(saved.user)}/`} className="font-medium">
                {saved.user}
              </ExternalLink>
            </p>
            <label className="flex items-center justify-between gap-3">
              <span>Send plays to ListenBrainz</span>
              <input
                type="checkbox"
                checked={saved.enabled}
                onChange={(e) => setSetting(LISTENBRAINZ_KEY, { ...saved, enabled: e.target.checked })}
                className="size-5"
              />
            </label>
            <p className="text-sm text-stone-500">Each play is sent as the album's tracks, ending when you logged it.</p>
            <Button variant="secondary" className="w-full" onClick={() => db.settings.delete(LISTENBRAINZ_KEY)}>
              Disconnect
            </Button>
          </Card>
        </Section>
      ) : (
        <Section>
          <form onSubmit={connect} className="space-y-3">
            <p className="text-sm text-stone-600 dark:text-stone-300">
              Copy your user token from <ExternalLink href="https://listenbrainz.org/settings/">ListenBrainz settings</ExternalLink> and
              paste it here. It stays on this device.
            </p>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="User token"
              aria-label="ListenBrainz user token"
              autoComplete="off"
              className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 font-mono text-base dark:border-stone-700 dark:bg-stone-900"
            />
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" className="w-full" disabled={busy || !token.trim()}>
              {busy ? 'Checking…' : 'Connect'}
            </Button>
          </form>
        </Section>
      )}
    </Screen>
  )
}
