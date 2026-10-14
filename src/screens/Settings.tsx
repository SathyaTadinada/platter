import { useLiveQuery } from 'dexie-react-hooks'
import { RefreshCw } from 'lucide-react'
import { useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { getFields } from '../api/discogs/endpoints'
import { useInstallPrompt } from '../components/InstallHint'
import { ProfileLink } from '../components/Profile'
import { Button, List, Notice, Row, Screen, Section } from '../components/ui'
import { db, getSetting } from '../db/db'
import { useSignedIn } from '../hooks/session'
import { useSync } from '../hooks/sync'
import { useAsync } from '../hooks/useAsync'
import { useCollectionMeta } from '../hooks/useCollectionMeta'
import { exportLocalData, importLocalData } from '../lib/exportData'
import { FIELD_SPECS, matchFields, type FieldMap } from '../lib/fields'
import { timeAgo } from '../lib/time'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function Settings() {
  const { session, auth, client, setSession } = useSignedIn()
  const sync = useSync()
  const [, navigate] = useLocation()
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const install = useInstallPrompt()
  const crates = useCollectionMeta().data?.folders.length

  const stats = useLiveQuery(async () => ({
    records: await db.collection.count(),
    wants: await db.wants.count(),
    syncedAt: (await db.settings.get('collectionSyncedAt'))?.value as number | undefined,
  }))

  const fields = useAsync(async () => {
    const [{ fields }, map] = await Promise.all([getFields(client, session.username), getSetting<FieldMap>('fieldMap')])
    return matchFields(fields, map ?? {}).filter((m) => m.field).length
  }, [client, session.username])

  async function signOut() {
    await auth.signOut()
    navigate('/', { replace: true })
    setSession(null)
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
      setMessage({ tone: 'success', text: `Imported ${plural(n, 'item')}.` })
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof SyntaxError ? "That file isn't valid JSON." : (e as Error).message })
    }
  }

  return (
    <Screen title="Settings">
      <Section title="Account">
        <List>
          <li>
            <ProfileLink
              detail={session.kind === 'oauth' ? 'Logged in with Discogs' : 'Using a personal access token'}
              className="px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50"
            />
          </li>
          {confirming ? (
            <li className="space-y-3 px-4 py-3">
              <p className="text-sm">Sign out? This clears Platter's data on this device. Your Discogs collection isn't affected.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={signOut}>
                  Sign out
                </Button>
              </div>
            </li>
          ) : (
            <Row label="Sign out" danger onClick={() => setConfirming(true)} />
          )}
        </List>
      </Section>

      <Section title="Collection">
        <List>
          <Row
            label={stats ? `${plural(stats.records, 'record')}, ${plural(stats.wants, 'want')}` : 'Collection'}
            detail={sync.running ? `${sync.label}…` : stats?.syncedAt ? `Synced ${timeAgo(stats.syncedAt)}` : 'Not synced yet'}
            trailing={
              <button
                type="button"
                aria-label="Sync now"
                disabled={sync.running}
                onClick={() => sync.sync(true)}
                className="rounded-full p-2 text-stone-600 hover:bg-stone-100 disabled:opacity-40 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                <RefreshCw size={20} className={sync.running ? 'animate-spin' : ''} />
              </button>
            }
          />
          <Row label="Crates" value={crates !== undefined ? String(crates) : undefined} href="/crates" />
          <Row label="Collection fields" value={fields.data !== undefined ? `${fields.data} of ${FIELD_SPECS.length} set up` : undefined} href="/setup" />
        </List>
        {sync.error && <Notice tone="error">{sync.error}</Notice>}
      </Section>

      <Section title="Import and backup">
        <List>
          <Row label="Import a Discogs CSV" detail="Add records from a collection export" href="/import" />
          <Row label="Export backup" onClick={doExport} />
          <Row label="Import backup" onClick={() => fileRef.current?.click()} />
        </List>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
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
      </Section>

      <Section>
        <List>
          {install && <Row label="Install Platter" onClick={install} />}
          <Row label="About and privacy" href="/about" />
        </List>
      </Section>
    </Screen>
  )
}
