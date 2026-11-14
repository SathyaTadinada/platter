import { useState } from 'react'
import { NewPassword, newPasswordReady } from '../../components/PasswordField'
import { Sheet } from '../../components/Sheet'
import { toast } from '../../components/Toaster'
import { Button, Notice } from '../../components/ui'
import { useCloud } from '../../hooks/cloud'
import { explain } from './shared'

export function ChangePassword({ first, onClose, onSaved }: { first: boolean; onClose: () => void; onSaved: () => void }) {
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
