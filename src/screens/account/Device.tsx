import { LogOut, Monitor, Pencil, Smartphone, Tablet } from 'lucide-react'
import { useState } from 'react'
import { Button, IconButton } from '../../components/ui'
import type { DeviceInfo } from '../../lib/cloud'
import { timeAgo } from '../../lib/time'

const ICONS = { phone: Smartphone, tablet: Tablet, computer: Monitor }

// One device: its name, when it was last used, and buttons to rename it or sign it out. Renaming
// happens in the row, as it does for crates.
export function Device({
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
