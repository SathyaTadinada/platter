import {
  Fingerprint,
  Headphones,
  Heart,
  Image,
  KeyRound,
  Layers,
  LibraryBig,
  Link as LinkIcon,
  LogOut,
  Monitor,
  MonitorSmartphone,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  SlidersHorizontal,
  Smartphone,
  Tablet,
  Trash2,
  UserRound,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Category } from '../../worker/categories'
import type { Section as ProfileSection } from '../../worker/profile'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PairingCodeDisplay, PairingCodeInput } from '../components/PairingCode'
import { fieldClass, NewPassword, newPasswordReady, PasswordInput } from '../components/PasswordField'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toaster'
import { Button, Card, IconButton, List, Notice, Row, Screen, Section, Segmented, Switch } from '../components/ui'
import { useCloud } from '../hooks/cloud'
import { addPasskey, CloudError, passkeysHere, type AccountInfo, type DeviceInfo, type PasskeyInfo, type WaysIn } from '../lib/cloud'
import { timeAgo } from '../lib/time'

// What a profile can show. Stats and Your year come with their summaries, later in this phase.
const PROFILE_SECTIONS: { id: ProfileSection; label: string; icon: ReactNode }[] = [
  { id: 'collection', label: 'Collection', icon: <LibraryBig size={20} /> },
  { id: 'wantlist', label: 'Wantlist', icon: <Heart size={20} /> },
]

// Album years, record lengths, and the barcode index ('catalog') aren't listed: they're public catalog
// data that only makes a new device quicker to set up, so they always sync
const CATEGORIES: { id: Category; label: string; icon: ReactNode }[] = [
  { id: 'plays', label: 'Plays', icon: <Headphones size={20} /> },
  { id: 'value', label: 'Value history', icon: <TrendingUp size={20} /> },
  { id: 'covers', label: 'Cover picks', icon: <Image size={20} /> },
  { id: 'batch', label: 'Batch', icon: <Layers size={20} /> },
  { id: 'settings', label: 'Settings and appearance', icon: <SlidersHorizontal size={20} /> },
  { id: 'listenbrainz', label: 'ListenBrainz connection', icon: <Radio size={20} /> },
]

export function Account() {
  const cloud = useCloud()
  return (
    <Screen title="Platter account" back="/settings" width="wide">
      {!cloud.available ? null : cloud.enabled ? <SignedIn /> : <GetIn />}
    </Screen>
  )
}

// two columns on wide screens, like Settings
const columns = 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8'

const CANT_CHECK = 'Can’t check with Discogs right now. Try again in a minute.'

function explain(e: unknown, wrong: string): string | null {
  // the passkey prompt was closed
  if (e instanceof Error && e.name === 'NotAllowedError') return null
  if (e instanceof CloudError) {
    if (e.status === 401) return wrong
    if (e.status === 403) return e.message
    if (e.status === 429) return 'Too many tries. Wait a minute and try again.'
    if (e.status === 503) return CANT_CHECK
    if (e.status === 0) return e.message
  }
  return 'Something went wrong. Try again in a minute.'
}

// Set when this browser just made the account, so a passkey can be offered once
let justCreated = false

// Not in yet: make the account, or get into the one this Discogs user has
function GetIn() {
  const cloud = useCloud()
  const [ways, setWays] = useState<(WaysIn & { legacy: boolean }) | null>(null)
  const [mode, setMode] = useState<'main' | 'password' | 'code'>('main')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wrong, setWrong] = useState(false)
  const [codeKey, setCodeKey] = useState(0)

  useEffect(() => {
    cloud.waysIn().then(setWays, () => setWays({ exists: false, password: false, passkeys: false, legacy: false }))
    // once per visit (waysIn is a new function on every render)
  }, [cloud.username])

  async function go(task: () => Promise<unknown>, wrongText: string) {
    setBusy(true)
    setError(null)
    setWrong(false)
    try {
      await task()
    } catch (e) {
      setError(explain(e, wrongText))
      setWrong(e instanceof CloudError && e.status === 401)
      if (mode === 'code') setCodeKey((k) => k + 1) // clear the boxes for another try
    } finally {
      setBusy(false)
    }
  }

  const switchTo = (m: typeof mode) => {
    setMode(m)
    setError(null)
    setWrong(false)
  }

  const username = (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium" htmlFor="account-username">
        Discogs username
      </label>
      <input id="account-username" name="username" value={cloud.username} readOnly autoComplete="username" className={fieldClass} />
    </div>
  )
  const errorNotice = error && <Notice tone="error">{error}</Notice>

  let body: ReactNode
  if (!ways) {
    body = <p className="py-6 text-center text-sm text-stone-500">Checking…</p>
  } else if (!ways.exists) {
    body = (
      <div className="space-y-4">
        <div>
          <h2 className="font-semibold">Create a Platter account</h2>
          <p className="mt-1 text-sm text-stone-500">Keeps your plays, value history, and settings the same on all your devices.</p>
        </div>
        {username}
        {errorNotice}
        <Button
          className="w-full"
          disabled={busy}
          onClick={() =>
            go(async () => {
              justCreated = await cloud.signInWithDiscogs(true)
            }, 'Discogs didn’t accept your login. Log out and back in, then try again.')
          }
        >
          {busy ? 'Checking with Discogs…' : 'Create account'}
        </Button>
      </div>
    )
  } else if (mode === 'code') {
    body = (
      <div className="space-y-5">
        <div>
          <h2 className="font-semibold">Enter the code from your other device</h2>
          <p className="mt-1 text-sm text-stone-500">Get one from a device that’s signed in, under Add a device.</p>
        </div>
        <PairingCodeInput
          key={codeKey}
          disabled={busy}
          onComplete={(code) => go(() => cloud.join(code), 'That code is wrong or has expired.')}
        />
        {busy && <p className="text-center text-sm text-stone-500">Checking…</p>}
        {errorNotice}
        <Button variant="secondary" className="w-full" onClick={() => switchTo(ways.legacy ? 'password' : 'main')}>
          {ways.legacy ? 'Use your password instead' : 'Other ways in'}
        </Button>
      </div>
    )
  } else if (mode === 'password' || ways.legacy) {
    body = (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!password) return
          // the form is swapped out once signed in, and a field removed while focused never blurs, which
          // leaves password managers' field icons floating where it was
          ;(document.activeElement as HTMLElement | null)?.blur()
          go(() => cloud.signIn(password), 'Incorrect password.')
        }}
      >
        <h2 className="font-semibold">Sign in to your Platter account</h2>
        {username}
        <PasswordInput label="Password" value={password} onChange={setPassword} autoComplete="current-password" invalid={wrong} />
        {errorNotice}
        <Button type="submit" className="w-full" disabled={busy || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => switchTo(ways.legacy ? 'code' : 'main')}>
          {ways.legacy ? 'Use a code instead' : 'Other ways in'}
        </Button>
      </form>
    )
  } else {
    body = (
      <div className="space-y-4">
        <h2 className="font-semibold">Sign in to your Platter account</h2>
        {username}
        {errorNotice}
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => go(() => cloud.signInWithDiscogs(false), 'Discogs didn’t accept your login.')}
        >
          {busy ? 'Checking with Discogs…' : 'Sign in'}
        </Button>
        <div className="space-y-2">
          {ways.passkeys && passkeysHere() && (
            <Button
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => go(cloud.signInWithPasskey, 'That passkey didn’t work.')}
            >
              Use a passkey
            </Button>
          )}
          {ways.password && (
            <Button variant="secondary" className="w-full" disabled={busy} onClick={() => switchTo('password')}>
              Use your password
            </Button>
          )}
          <Button variant="secondary" className="w-full" disabled={busy} onClick={() => switchTo('code')}>
            Use a code from another device
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg">
      <Section>
        <Card>{body}</Card>
      </Section>
    </div>
  )
}

// The account's own details, loaded from the server and loaded again after each change
function useAccountData() {
  const { api } = useCloud()
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null)
  const [passkeys, setPasskeys] = useState<PasskeyInfo[] | null>(null)
  const reload = useCallback(async () => {
    if (!api) return
    const [a, d, p] = await Promise.all([api.account(), api.devices(), api.passkeys()])
    setAccount(a)
    setDevices(d.devices)
    setPasskeys(p.passkeys)
  }, [api])
  useEffect(() => {
    reload().catch(() => {})
  }, [reload])
  return { account, devices, passkeys, reload }
}

function SignedIn() {
  const cloud = useCloud()
  const { account, devices, passkeys, reload } = useAccountData()
  const [error, setError] = useState<string | null>(null)
  const [stopping, setStopping] = useState<(typeof CATEGORIES)[number] | null>(null)
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null)
  const [changing, setChanging] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [signingOut, setSigningOut] = useState<DeviceInfo | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [editing, setEditing] = useState<PasskeyInfo | null>(null)
  const [offer, setOffer] = useState(() => justCreated && passkeysHere())
  const anyShared = Object.values(cloud.sections ?? {}).some((v) => v === 'public')

  const attempt = async (task: () => Promise<unknown>) => {
    setError(null)
    try {
      await task()
    } catch (e) {
      setError(explain(e, "This device isn't signed in anymore."))
    }
  }
  const setCategory = (c: Category, on: boolean) =>
    attempt(() => cloud.setOff((on ? cloud.off.filter((x) => x !== c) : [...cloud.off, c]).filter((x) => x !== 'catalog')))
  const newCode = () => attempt(async () => setPairing(await cloud.pair()))
  const newPasskey = () =>
    attempt(async () => {
      justCreated = false
      setOffer(false)
      await addPasskey(cloud.api!)
      await reload()
      toast('Passkey added', { tone: 'success' })
    })

  const status = cloud.running ? 'Syncing…' : cloud.syncedAt ? `Synced ${timeAgo(cloud.syncedAt)}` : undefined
  const canAddPasskey = passkeysHere()

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
          title="Delete your Platter account?"
          action="Delete"
          onConfirm={() => {
            setDeleting(false)
            attempt(cloud.forget)
          }}
          onCancel={() => setDeleting(false)}
        >
          This deletes your account and everything on Platter’s server, and turns off sync on all your devices. Your devices keep their own
          copies.
        </ConfirmDialog>
      )}
      {signingOut && (
        <ConfirmDialog
          title={`Sign out ${signingOut.name ?? 'that device'}?`}
          action="Sign out"
          onConfirm={() => {
            const id = signingOut.id
            setSigningOut(null)
            attempt(async () => {
              await cloud.api!.removeDevice(id)
              await reload()
            })
          }}
          onCancel={() => setSigningOut(null)}
        >
          It won’t sync until it’s signed in again.
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
              Enter this code on your other device, in Settings › Platter account.
            </p>
            <PairingCodeDisplay key={pairing.code} code={pairing.code} expiresAt={pairing.expiresAt} onRenew={newCode} />
          </div>
        </Sheet>
      )}
      {changing && <ChangePassword first={account?.password === false} onClose={() => setChanging(false)} onSaved={reload} />}
      {editing && (
        <EditPasskey
          passkey={editing}
          onClose={() => setEditing(null)}
          onChange={async (task) => {
            setEditing(null)
            await attempt(async () => {
              await task()
              await reload()
            })
          }}
        />
      )}

      <div>
        {offer && (
          <Section>
            <Card>
              <div className="space-y-3">
                <p>Add a passkey as a way in when Discogs can’t be reached.</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      justCreated = false
                      setOffer(false)
                    }}
                  >
                    Not now
                  </Button>
                  <Button onClick={newPasskey}>Add a passkey</Button>
                </div>
              </div>
            </Card>
          </Section>
        )}
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
        <Section title="Sign-in">
          <List>
            <Row icon={<MonitorSmartphone size={20} />} label="Add a device" onClick={newCode} />
            <Row
              icon={<KeyRound size={20} />}
              label={account?.password === false ? 'Set a password' : 'Change password'}
              onClick={() => setChanging(true)}
            />
          </List>
          {(canAddPasskey || !!passkeys?.length) && (
            <List>
              {passkeys?.map((p) => (
                <Row
                  key={p.id}
                  icon={<Fingerprint size={20} />}
                  label={p.name}
                  detail={p.lastUsedAt ? `Last used ${timeAgo(p.lastUsedAt)}` : `Added ${timeAgo(p.createdAt)}`}
                  onClick={() => setEditing(p)}
                />
              ))}
              {canAddPasskey && <Row icon={<Plus size={20} />} label="Add a passkey" onClick={newPasskey} />}
            </List>
          )}
        </Section>
        {/* drawn once its settings have come back, so it never shows Public or off by mistake */}
        {cloud.sections && (
          <Section title="Profile">
            {cloud.hidden && <Notice tone="warn">Your profile has been taken down.</Notice>}
            <Segmented
              label="Who your profile is for"
              value={cloud.who}
              onChange={(w) => attempt(() => cloud.setWho(w))}
              options={[
                { value: 'private', label: 'Private' },
                { value: 'unlisted', label: 'Link only' },
                { value: 'public', label: 'Public' },
              ]}
            />
            <List>
              {PROFILE_SECTIONS.map((p) => (
                <Row
                  key={p.id}
                  icon={p.icon}
                  label={p.label}
                  trailing={
                    <Switch
                      label={p.label}
                      checked={cloud.sections?.[p.id] === 'public'}
                      onChange={(on) => attempt(() => cloud.setSections({ [p.id]: on ? 'public' : 'off' }))}
                    />
                  }
                />
              ))}
            </List>
            {/* a private profile's link goes nowhere, so there's nothing to view or copy */}
            {anyShared && cloud.who !== 'private' && !cloud.hidden && (
              <List>
                <Row icon={<UserRound size={20} />} label="View your profile" href={`/u/${cloud.username}`} />
                <Row
                  icon={<LinkIcon size={20} />}
                  label="Copy link"
                  onClick={async () => {
                    await navigator.clipboard.writeText(`${location.origin}/u/${cloud.username}`)
                    toast('Link copied', { tone: 'success' })
                  }}
                />
              </List>
            )}
          </Section>
        )}
        {account?.admin && (
          <Section>
            <List>
              <Row icon={<Users size={20} />} label="Members" href="/admin" />
            </List>
          </Section>
        )}
        <Section>
          <List>
            <Row icon={<Trash2 size={20} />} label="Delete account" danger onClick={() => setDeleting(true)} />
          </List>
        </Section>
      </div>

      <div>
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
        {devices && (
          <Section title="Devices">
            <List>
              {devices.map((d) => (
                <Device
                  key={d.id}
                  device={d}
                  editing={renaming === d.id}
                  onEdit={() => setRenaming(d.id)}
                  onDone={() => setRenaming(null)}
                  onRename={(name) =>
                    attempt(async () => {
                      await cloud.api!.renameDevice(d.id, name)
                      await reload()
                    })
                  }
                  onSignOut={() => setSigningOut(d)}
                />
              ))}
            </List>
          </Section>
        )}
      </div>
    </div>
  )
}

const ICONS = { phone: Smartphone, tablet: Tablet, computer: Monitor }

// One device: its name, when it was last used, and buttons to rename it or sign it out. Renaming
// happens in the row, as it does for crates.
function Device({
  device,
  editing,
  onEdit,
  onDone,
  onRename,
  onSignOut,
}: {
  device: DeviceInfo
  editing: boolean
  onEdit: () => void
  onDone: () => void
  onRename: (name: string) => void
  onSignOut: () => void
}) {
  const [name, setName] = useState(device.name ?? '')
  const shown = device.name ?? 'Unknown device'
  const Icon = ICONS[device.kind ?? 'computer']

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 px-4 py-2">
        <form
          className="flex w-full flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) {
              onRename(name.trim())
              onDone()
            }
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Device name"
            maxLength={60}
            autoFocus
            className="min-h-10 w-full min-w-0 rounded-lg border border-stone-300 bg-transparent px-3 sm:w-auto sm:flex-1 dark:border-stone-700"
          />
          <Button type="submit" className="min-h-10 flex-1 sm:flex-none">
            Save
          </Button>
          <Button variant="ghost" className="min-h-10 flex-1 sm:flex-none" onClick={onDone}>
            Cancel
          </Button>
        </form>
      </li>
    )
  }
  return (
    <li className="flex min-h-13 items-center gap-3 py-2 pr-2 pl-4">
      <Icon size={20} className="shrink-0 text-stone-500" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate">{shown}</p>
        <p className="truncate text-sm text-stone-500">
          {device.current ? 'This device' : `Last used ${timeAgo(device.lastSeenAt ?? device.createdAt)}`}
        </p>
      </div>
      <IconButton
        label={`Rename ${shown}`}
        onClick={() => {
          setName(device.name ?? '')
          onEdit()
        }}
      >
        <Pencil size={18} />
      </IconButton>
      {!device.current && (
        <IconButton label={`Sign out ${shown}`} danger onClick={onSignOut}>
          <LogOut size={18} />
        </IconButton>
      )}
    </li>
  )
}

function EditPasskey({
  passkey,
  onClose,
  onChange,
}: {
  passkey: PasskeyInfo
  onClose: () => void
  onChange: (task: () => Promise<unknown>) => void
}) {
  const { api } = useCloud()
  const [name, setName] = useState(passkey.name)
  const [removing, setRemoving] = useState(false)
  const save = () => onChange(() => api!.renamePasskey(passkey.id, name))

  if (removing) {
    return (
      <ConfirmDialog
        title={`Remove ${passkey.name}?`}
        action="Remove"
        onConfirm={() => onChange(() => api!.removePasskey(passkey.id))}
        onCancel={() => setRemoving(false)}
      >
        It won’t sign in to your Platter account anymore.
      </ConfirmDialog>
    )
  }
  return (
    <Sheet
      title="Passkey"
      bodyClassName="p-4"
      width="md"
      onClose={onClose}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="destructive" onClick={() => setRemoving(true)}>
            Remove
          </Button>
          <Button onClick={save} disabled={!name.trim() || name.trim() === passkey.name}>
            Save
          </Button>
        </div>
      }
    >
      <form
        className="space-y-1.5 py-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) save()
        }}
      >
        <label className="block text-sm font-medium" htmlFor="passkey-name">
          Name
        </label>
        <input id="passkey-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={fieldClass} />
      </form>
    </Sheet>
  )
}

function ChangePassword({ first, onClose, onSaved }: { first: boolean; onClose: () => void; onSaved: () => void }) {
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
      toast(first ? 'Password set' : 'Password changed', { tone: 'success' })
      onSaved()
      onClose()
    } catch (e) {
      setError(explain(e, "This device isn't signed in anymore."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title={first ? 'Set a password' : 'Change password'}
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
        <NewPassword
          label={first ? 'Password' : 'New password'}
          value={password}
          onChange={setPassword}
          confirm={confirm}
          onConfirmChange={setConfirm}
        />
        {error && <Notice tone="error">{error}</Notice>}
      </form>
    </Sheet>
  )
}
