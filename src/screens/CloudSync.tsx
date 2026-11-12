import {
  CalendarDays,
  Headphones,
  Image,
  KeyRound,
  Layers,
  MonitorSmartphone,
  Radio,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { Category } from '../../worker/categories'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PairingCodeDisplay, PairingCodeInput } from '../components/PairingCode'
import { fieldClass, NewPassword, newPasswordReady, PasswordInput } from '../components/PasswordField'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toaster'
import { Button, Card, List, Notice, Row, Screen, Section, Switch } from '../components/ui'
import { useCloud } from '../hooks/cloud'
import { cloudEntry, CloudError } from '../lib/cloud'
import { timeAgo } from '../lib/time'

const CATEGORIES: { id: Category; label: string; icon: ReactNode }[] = [
  { id: 'plays', label: 'Plays', icon: <Headphones size={20} /> },
  { id: 'value', label: 'Value history', icon: <TrendingUp size={20} /> },
  { id: 'covers', label: 'Cover picks', icon: <Image size={20} /> },
  { id: 'batch', label: 'Batch', icon: <Layers size={20} /> },
  { id: 'settings', label: 'Settings and appearance', icon: <SlidersHorizontal size={20} /> },
  { id: 'listenbrainz', label: 'ListenBrainz connection', icon: <Radio size={20} /> },
  { id: 'catalog', label: 'Album years and lengths', icon: <CalendarDays size={20} /> },
]

export function CloudSync() {
  const cloud = useCloud()
  return (
    <Screen title="Sync across devices" back="/settings" width="wide">
      {!cloud.available ? <Notice tone="info">Sync isn't available in the demo.</Notice> : cloud.enabled ? <Syncing /> : <GetIn />}
    </Screen>
  )
}

// two columns on wide screens, like Settings
const columns = 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8'

function explain(e: unknown, wrong: string): string {
  if (e instanceof CloudError) {
    if (e.status === 401) return wrong
    if (e.status === 403) return e.message
    if (e.status === 429) return 'Too many tries. Wait a minute and try again.'
    if (e.status === 0) return e.message
  }
  return 'Something went wrong. Try again in a minute.'
}

// Not syncing here yet: the account's password (or a new one), or a code from another device
function GetIn() {
  const cloud = useCloud()
  const [exists, setExists] = useState<boolean | null>(null)
  const [useCode, setUseCode] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wrong, setWrong] = useState(false)
  const [startOver, setStartOver] = useState(false)
  const [codeKey, setCodeKey] = useState(0)

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
      setError(explain(e, wrongText))
      setWrong(e instanceof CloudError && e.status === 401)
      if (useCode) setCodeKey((k) => k + 1) // clear the boxes for another try
    } finally {
      setBusy(false)
    }
  }

  const switchTo = (code: boolean) => {
    setUseCode(code)
    setError(null)
    setWrong(false)
  }

  const creating = exists === false
  const ready = creating ? newPasswordReady(password, confirm) : password.length > 0

  const form = useCode ? (
    <div className="space-y-5">
      <div>
        <h2 className="font-semibold">Enter the code from your other device</h2>
        <p className="mt-1 text-sm text-stone-500">Get one from a device that already syncs, under Add a device.</p>
      </div>
      <PairingCodeInput
        key={codeKey}
        disabled={busy}
        onComplete={(code) => go(() => cloud.join(code), 'That code is wrong or has expired.')}
      />
      {busy && <p className="text-center text-sm text-stone-500">Checking…</p>}
      {error && <Notice tone="error">{error}</Notice>}
      <Button variant="secondary" className="w-full" onClick={() => switchTo(false)}>
        Use your password instead
      </Button>
    </div>
  ) : (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready) go(() => cloud.signIn(password), 'Incorrect password.')
      }}
    >
      <div>
        <h2 className="font-semibold">{creating ? 'Set up sync' : 'Sign in to sync'}</h2>
        <p className="mt-1 text-sm text-stone-500">
          {creating
            ? 'Choose a password for syncing. You’ll use it to add your other devices.'
            : 'This Discogs account already syncs on another device.'}
        </p>
      </div>
      <div className="space-y-1.5">
        <label className="block text-sm font-medium" htmlFor="sync-username">
          Discogs username
        </label>
        <input id="sync-username" value={cloud.username} readOnly autoComplete="username" className={fieldClass} />
      </div>
      {creating ? (
        <NewPassword value={password} onChange={setPassword} confirm={confirm} onConfirmChange={setConfirm} />
      ) : (
        <PasswordInput label="Password" value={password} onChange={setPassword} autoComplete="current-password" invalid={wrong} />
      )}
      {error && (
        <Notice tone="error">
          {error}
          {wrong && (
            <>
              {' '}
              Forgot it? Change it on a device that still syncs, or{' '}
              <button type="button" onClick={() => setStartOver(true)} className="font-semibold underline">
                start a new sync account
              </button>
              .
            </>
          )}
        </Notice>
      )}
      <Button type="submit" className="w-full" disabled={busy || exists === null || !ready}>
        {busy ? 'Signing in…' : creating ? 'Turn on sync' : 'Sign in'}
      </Button>
      {exists && (
        <Button variant="secondary" className="w-full" onClick={() => switchTo(true)}>
          Use a code instead
        </Button>
      )}
    </form>
  )

  return (
    <div className="mx-auto max-w-lg">
      {startOver && (
        <ConfirmDialog
          title="Start a new sync account?"
          action="Start new account"
          onConfirm={() => {
            setStartOver(false)
            go(() => cloud.signIn(password, true), 'Incorrect password.')
          }}
          onCancel={() => setStartOver(false)}
        >
          It starts empty and uses the password you just entered. Devices that already sync stay on your current account.
        </ConfirmDialog>
      )}
      <Section>
        <Card>{form}</Card>
      </Section>
    </div>
  )
}

function Syncing() {
  const cloud = useCloud()
  const [error, setError] = useState<string | null>(null)
  const [stopping, setStopping] = useState<(typeof CATEGORIES)[number] | null>(null)
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null)
  const [changing, setChanging] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const attempt = async (task: () => Promise<unknown>) => {
    setError(null)
    try {
      await task()
    } catch (e) {
      setError(explain(e, "This device isn't signed in to sync anymore."))
    }
  }
  const setCategory = (c: Category, on: boolean) => attempt(() => cloud.setOff(on ? cloud.off.filter((x) => x !== c) : [...cloud.off, c]))
  const newCode = () => attempt(async () => setPairing(await cloud.pair()))

  const status = cloud.running ? 'Syncing…' : cloud.syncedAt ? `Synced ${timeAgo(cloud.syncedAt)}` : undefined

  return (
    <div className={columns}>
      {stopping && (
        <ConfirmDialog
          title={`Stop syncing ${stopping.label.toLowerCase()}?`}
          action="Stop syncing"
          onConfirm={() => {
            setCategory(stopping.id, false)
            setStopping(null)
          }}
          onCancel={() => setStopping(null)}
        >
          They’ll be removed from Platter’s server. Your devices keep their own copies.
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
          This deletes your sync account and everything on Platter’s server, and turns off sync on all your devices. Your devices keep their
          own copies.
        </ConfirmDialog>
      )}
      {pairing && (
        <Sheet
          title="Add a device"
          bodyClassName="p-4"
          width="md"
          onClose={() => setPairing(null)}
          footer={
            <Button variant="secondary" className="w-full" onClick={() => setPairing(null)}>
              Done
            </Button>
          }
        >
          <div className="space-y-6 py-2">
            <p className="text-sm text-stone-600 dark:text-stone-300">
              Enter this code on your other device, in Settings › Sync across devices.
            </p>
            <PairingCodeDisplay key={pairing.code} code={pairing.code} expiresAt={pairing.expiresAt} onRenew={newCode} />
          </div>
        </Sheet>
      )}
      {changing && <ChangePassword onClose={() => setChanging(false)} />}

      <div>
        <Section>
          <List>
            <li className="flex min-h-13 items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <span className="block">Sync this device</span>
                {status && <span className="block text-sm text-stone-500">{status}</span>}
              </div>
              <button
                type="button"
                aria-label="Sync now"
                title="Sync now"
                disabled={cloud.running}
                onClick={() => cloud.syncNow()}
                className="rounded-full p-2 text-stone-600 hover:bg-stone-100 disabled:opacity-40 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                <RefreshCw size={20} className={cloud.running ? 'animate-spin' : ''} />
              </button>
              <Switch label="Sync this device" checked onChange={() => attempt(cloud.leave)} />
            </li>
          </List>
          {(error ?? cloud.error) && <Notice tone="error">{error ?? cloud.error}</Notice>}
        </Section>
        <Section title="Sync account">
          <List>
            <Row icon={<MonitorSmartphone size={20} />} label="Add a device" onClick={newCode} />
            <Row icon={<KeyRound size={20} />} label="Change password" onClick={() => setChanging(true)} />
          </List>
          <List>
            <Row icon={<Trash2 size={20} />} label="Delete synced data" danger onClick={() => setDeleting(true)} />
          </List>
        </Section>
      </div>

      <Section title="Synced data">
        <List>
          {CATEGORIES.map((c) => (
            <Row
              key={c.id}
              icon={c.icon}
              label={c.label}
              trailing={
                <Switch
                  label={c.label}
                  checked={!cloud.off.includes(c.id)}
                  onChange={(on) => (on ? setCategory(c.id, true) : setStopping(c))}
                />
              }
            />
          ))}
        </List>
      </Section>
    </div>
  )
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const cloud = useCloud()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await cloud.changePassword(password)
      toast('Sync password changed', { tone: 'success' })
      onClose()
    } catch (e) {
      setError(explain(e, "This device isn't signed in to sync anymore."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title="Change password"
      bodyClassName="p-4"
      width="md"
      onClose={onClose}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !newPasswordReady(password, confirm)}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      }
    >
      <form
        className="space-y-4 py-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (newPasswordReady(password, confirm)) save()
        }}
      >
        <input value={cloud.username} readOnly autoComplete="username" className="hidden" aria-hidden />
        <NewPassword label="New password" value={password} onChange={setPassword} confirm={confirm} onConfirmChange={setConfirm} />
        {error && <Notice tone="error">{error}</Notice>}
      </form>
    </Sheet>
  )
}
