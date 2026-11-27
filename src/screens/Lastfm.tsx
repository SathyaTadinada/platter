import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useSearch } from 'wouter'
import { authUrl, getSession } from '../api/lastfm'
import { Button, Card, ExternalLink, Notice, Screen, Section, Switch } from '../components/ui'
import { db, setSetting } from '../db/db'
import { LASTFM_SETTING, type LastfmSettings } from '../lib/plays'

export function Lastfm() {
  const saved = useLiveQuery(async () => ((await db.settings.get(LASTFM_SETTING))?.value as LastfmSettings | undefined) ?? null)
  const token = new URLSearchParams(useSearch()).get('token')
  const [, navigate] = useLocation()
  const [busy, setBusy] = useState(Boolean(token))
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  // back from Last.fm with a token to swap for a session
  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    getSession(token)
      .then(({ user, key }) => setSetting(LASTFM_SETTING, { session: key, user, enabled: true } satisfies LastfmSettings))
      .catch((e) => setError((e as Error).message))
      .finally(() => {
        setBusy(false)
        navigate('/lastfm', { replace: true })
      })
  }, [token, navigate])

  const connect = () => {
    setBusy(true)
    location.assign(authUrl(`${location.origin}/lastfm`))
  }

  return (
    <Screen title="Last.fm" back="/settings">
      {saved === undefined ? null : saved && !busy ? (
        <Section>
          <Card className="space-y-4">
            <p>
              Connected as{' '}
              <ExternalLink href={`https://www.last.fm/user/${encodeURIComponent(saved.user)}`} className="font-medium">
                {saved.user}
              </ExternalLink>
            </p>
            {saved.expired ? (
              <>
                <Notice tone="error">Last.fm stopped taking plays from Platter.</Notice>
                <Button className="w-full" onClick={connect}>
                  Connect again
                </Button>
              </>
            ) : (
              <label className="flex items-center justify-between gap-3">
                <span>Send plays to Last.fm</span>
                <Switch
                  label="Send plays to Last.fm"
                  checked={saved.enabled}
                  onChange={(on) => setSetting(LASTFM_SETTING, { ...saved, enabled: on })}
                />
              </label>
            )}
            <Button variant="secondary" className="w-full" onClick={() => db.settings.delete(LASTFM_SETTING)}>
              Disconnect
            </Button>
          </Card>
        </Section>
      ) : (
        <Section>
          <div className="space-y-3">
            <p className="text-sm text-stone-600 dark:text-stone-300">
              Last.fm asks you to allow Platter, then each play you log is scrobbled. The connection stays on this device, and on
              Platter&rsquo;s server, encrypted, if you sync across devices.
            </p>
            {error && <Notice tone="error">{error}</Notice>}
            <Button className="w-full" disabled={busy} onClick={connect}>
              {busy ? 'Connecting…' : 'Connect Last.fm'}
            </Button>
          </div>
        </Section>
      )}
    </Screen>
  )
}
