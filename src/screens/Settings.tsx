import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { InstallSteps, isStandalone } from '../components/InstallHint'
import { Button, buttonClass, Card, Notice, Screen, Section } from '../components/ui'
import { db } from '../db/db'
import { useSignedIn } from '../hooks/session'
import { useSync } from '../hooks/sync'
import { exportLocalData, importLocalData } from '../lib/exportData'
import { timeAgo } from '../lib/time'

export function Settings() {
  const { session, auth, setSession } = useSignedIn()
  const sync = useSync()
  const [, navigate] = useLocation()
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const stats = useLiveQuery(async () => ({
    records: await db.collection.count(),
    wants: await db.wants.count(),
    syncedAt: (await db.settings.get('collectionSyncedAt'))?.value as number | undefined,
  }))

  async function signOut() {
    await auth.signOut()
    setSession(null)
    navigate('/', { replace: true })
  }

  async function doExport() {
    const data = await exportLocalData()
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `platter-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function doImport(file: File) {
    try {
      const n = await importLocalData(JSON.parse(await file.text()))
      setMessage({ tone: 'success', text: `Imported ${n} item${n === 1 ? '' : 's'}.` })
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof SyntaxError ? "That file isn't valid JSON." : (e as Error).message })
    }
  }

  return (
    <Screen title="Settings">
      <Section title="Account">
        <Card className="space-y-3">
          <p>
            Signed in as <b>{session.username}</b>
            <span className="block text-sm text-stone-500">{session.kind === 'oauth' ? 'Logged in with Discogs' : 'Using a personal access token'}</span>
          </p>
          {confirming ? (
            <div className="space-y-2">
              <p className="text-sm">
                This removes your sign-in and everything Platter keeps on this device. Your Discogs collection isn't touched.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={signOut}>
                  Sign out
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" className="w-full" onClick={() => setConfirming(true)}>
              Sign out
            </Button>
          )}
        </Card>
      </Section>

      <Section title="Collection">
        <Card className="space-y-3">
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Platter keeps a list of what you own and want so it can warn you about duplicates.
            {stats && (
              <>
                {' '}
                {stats.records} record{stats.records === 1 ? '' : 's'} and {stats.wants} want{stats.wants === 1 ? '' : 's'}
                {stats.syncedAt ? `, updated ${timeAgo(stats.syncedAt)}.` : ', not synced yet.'}
              </>
            )}
          </p>
          {sync.error && <Notice tone="error">{sync.error}</Notice>}
          <Button variant="secondary" className="w-full" disabled={sync.running} onClick={() => sync.sync(true)}>
            {sync.running ? 'Syncing…' : 'Sync now'}
          </Button>
          <Link href="/setup" className={buttonClass('secondary', 'w-full')}>
            Collection fields
          </Link>
        </Card>
      </Section>

      <Section title="Your data">
        <Card className="space-y-3">
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Back up Platter's own data, like settings, to a file. Your sign-in isn't included.
          </p>
          {message && <Notice tone={message.tone}>{message.text}</Notice>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={doExport}>
              Export
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              Import
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) doImport(f)
              e.target.value = ''
            }}
          />
        </Card>
      </Section>

      {!isStandalone() && (
        <Section title="Install">
          <Card>
            <InstallSteps />
          </Card>
        </Section>
      )}

      <Link href="/about" className={buttonClass('ghost', 'w-full')}>
        About and privacy
      </Link>
    </Screen>
  )
}
