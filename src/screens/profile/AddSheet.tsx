import { useState } from 'react'
import { useLocation } from 'wouter'
import { Sheet } from '../../components/Sheet'
import { Button } from '../../components/ui'
import type { ProfileItem } from '../../lib/profile'
import { enqueueFromProfile } from '../../lib/queue'

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

// Records picked from someone's profile, on their way to Batch. Asks only when some are already in
// the collection, with the same choice an import gives, minus adding details: a profile has none.
export function AddSheet({
  picked,
  owned,
  waiting,
  from,
  onAdded,
  onClose,
}: {
  picked: ProfileItem[]
  owned: number
  waiting: number
  from: string
  onAdded: () => void // just before Batch opens
  onClose: () => void
}) {
  const [, navigate] = useLocation()
  const [copies, setCopies] = useState(false)
  const [busy, setBusy] = useState(false)
  const count = picked.length - waiting - (copies ? 0 : owned)

  async function add() {
    setBusy(true)
    await enqueueFromProfile(picked, from, { copies })
    onAdded()
    navigate('/batch')
  }

  return (
    <Sheet
      title="Add to my collection"
      bodyClassName="p-4"
      width="md"
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={add} disabled={busy || count === 0}>
          {count === 0 ? 'Nothing new to add' : `Add ${plural(count, 'record')} to the batch`}
        </Button>
      }
    >
      <div className="space-y-4 py-2">
        {waiting > 0 && <p className="text-sm text-stone-500">{plural(waiting, 'record')} already in the batch</p>}
        {owned > 0 && (
          <fieldset className="rounded-2xl bg-white p-4 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800">
            <legend className="sr-only">Records you already have</legend>
            <p className="mb-2 text-sm font-medium">You already have {plural(owned, 'record')}</p>
            {(
              [
                [false, 'Skip them'],
                [true, 'Add another copy of each'],
              ] as const
            ).map(([value, label]) => (
              <label key={label} className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
                <input type="radio" name="owned" checked={copies === value} onChange={() => setCopies(value)} className="size-4" />
                <span className="flex-1">{label}</span>
              </label>
            ))}
          </fieldset>
        )}
      </div>
    </Sheet>
  )
}
