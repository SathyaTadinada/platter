import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Button, Card, Notice, Screen, Section } from '../components/ui'
import { useCloud } from '../hooks/cloud'
import { timeAgo } from '../lib/time'

export function CloudSync() {
  const cloud = useCloud()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle(on: boolean) {
    setBusy(true)
    setError(null)
    try {
      await (on ? cloud.turnOn() : cloud.turnOff())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function forget() {
    try {
      await cloud.forget()
      setConfirming(false)
    } catch (e) {
      setConfirming(false)
      setError((e as Error).message)
    }
  }

  const status = cloud.running ? 'Syncing…' : cloud.syncedAt ? `Synced ${timeAgo(cloud.syncedAt)}` : undefined

  return (
    <Screen title="Sync across devices" back="/settings">
      {confirming && (
        <ConfirmDialog title="Delete synced data?" action="Delete" onConfirm={forget} onCancel={() => setConfirming(false)}>
          Platter's copy is deleted and sync turns off on every device. Each device keeps what it already has.
        </ConfirmDialog>
      )}
      <Section>
        <Card className="space-y-4">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block">Sync across devices</span>
              {cloud.enabled && status && <span className="block text-sm text-stone-500">{status}</span>}
            </span>
            <input
              type="checkbox"
              checked={cloud.enabled}
              disabled={busy || !cloud.available}
              onChange={(e) => toggle(e.target.checked)}
              className="size-5"
            />
          </label>
          <p className="text-sm text-stone-500">
            Plays, value history, cover picks, your batch, and settings are kept on Platter's server and follow your Discogs account to any
            device you sign in on.
          </p>
          {(error ?? cloud.error) && <Notice tone="error">{error ?? cloud.error}</Notice>}
          {cloud.enabled && (
            <Button variant="destructive" className="w-full" onClick={() => setConfirming(true)}>
              Delete synced data
            </Button>
          )}
        </Card>
      </Section>
    </Screen>
  )
}
