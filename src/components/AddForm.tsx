import { useEffect, useRef, useState } from 'react'
import { addToFolder, getFolders, setFieldValue } from '../api/discogs/endpoints'
import type { Folder, Release } from '../api/discogs/types'
import { db, getSetting, setSetting } from '../db/db'
import { useCollectionMeta } from '../hooks/useCollectionMeta'
import { useSignedIn } from '../hooks/session'
import { useAsync } from '../hooks/useAsync'
import { useFieldMatches, useFieldSuggestions } from '../hooks/useFields'
import type { FieldKey } from '../lib/fields'
import { itemFromRelease } from '../lib/library'
import { Field, inline, kindOf, Row } from './CopyDetails'
import { CrateSelect } from './CrateSelect'
import { useProfile } from './Profile'
import { Button, List, Notice } from './ui'

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
export function AddForm({ release, onAdded }: { release: Release; onAdded: (a: Added) => void }) {
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
      await db.collection.put({ ...itemFromRelease(release, instance_id, folderId), fields: saved })
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
