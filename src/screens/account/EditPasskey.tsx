import { useState } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { fieldClass } from '../../components/PasswordField'
import { Sheet } from '../../components/Sheet'
import { Button } from '../../components/ui'
import { useCloud } from '../../hooks/cloud'
import type { PasskeyInfo } from '../../lib/cloud'

export function EditPasskey({
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
