import {
  Fingerprint,
  Headphones,
  Image,
  KeyRound,
  Layers,
  MonitorSmartphone,
  Plus,
  Radio,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Category } from '../../worker/categories'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PairingCodeDisplay } from '../components/PairingCode'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toaster'
import { Button, Card, List, Notice, Row, Screen, Section, Switch } from '../components/ui'
import { useCloud } from '../hooks/cloud'
import { addPasskey, passkeysHere, type AccountInfo, type DeviceInfo, type PasskeyInfo } from '../lib/cloud'
import { timeAgo } from '../lib/time'
import { ChangePassword } from './account/ChangePassword'
import { Device } from './account/Device'
import { EditPasskey } from './account/EditPasskey'
import { GetIn } from './account/GetIn'
import { created, explain } from './account/shared'
import { ProfileActions, ProfileArea } from './account/ProfileArea'

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
    <Screen title="Platter account" back="/settings" width="wide" actions={<ProfileActions />}>
      {!cloud.available ? null : cloud.enabled ? <SignedIn /> : <GetIn />}
    </Screen>
  )
}

// two columns on wide screens, like Settings
const columns = 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8'

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
  const [offer, setOffer] = useState(() => created.now && passkeysHere())
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
      created.now = false
      setOffer(false)
      await addPasskey(cloud.api!)
      await reload()
      toast('Passkey added', { tone: 'success' })
    })

  const status = cloud.running ? 'Syncing…' : cloud.syncedAt ? `Synced ${timeAgo(cloud.syncedAt)}` : undefined
  const canAddPasskey = passkeysHere()

  return (
    <>
      <ProfileArea onError={(e) => setError(explain(e, "This device isn't signed in anymore."))} />
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
            This deletes your account and everything on Platter’s server, and turns off sync on all your devices. Your devices keep their
            own copies.
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
                        created.now = false
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
    </>
  )
}
