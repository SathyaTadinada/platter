import { useState } from 'react'
import type { CollectionField, Folder } from '../../api/discogs/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { CrateSelect } from '../../components/CrateSelect'
import { Button, buttonClass } from '../../components/ui'
import type { FieldMatch } from '../../lib/fields'
import { setTask } from '../../lib/task'
import { BulkEditSheet } from './BulkEditSheet'

// Pinned to the bottom while records are selected
export function BulkBar({
  count,
  folders,
  onRun,
  onEdit,
  onExport,
  fields,
  matches,
  currency,
}: {
  count: number
  folders: Folder[]
  onExport: () => void
  onRun: (kind: 'remove' | 'move', folderId?: number, onProgress?: (d: number, t: number) => void) => Promise<void>
  onEdit: (changes: Record<number, string>, onProgress: (d: number, t: number) => void) => Promise<void>
  fields: CollectionField[]
  matches: FieldMatch[] | null
  currency: string
}) {
  const [confirm, setConfirm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [running, setRunning] = useState(false)
  const records = `${count} record${count === 1 ? '' : 's'}`
  const compact = 'px-3 sm:min-h-10 sm:px-3.5 sm:text-sm'

  // progress goes to the status pill at the bottom; the bar steps aside meanwhile
  async function track(verb: string, job: (onProgress: (d: number, t: number) => void) => Promise<void>) {
    setConfirm(false)
    setEditing(false)
    setRunning(true)
    setTask(`${verb}…`)
    try {
      await job((d, t) => d < t && setTask(`${verb} ${d + 1} of ${t}`))
    } finally {
      setTask(null)
      setRunning(false)
    }
  }
  const run = (kind: 'remove' | 'move', folderId?: number) =>
    track(kind === 'remove' ? 'Removing' : 'Moving', (p) => onRun(kind, folderId, p))

  if (running) return null

  return (
    <div className="sticky bottom-3 z-10 mt-4">
      {confirm && (
        <ConfirmDialog title={`Remove ${records}?`} action="Remove" onConfirm={() => run('remove')} onCancel={() => setConfirm(false)}>
          This removes {count === 1 ? 'it' : 'them'} from your Discogs collection, including {count === 1 ? 'its' : 'their'} notes and other
          details.
        </ConfirmDialog>
      )}
      {editing && (
        <BulkEditSheet
          count={count}
          fields={fields}
          matches={matches}
          currency={currency}
          onApply={(changes) => track('Updating', (p) => onEdit(changes, p))}
          onClose={() => setEditing(false)}
        />
      )}
      {/* full width on phones; on bigger screens just as wide as its buttons */}
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-3 shadow-xl ring-1 ring-stone-200 sm:w-fit sm:p-2 dark:bg-stone-900 dark:ring-stone-700">
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1 sm:flex-none">
            <span className={buttonClass('secondary', `w-full whitespace-nowrap ${compact}`)}>
              {/* four buttons only fit on a phone with the short label */}
              <span className="sm:hidden">Move…</span>
              <span className="hidden sm:inline">Move to crate…</span>
            </span>
            <CrateSelect
              ariaLabel="Move to crate"
              value={undefined}
              placeholder="Move to crate…"
              folders={folders}
              onChange={(id) => run('move', id)}
              className="absolute inset-0 opacity-0"
            />
          </label>
          <Button variant="secondary" onClick={() => setEditing(true)} className={compact}>
            Edit
          </Button>
          <Button variant="secondary" onClick={onExport} className={compact}>
            Export
          </Button>
          <Button variant="danger" onClick={() => setConfirm(true)} className={compact}>
            Remove
          </Button>
        </div>
      </div>
    </div>
  )
}
