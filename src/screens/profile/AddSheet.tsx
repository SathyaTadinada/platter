import { useState } from 'react'
import { useLocation } from 'wouter'
import { Sheet } from '../../components/Sheet'
import { Button, ToggleChip } from '../../components/ui'
import { useCollectionMeta } from '../../hooks/useCollectionMeta'
import { useFieldMatches } from '../../hooks/useFields'
import { copyable, type ProfileItem } from '../../lib/profile'
import { enqueueFromProfile } from '../../lib/queue'

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
// Records picked from someone's profile, on their way to Batch: which of their details come too, when
// they show some, and what to do about ones already in the collection, as an import asks.
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

  // what of theirs can come over, matched to this account's fields, record by record; the chips are
  // every kind there is across them. None picked to start with.
  const meta = useCollectionMeta()
  const matches = useFieldMatches()
  const each = new Map(picked.map((p) => [p.id, meta.data && matches ? copyable(p.copy, meta.data.fields, matches) : []]))
  const kinds = [...new Map([...each.values()].flat().map((o) => [o.key, o.label])).entries()]
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const all = kinds.length > 1 && kinds.every(([k]) => chosen.has(k))
  const toggle = (keys: string[], on: boolean) =>
    setChosen((old) => {
      const next = new Set(old)
      for (const k of keys) {
        if (on) next.add(k)
        else next.delete(k)
      }
      return next
    })
  const details = (id: number) => {
    const fields: Record<number, string> = {}
    let rating: number | undefined
    for (const o of each.get(id) ?? []) {
      if (!chosen.has(o.key)) continue
      if (o.to === 'rating')
        rating = o.value.length // shown as that many stars
      else fields[o.to] = o.value
    }
    return { fields, rating }
  }

  async function add() {
    setBusy(true)
    await enqueueFromProfile(picked, from, { copies, details: chosen.size ? details : undefined })
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
        {kinds.length > 0 && (
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-4">
              <p className="text-sm font-medium">Bring over from {from}’s copies</p>
              {kinds.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    toggle(
                      kinds.map(([k]) => k),
                      !all,
                    )
                  }
                  className="shrink-0 text-sm text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"
                >
                  {all ? 'Select none' : 'Select all'}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {kinds.map(([k, label]) => {
                const on = chosen.has(k)
                return (
                  <ToggleChip key={k} size="sm" on={on} onClick={() => toggle([k], !on)}>
                    {label}
                  </ToggleChip>
                )
              })}
            </div>
          </div>
        )}
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
