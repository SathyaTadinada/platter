import { useLiveQuery } from 'dexie-react-hooks'
import {
  Boxes,
  Cloud,
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
import { useEffect, useRef, useState } from 'react'
import { getFields } from '../api/discogs/endpoints'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useInstallPrompt } from '../components/InstallHint'
import { ProfileLink } from '../components/Profile'
import { Button, List, Notice, Row, Screen, Section, Segmented } from '../components/ui'
import { db, getSetting, setSetting } from '../db/db'
import { useCloud } from '../hooks/cloud'
import { useSignedIn } from '../hooks/session'
import { useSignOut } from '../hooks/signOut'
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
import { libraryItems } from '../lib/masters'
import { timeAgo } from '../lib/time'

const BACKED_UP_KEY = 'backedUpAt'
const shortDay = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function Settings() {
  const { session, client } = useSignedIn()
  const sync = useSync()
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const install = useInstallPrompt()
  const demo = session.kind === 'demo'
  const cloud = useCloud()
  const meta = useCollectionMeta().data
  const crates = meta?.folders.length
  const lb = useLiveQuery(async () => (await db.settings.get(LISTENBRAINZ_KEY))?.value as ListenBrainzSettings | undefined)

  const stats = useLiveQuery(async () => ({
    records: await db.collection.count(),
    wants: await db.wants.count(),
    syncedAt: (await db.settings.get('collectionSyncedAt'))?.value as number | undefined,
    backedUpAt: (await db.settings.get(BACKED_UP_KEY))?.value as number | undefined,
    // what a backup would save that Discogs doesn't have
    plays: await db.plays.count(),
    covers: await db.covers.count(),
    values: await db.valueHistory.count(),
  }))
  const onlyHere =
    stats !== undefined &&
    (cloud.enabled
      ? (cloud.off.includes('plays') && stats.plays > 0) ||
        (cloud.off.includes('covers') && stats.covers > 0) ||
        (cloud.off.includes('value') && stats.values > 0)
      : stats.plays + stats.covers + stats.values > 0)
  const [leaving, setLeaving] = useState<string | null>(null)
  const [unsent, setUnsent] = useState(false)

  // Syncing devices send what's left and leave sync first. If that fails, say so rather than lose it.
  async function confirmSignOut() {
    if (cloud.enabled) {
      setLeaving('Syncing…')
      try {
        if (unsent) await cloud.leave()
        else await cloud.beforeSignOut()
      } catch {
        setUnsent(true)
        setLeaving(null)
        return
      }
    }
    await signOut({ everything })
  }
  const [everything, setEverything] = useState(false)
  const [backedUp, setBackedUp] = useState(false)

  const fields = useAsync(async () => {
    const [{ fields }, map] = await Promise.all([getFields(client, session.username), getSetting<FieldMap>('fieldMap')])
    return matchFields(fields, map ?? {}).filter((m) => m.field && !m.spec.optional).length
  }, [client, session.username])

  const signOut = useSignOut()

  async function exportBackup() {
    download(`platter-${today()}.json`, JSON.stringify(await exportLocalData(), null, 2), 'application/json')
    await setSetting(BACKED_UP_KEY, Date.now())
  }

  async function exportCollection() {
    const items = await libraryItems()
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
      {confirming && (
        <ConfirmDialog
          title="Sign out?"
          action={unsent ? 'Sign out anyway' : 'Sign out'}
          busy={leaving}
          onConfirm={confirmSignOut}
          onCancel={() => {
            setConfirming(false)
            setEverything(false)
            setUnsent(false)
          }}
        >
          <div className="space-y-4">
            <p>
              {cloud.enabled
                ? 'This browser is cleared and stops syncing. Your synced data stays on Platter’s server.'
                : 'Your plays and other Platter data on this device get deleted. Nothing changes on Discogs.'}
            </p>
            {unsent && <Notice tone="error">Your latest changes couldn’t be synced, so signing out now loses them.</Notice>}
            {onlyHere && (
              <Button
                variant="secondary"
                className="min-h-10 w-full text-sm"
                disabled={backedUp}
                onClick={async () => {
                  await exportBackup()
                  setBackedUp(true)
                }}
              >
                {backedUp ? <Check size={16} aria-hidden /> : <Download size={16} aria-hidden />}
                {backedUp ? 'Backed up' : 'Back up first'}
              </Button>
            )}
            <label className="flex cursor-pointer items-start gap-2.5 text-stone-700 dark:text-stone-300">
              <input type="checkbox" checked={everything} onChange={(e) => setEverything(e.target.checked)} className="mt-0.5" />
              Delete everything, including album years and preferences
            </label>
          </div>
        </ConfirmDialog>
      )}
      <div className="lg:grid lg:grid-cols-2 lg:gap-x-8">
        <div>
          <Section title="Account">
            <List>
              <li>
                <ProfileLink
                  detail={
                    session.expired
                      ? 'Needs logging in again'
                      : session.kind === 'oauth'
                        ? 'Logged in with Discogs'
                        : 'Using a personal access token'
                  }
                  className="px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50"
                />
              </li>
              <Row
                icon={<LogOut size={20} />}
                label={demo ? 'Leave demo' : 'Sign out'}
                danger
                onClick={() => (demo ? signOut() : setConfirming(true))}
              />
            </List>
          </Section>

          <Section title="Collection">
            <List>
              <Row
                icon={<Disc3 size={20} />}
                label={stats ? plural(stats.records, 'record') : 'Collection'}
                detail={
                  sync.running
                    ? `${sync.label}…`
                    : !stats
                      ? undefined
                      : stats.syncedAt
                        ? `Synced ${timeAgo(stats.syncedAt)}`
                        : 'Not synced yet'
                }
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
                value={fields.data !== undefined ? `${fields.data} of ${FIELD_SPECS.filter((s) => !s.optional).length} set up` : undefined}
                href="/setup"
              />
            </List>
            <List>
              <Row icon={<FileUp size={20} />} label="Import collection" detail="From a Discogs export file" href="/import" />
              <Row
                icon={<FileDown size={20} />}
                label="Export collection"
                detail="A CSV in the same format as Discogs"
                onClick={exportCollection}
              />
            </List>
            {sync.error && <Notice tone="error">{sync.error}</Notice>}
          </Section>

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
        </div>
        <div>
          <Section title="Appearance">
            <Appearance />
          </Section>

          <Section title="Your data">
            <List>
              {cloud.available && (
                <Row
                  icon={<Cloud size={20} />}
                  label="Sync across devices"
                  detail={cloud.enabled ? (cloud.syncedAt ? `Synced ${timeAgo(cloud.syncedAt)}` : 'On') : undefined}
                  value={cloud.enabled ? undefined : 'Off'}
                  href="/sync"
                />
              )}
              <Row
                icon={<Download size={20} />}
                label="Back up to a file"
                detail={stats?.backedUpAt ? `Last backed up ${shortDay(stats.backedUpAt)}` : 'Not backed up yet'}
                onClick={exportBackup}
              />
              <Row
                icon={<Upload size={20} />}
                label="Restore from a file"
                detail="A Platter backup"
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
  // changed on another device
  useEffect(() => {
    const update = () => {
      setLocal(getAccent())
      setThemeLocal(getTheme())
    }
    window.addEventListener('platter-prefs', update)
    return () => window.removeEventListener('platter-prefs', update)
  }, [])
  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
      <Segmented
        label="Theme"
        card
        value={theme}
        onChange={(t) => {
          setTheme(t)
          setThemeLocal(t)
        }}
        options={[
          { value: 'system', label: 'System', icon: <MonitorSmartphone size={16} aria-hidden /> },
          { value: 'light', label: 'Light', icon: <Sun size={16} aria-hidden /> },
          { value: 'dark', label: 'Dark', icon: <Moon size={16} aria-hidden /> },
        ]}
      />
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
