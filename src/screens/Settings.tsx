import { useLiveQuery } from 'dexie-react-hooks'
import {
  Boxes,
  Check,
  MonitorSmartphone,
  Moon,
  Radio,
  Sun,
  Disc3,
  Download,
  FileDown,
  FileUp,
  Info,
  ListChecks,
  LogOut,
  MonitorDown,
  RefreshCw,
  Upload,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { getFields } from '../api/discogs/endpoints'
import { useInstallPrompt } from '../components/InstallHint'
import { ProfileLink } from '../components/Profile'
import { Button, List, Notice, Row, Screen, Section } from '../components/ui'
import { db, getSetting } from '../db/db'
import { stopPriceCheck } from '../hooks/prices'
import { useSignedIn } from '../hooks/session'
import { useSync } from '../hooks/sync'
import { useAsync } from '../hooks/useAsync'
import { useCollectionMeta } from '../hooks/useCollectionMeta'
import { download, today } from '../lib/download'
import { exportLocalData, importLocalData } from '../lib/exportData'
import { FIELD_SPECS, matchFields, type FieldMap } from '../lib/fields'
import { ACCENTS, getAccent, setAccent, type AccentId } from '../lib/accent'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { LISTENBRAINZ_KEY, type ListenBrainzSettings } from '../lib/plays'
import { toCsv } from '../lib/library'
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
  const demo = session.kind === 'demo'
  const meta = useCollectionMeta().data
  const crates = meta?.folders.length
  const lb = useLiveQuery(async () => (await db.settings.get(LISTENBRAINZ_KEY))?.value as ListenBrainzSettings | undefined)

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
    stopPriceCheck()
    await auth.signOut()
    navigate('/', { replace: true })
    setSession(null)
  }

  async function exportBackup() {
    download(`platter-${today()}.json`, JSON.stringify(await exportLocalData(), null, 2), 'application/json')
  }

  async function exportCollection() {
    const items = await db.collection.toArray()
    download(`${session.username}-collection-${today()}.csv`, toCsv(items, meta?.folders ?? [], meta?.fields ?? []), 'text/csv')
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
    <Screen title="Settings" width="wide">
      <div className="lg:grid lg:grid-cols-2 lg:gap-x-8">
        <div>
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
                  <p className="text-sm">
                    {demo
                      ? 'Leave the demo? Anything you changed is thrown away.'
                      : "Sign out? Platter's data on this device gets deleted. Nothing changes on Discogs."}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" onClick={() => setConfirming(false)}>
                      Cancel
                    </Button>
                    <Button variant="danger" onClick={signOut}>
                      {demo ? 'Leave demo' : 'Sign out'}
                    </Button>
                  </div>
                </li>
              ) : (
                <Row icon={<LogOut size={20} />} label={demo ? 'Leave demo' : 'Sign out'} danger onClick={() => setConfirming(true)} />
              )}
            </List>
          </Section>

          <Section title="Collection">
            <List>
              <Row
                icon={<Disc3 size={20} />}
                label={stats ? plural(stats.records, 'record') : 'Collection'}
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
              <Row icon={<Boxes size={20} />} label="Crates" value={crates !== undefined ? String(crates) : undefined} href="/crates" />
              <Row
                icon={<ListChecks size={20} />}
                label="Collection fields"
                value={fields.data !== undefined ? `${fields.data} of ${FIELD_SPECS.length} set up` : undefined}
                href="/setup"
              />
            </List>
            {sync.error && <Notice tone="error">{sync.error}</Notice>}
          </Section>
        </div>
        <div>
          {!demo && (
            <Section title="Listening">
              <List>
                <Row
                  icon={<Radio size={20} />}
                  label="ListenBrainz"
                  value={lb ? (lb.enabled ? lb.user : 'Paused') : 'Off'}
                  href="/listenbrainz"
                />
              </List>
            </Section>
          )}

          <Section title="Appearance">
            <Appearance />
          </Section>

          <Section title="Your data">
            <List>
              <Row icon={<FileUp size={20} />} label="Import collection" detail="From a Discogs export file" href="/import" />
              <Row
                icon={<FileDown size={20} />}
                label="Export collection"
                detail="A CSV in the same format as Discogs"
                onClick={exportCollection}
              />
            </List>
            <List>
              <Row
                icon={<Download size={20} />}
                label="Back up Platter data"
                detail="Plays and anything else not on Discogs"
                onClick={exportBackup}
              />
              <Row
                icon={<Upload size={20} />}
                label="Restore a backup"
                detail="From a Platter backup file"
                onClick={() => fileRef.current?.click()}
              />
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
              {install && <Row icon={<MonitorDown size={20} />} label="Install Platter" onClick={install} />}
              <Row icon={<Info size={20} />} label="About" href="/about" />
            </List>
          </Section>
        </div>
      </div>
    </Screen>
  )
}

function Appearance() {
  const [accent, setLocal] = useState<AccentId>(getAccent)
  const [theme, setThemeLocal] = useState<Theme>(getTheme)
  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-xl bg-stone-100 p-1 dark:bg-stone-800">
        {(
          [
            ['system', 'System', MonitorSmartphone],
            ['light', 'Light', Sun],
            ['dark', 'Dark', Moon],
          ] as const
        ).map(([t, label, Icon]) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={theme === t}
            onClick={() => {
              setTheme(t)
              setThemeLocal(t)
            }}
            className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium ${
              theme === t ? 'bg-white shadow-sm dark:bg-stone-950' : 'text-stone-600 dark:text-stone-400'
            }`}
          >
            <Icon size={16} aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Accent color" className="grid grid-cols-5 gap-3 sm:grid-cols-10">
        {ACCENTS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={accent === a.id}
            aria-label={a.label}
            title={a.label}
            onClick={() => {
              setAccent(a.id)
              setLocal(a.id)
            }}
            className={`flex aspect-square w-full items-center justify-center rounded-full bg-accent transition hover:scale-105 ${
              accent === a.id ? 'ring-2 ring-stone-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-stone-900' : ''
            }`}
            data-accent={a.id}
          >
            {accent === a.id && <Check size={18} strokeWidth={3} className="text-accent-fg" aria-hidden />}
          </button>
        ))}
      </div>
    </div>
  )
}
