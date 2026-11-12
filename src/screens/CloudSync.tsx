import { KeyRound, MonitorSmartphone, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Category } from '../../worker/categories'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Button, Card, List, Notice, Row, Screen, Section, Switch } from '../components/ui'
import { useCloud } from '../hooks/cloud'
import { cloudEntry, CloudError } from '../lib/cloud'
import { timeAgo } from '../lib/time'

const LABELS: [Category, string][] = [
  ['plays', 'Plays'],
  ['value', 'Value history'],
  ['covers', 'Cover picks'],
  ['batch', 'Batch'],
  ['settings', 'Settings and appearance'],
  ['listenbrainz', 'ListenBrainz connection'],
  ['catalog', 'Album years and record lengths'],
]

const field =
  'min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base dark:border-stone-700 dark:bg-stone-900 read-only:bg-stone-100 read-only:text-stone-500 dark:read-only:bg-stone-800 dark:read-only:text-stone-400'

export function CloudSync() {
  const cloud = useCloud()
  return (
    <Screen title="Sync across devices" back="/settings">
      {!cloud.available ? <Notice tone="info">Sync isn't available in the demo.</Notice> : cloud.enabled ? <Syncing /> : <GetIn />}
    </Screen>
  )
}

function message(e: unknown, wrong: string): string {
  if (e instanceof CloudError) {
    if (e.status === 401) return wrong
    if (e.status === 403) return e.message
    if (e.status === 429) return 'Too many tries. Wait a minute and try again.'
  }
  return (e as Error).message
}

// Not syncing here yet: a password (new or the account's), or a code from a device that already syncs
function GetIn() {
  const cloud = useCloud()
  const [exists, setExists] = useState<boolean | null>(null)
  const [useCode, setUseCode] = useState(false)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wrong, setWrong] = useState(false)
  const [startOver, setStartOver] = useState(false)

  useEffect(() => {
    cloudEntry()
      .exists(cloud.username)
      .then(setExists, () => setExists(false))
  }, [cloud.username])

  async function go(task: () => Promise<void>, wrongText: string) {
    setBusy(true)
    setError(null)
    setWrong(false)
    try {
      await task()
    } catch (e) {
      setError(message(e, wrongText))
      setWrong(e instanceof CloudError && e.status === 401)
    } finally {
      setBusy(false)
    }
  }

  const newAccount = exists === false
  const tooShort = newAccount && password.length < 8

  return (
    <Section>
      {startOver && (
        <ConfirmDialog
          title="Start a new sync account?"
          action="Start over"
          onConfirm={() => {
            setStartOver(false)
            go(() => cloud.signIn(password, true), "That password doesn't match.")
          }}
          onCancel={() => setStartOver(false)}
        >
          It begins empty and uses this password. Devices already syncing stay on the old one.
        </ConfirmDialog>
      )}
      <Card className="space-y-4">
        <p className="text-sm text-stone-500">
          Plays, value history, cover picks, your batch, and settings are kept on Platter's server and follow you to any device you sync.
        </p>
        {useCode ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              go(() => cloud.join(code), 'That code is wrong or has expired.')
            }}
          >
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Code from a device that syncs</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="K7P-4QM"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                className={`${field} font-mono tracking-widest`}
              />
            </label>
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" className="w-full" disabled={busy || code.replace(/[^A-Z0-9]/gi, '').length !== 6}>
              {busy ? 'Syncing…' : 'Sync this device'}
            </Button>
            <button
              type="button"
              onClick={() => setUseCode(false)}
              className="w-full text-sm font-medium text-stone-600 dark:text-stone-300"
            >
              Use the password instead
            </button>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              go(() => cloud.signIn(password), "That password doesn't match.")
            }}
          >
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Discogs username</span>
              <input value={cloud.username} readOnly autoComplete="username" className={field} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{newAccount ? 'Choose a sync password' : 'Sync password'}</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={newAccount ? 'new-password' : 'current-password'}
                className={field}
              />
              {newAccount && <span className="block text-sm text-stone-500">At least 8 characters.</span>}
            </label>
            {error && (
              <Notice tone="error">
                {error}
                {wrong && (
                  <>
                    {' '}
                    <button type="button" onClick={() => setStartOver(true)} className="font-semibold underline">
                      Start over with this password
                    </button>
                  </>
                )}
              </Notice>
            )}
            <Button type="submit" className="w-full" disabled={busy || exists === null || !password || tooShort}>
              {busy ? 'Syncing…' : newAccount ? 'Turn on sync' : 'Sync this device'}
            </Button>
            {exists && (
              <button
                type="button"
                onClick={() => setUseCode(true)}
                className="w-full text-sm font-medium text-stone-600 dark:text-stone-300"
              >
                Use a code from another device
              </button>
            )}
          </form>
        )}
      </Card>
    </Section>
  )
}

function Syncing() {
  const cloud = useCloud()
  const [error, setError] = useState<string | null>(null)
  const [stopping, setStopping] = useState<Category | null>(null)
  const [pairing, setPairing] = useState<{ code: string } | null>(null)
  const [changing, setChanging] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const attempt = async (task: () => Promise<unknown>) => {
    setError(null)
    try {
      await task()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const setCategory = (c: Category, on: boolean) => attempt(() => cloud.setOff(on ? cloud.off.filter((x) => x !== c) : [...cloud.off, c]))

  const status = cloud.running ? 'Syncing…' : cloud.syncedAt ? `Synced ${timeAgo(cloud.syncedAt)}` : undefined
  const label = (c: Category) => LABELS.find(([k]) => k === c)![1]

  return (
    <>
      {stopping && (
        <ConfirmDialog
          title={`Stop syncing ${label(stopping).toLowerCase()}?`}
          action="Stop syncing"
          onConfirm={() => {
            setCategory(stopping, false)
            setStopping(null)
          }}
          onCancel={() => setStopping(null)}
        >
          Platter's server deletes its copy. Each device keeps what it has.
        </ConfirmDialog>
      )}
      {pairing && (
        <ConfirmDialog title="Add a device" onCancel={() => setPairing(null)}>
          <p className="my-2 text-center font-mono text-3xl font-bold tracking-widest">{pairing.code}</p>
          <p>Enter it on the other device in Settings › Sync across devices. It works for 10 minutes.</p>
        </ConfirmDialog>
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete synced data?"
          action="Delete"
          onConfirm={() => {
            setDeleting(false)
            attempt(cloud.forget)
          }}
          onCancel={() => setDeleting(false)}
        >
          Platter's copy and the sync account are deleted, and sync turns off on every device. Each device keeps what it already has.
        </ConfirmDialog>
      )}

      <Section>
        <Card>
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block">Sync this device</span>
              {status && <span className="block text-sm text-stone-500">{status}</span>}
            </span>
            <Switch label="Sync this device" checked onChange={() => attempt(cloud.leave)} />
          </label>
        </Card>
        {(error ?? cloud.error) && <Notice tone="error">{error ?? cloud.error}</Notice>}
      </Section>

      <Section title="What syncs">
        <List>
          {LABELS.map(([c, text]) => (
            <Row
              key={c}
              label={text}
              trailing={
                <Switch label={text} checked={!cloud.off.includes(c)} onChange={(on) => (on ? setCategory(c, true) : setStopping(c))} />
              }
            />
          ))}
        </List>
      </Section>

      <Section>
        <List>
          <Row
            icon={<MonitorSmartphone size={20} />}
            label="Add a device"
            onClick={() => attempt(async () => setPairing(await cloud.pair()))}
          />
          <Row
            icon={<KeyRound size={20} />}
            label="Change sync password"
            detail={saved ? 'Changed' : undefined}
            onClick={() => {
              setSaved(false)
              setChanging((c) => !c)
            }}
          />
          <Row icon={<Trash2 size={20} />} label="Delete synced data" danger onClick={() => setDeleting(true)} />
        </List>
        {changing && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              attempt(async () => {
                await cloud.changePassword(newPassword)
                setNewPassword('')
                setChanging(false)
                setSaved(true)
              })
            }}
          >
            <input value={cloud.username} readOnly autoComplete="username" className="hidden" />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New sync password"
              aria-label="New sync password"
              autoComplete="new-password"
              className={field}
            />
            <Button type="submit" className="w-full" disabled={newPassword.length < 8}>
              Save
            </Button>
          </form>
        )}
      </Section>
    </>
  )
}
