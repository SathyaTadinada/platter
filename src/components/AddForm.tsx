import { useEffect, useRef, useState } from 'react'
import { addToFolder, editInstance, getFolders, setFieldValue } from '../api/discogs/endpoints'
import type { Folder, Release } from '../api/discogs/types'
import { db, getSetting, setSetting } from '../db/db'
import { useCollectionMeta } from '../hooks/useCollectionMeta'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { useFieldMatches, useFieldSuggestions } from '../hooks/useFields'
import type { FieldKey } from '../lib/fields'
import { itemFromRelease } from '../lib/library'
import { copyable, type CopyDetails } from '../lib/profile'
import { Field, inline, kindOf, Row } from './CopyDetails'
import { CrateSelect } from './CrateSelect'
import { useProfile } from './Profile'
import { Stars } from './Stars'
import { Button, List, Notice, ToggleChip } from './ui'

export type Added = { folder: string; instanceId: number; problems: string[] }

// play fields start empty; they're filled in by logging plays
// plays come from logging them, and a record being added isn't lent out yet
const SKIP: FieldKey[] = ['playCount', 'lastPlayed', 'lentTo']
// a stack bought together usually shares store, date, and shelf
const CARRY: FieldKey[] = ['purchasedFrom', 'purchaseDate', 'location']
const RECENT = 'recentFields'
const RECENT_FOR = 12 * 60 * 60 * 1000

export function pickDefaultFolder(folders: Folder[], last?: number): number | undefined {
  if (last && folders.some((f) => f.id === last)) return last
  return (folders.find((f) => f.name === 'Uncategorized') ?? folders[0])?.id
}

// The same rows as "Your copy" on a record page, filled in before adding
// their: someone's copy of this release, from their profile, whose details can fill in the form
export function AddForm({
  release,
  onAdded,
  their,
}: {
  release: Release
  onAdded: (a: Added) => void
  their?: { owner: string; copy: CopyDetails }
}) {
  const { client, username } = useSignedIn()
  const meta = useCollectionMeta()
  const matches = useFieldMatches()
  const currency = useProfile()?.curr_abbr ?? 'USD'
  const [stores, locations] = useFieldSuggestions(matches, ['purchasedFrom', 'location'])
  const [folderId, setFolderId] = useState<number>()
  const [values, setValuesState] = useState<Record<number, string>>({})
  // tapping Add blurs the field being typed in, and that blur saves it; the ref
  // has the new value before React re-renders
  const latest = useRef(values)
  const setValues = (update: (old: Record<number, string>) => Record<number, string>) => {
    latest.current = update(latest.current)
    setValuesState(latest.current)
  }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const keyOf = (id: number) => matches?.find((m) => m.field?.id === id)?.spec.key

  // what of theirs can go into this form, and which of it is picked. None to start with.
  const options = their && meta.data && matches ? copyable(their.copy, meta.data.fields, matches) : []
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [rating, setRating] = useState(0)
  function pick(keys: string[], on: boolean) {
    const next = new Set(picked)
    for (const o of options.filter((o) => keys.includes(o.key))) {
      if (on) next.add(o.key)
      else next.delete(o.key)
      if (o.to === 'rating') setRating(on ? their!.copy.rating! : 0)
      // taking one back out only clears what it put in, not something typed over it since
      else
        setValues((old) => {
          const id = o.to as number
          if (on) return { ...old, [id]: o.value }
          if (old[id] !== o.value) return old
          const { [id]: _, ...rest } = old
          return rest
        })
    }
    setPicked(next)
  }
  const all = options.length > 1 && options.every((o) => picked.has(o.key))
  const fields = (meta.data?.fields ?? []).filter((f) => !SKIP.includes(keyOf(f.id)!))

  useEffect(() => {
    getSetting<{ values: Record<number, string>; at: number }>(RECENT).then((r) => {
      if (r && Date.now() - r.at < RECENT_FOR) setValues((v) => ({ ...r.values, ...v }))
    })
  }, [])

  const folders = useAsync(async () => {
    const r = await getFolders(client, username)
    const list = r.folders.filter((f) => f.id !== 0) // "All" can't be added to
    setFolderId((f) => f ?? pickDefaultFolder(list, undefined))
    getSetting<number>('lastFolderId').then((last) => setFolderId((f) => pickDefaultFolder(list, last) ?? f))
    return list
  }, [client, username])

  async function add() {
    if (!folderId) return
    setBusy(true)
    setError(null)
    try {
      const { instance_id } = await addToFolder(client, username, folderId, release.id)
      const target = { folderId, releaseId: release.id, instanceId: instance_id }
      // details are best effort: the record is in the collection either way
      const saved: Record<number, string> = {}
      const problems: string[] = []
      for (const [id, value] of Object.entries(latest.current)) {
        if (!value.trim()) continue
        try {
          await setFieldValue(client, username, target, Number(id), value)
          saved[Number(id)] = value
        } catch (e) {
          problems.push((e as Error).message)
        }
      }
      let rated = 0
      if (rating) {
        try {
          await editInstance(client, username, target, { rating })
          rated = rating
        } catch (e) {
          problems.push((e as Error).message)
        }
      }
      await db.collection.put({ ...itemFromRelease(release, instance_id, folderId), fields: saved, rating: rated })
      await setSetting('lastFolderId', folderId)
      const carried = Object.fromEntries(Object.entries(saved).filter(([id]) => CARRY.includes(keyOf(Number(id))!)))
      if (Object.keys(carried).length) await setSetting(RECENT, { values: carried, at: Date.now() })
      onAdded({ folder: folders.data?.find((f) => f.id === folderId)?.name ?? 'your collection', instanceId: instance_id, problems })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <List>
        {/* what can come over from their copy, at the top of the form it fills in */}
        {options.length > 0 && (
          <li className="px-4 py-3">
            <div className="mb-2 flex items-baseline justify-between gap-4">
              <span className="text-sm text-stone-500">From {their!.owner}’s copy</span>
              {/* picking them all is a shortcut, not one more thing to fill in, so it isn't a chip */}
              {options.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    pick(
                      options.map((o) => o.key),
                      !all,
                    )
                  }
                  className="shrink-0 text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100"
                >
                  {all ? 'Select none' : 'Select all'}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {options.map((o) => {
                const on = picked.has(o.key)
                return (
                  <ToggleChip key={o.key} size="sm" on={on} onClick={() => pick([o.key], !on)}>
                    {o.label}
                  </ToggleChip>
                )
              })}
            </div>
          </li>
        )}
        <Row label="Crate">
          <CrateSelect
            value={folderId}
            folders={folders.data ?? []}
            onChange={setFolderId}
            onCreated={folders.reload}
            disabled={!folders.data}
            className={`${inline} cursor-pointer appearance-none [text-align-last:right]`}
          />
        </Row>
        {rating > 0 && (
          <Row label="Rating">
            <Stars value={rating} onChange={setRating} size={20} />
          </Row>
        )}
        {fields.map((f) => {
          const key = keyOf(f.id)
          return (
            <Field
              key={f.id}
              field={f}
              kind={kindOf(f, key)}
              value={values[f.id] ?? ''}
              currency={currency}
              suggestions={key === 'purchasedFrom' ? stores : key === 'location' ? locations : []}
              onSave={(v) => setValues((old) => ({ ...old, [f.id]: v }))}
              quiet
            />
          )
        })}
      </List>
      {(error || folders.error) && <Notice tone="error">{error ?? folders.error?.message}</Notice>}
      <Button className="w-full" onClick={add} disabled={busy || !folderId}>
        {busy ? 'Adding…' : 'Add to collection'}
      </Button>
    </div>
  )
}
