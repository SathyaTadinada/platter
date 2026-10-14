import { Check, ChevronRight, Minus, Plus } from 'lucide-react'
import { useEffect, useId, useState, type ReactNode } from 'react'
import type { CollectionField, Folder } from '../api/discogs/types'
import type { LibraryItem } from '../db/db'
import { useFieldSuggestions } from '../hooks/useFields'
import type { FieldKey, FieldMatch } from '../lib/fields'
import { formatPrice } from '../lib/metadata'
import { CrateSelect } from './CrateSelect'
import { Button } from './ui'

type Kind = 'select' | 'price' | 'date' | 'count' | 'notes' | 'text'

function kindOf(field: CollectionField, key: FieldKey | undefined): Kind {
  if (field.type === 'dropdown') return 'select'
  if (key === 'purchasePrice') return 'price'
  if (key === 'purchaseDate' || key === 'lastPlayed') return 'date'
  if (key === 'playCount') return 'count'
  if (key === 'notes' || (field.lines ?? 1) > 1) return 'notes'
  return 'text'
}

const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/

function showDate(v: string) {
  const m = v.match(isoDate)
  if (!m) return v
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const rowClass = 'flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2.5 text-left'
const editable = 'hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-stone-800/50 dark:active:bg-stone-800'

function Label({ children }: { children: ReactNode }) {
  return <span className="shrink-0 text-sm text-stone-500">{children}</span>
}

function Value({ value, display }: { value: string; display?: string }) {
  return value ? (
    <span className="flex min-w-0 items-center gap-1.5 font-medium">
      <span className="truncate">{display ?? value}</span>
      <ChevronRight size={16} className="shrink-0 text-stone-400" aria-hidden />
    </span>
  ) : (
    <span className="flex items-center gap-1 text-sm font-medium text-accent-700 dark:text-accent-400">
      <Plus size={16} aria-hidden /> Add
    </span>
  )
}

function Saved({ show }: { show: boolean }) {
  return show ? <Check size={16} className="shrink-0 text-emerald-600" aria-label="Saved" /> : null
}

type Props = {
  item: LibraryItem
  folders: Folder[]
  fields: CollectionField[]
  matches: FieldMatch[] | null
  currency: string
  onMove: (folderId: number) => void
  onSetField: (field: CollectionField, value: string) => Promise<void>
}

// The copy's own details: crate, date added and every custom field, each with
// an editor that suits it
export function CopyDetails({ item, folders, fields, matches, currency, onMove, onSetField }: Props) {
  const added = new Date(item.dateAdded)
  const keyOf = (f: CollectionField) => matches?.find((m) => m.field?.id === f.id)?.spec.key
  const [stores, locations] = useFieldSuggestions(matches, ['purchasedFrom', 'location'])
  const crate = folders.find((f) => f.id === item.folderId)?.name ?? 'Crate'

  return (
    <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
      <li className={`relative ${rowClass} ${editable}`}>
        <Label>Crate</Label>
        <Value value={crate} />
        <CrateSelect value={item.folderId} folders={folders} onChange={onMove} className="absolute inset-0 cursor-pointer opacity-0" />
      </li>
      <li className={rowClass}>
        <Label>Added</Label>
        <span className="font-medium">{Number.isNaN(added.getTime()) ? '' : added.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
      </li>
      {fields.map((f) => {
        const key = keyOf(f)
        const suggestions = key === 'purchasedFrom' ? stores : key === 'location' ? locations : []
        return (
          <FieldRow
            key={f.id}
            field={f}
            kind={kindOf(f, key)}
            value={item.fields[f.id] ?? ''}
            currency={currency}
            suggestions={suggestions}
            onSave={(v) => onSetField(f, v)}
          />
        )
      })}
    </ul>
  )
}

function FieldRow({
  field,
  kind,
  value,
  currency,
  suggestions,
  onSave,
}: {
  field: CollectionField
  kind: Kind
  value: string
  currency: string
  suggestions: string[]
  onSave: (v: string) => Promise<void>
}) {
  const id = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saved, setSaved] = useState(false)
  useEffect(() => setDraft(value), [value])
  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 1500)
    return () => clearTimeout(t)
  }, [saved])

  async function commit(v: string) {
    setEditing(false)
    if (v === value) return
    await onSave(v)
    setSaved(true)
  }

  if (kind === 'select' && field.type === 'dropdown') {
    return (
      <li className={`relative ${rowClass} ${editable}`}>
        <Label>{field.name}</Label>
        <span className="flex min-w-0 items-center gap-1.5">
          <Saved show={saved} />
          <Value value={value} />
        </span>
        <select aria-label={field.name} value={value} onChange={(e) => commit(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
          <option value="">Not set</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </li>
    )
  }

  if (kind === 'count') {
    const n = Number.parseInt(value, 10) || 0
    return (
      <li className={rowClass}>
        <Label>{field.name}</Label>
        <span className="flex items-center gap-1">
          <Saved show={saved} />
          <button type="button" aria-label="One fewer" disabled={n === 0} onClick={() => commit(String(n - 1))} className="rounded-full p-1.5 hover:bg-stone-100 disabled:opacity-30 dark:hover:bg-stone-800">
            <Minus size={16} />
          </button>
          <span className="min-w-8 text-center font-medium tabular-nums">{n}</span>
          <button type="button" aria-label="One more" onClick={() => commit(String(n + 1))} className="rounded-full p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800">
            <Plus size={16} />
          </button>
        </span>
      </li>
    )
  }

  const display = kind === 'date' ? showDate(value) : value

  if (!editing) {
    // notes read better stacked under their label
    if (kind === 'notes' && value) {
      return (
        <li>
          <button type="button" onClick={() => setEditing(true)} className={`block w-full px-4 py-3 text-left ${editable}`}>
            <span className="flex items-center justify-between">
              <Label>{field.name}</Label>
              <Saved show={saved} />
            </span>
            <span className="mt-1 block font-medium whitespace-pre-line">{value}</span>
          </button>
        </li>
      )
    }
    return (
      <li>
        <button type="button" onClick={() => setEditing(true)} className={`${rowClass} ${editable}`}>
          <Label>{field.name}</Label>
          <span className="flex min-w-0 items-center gap-1.5">
            <Saved show={saved} />
            <Value value={value} display={display} />
          </span>
        </button>
      </li>
    )
  }

  const input = 'min-h-11 w-full rounded-xl border border-stone-300 bg-transparent px-3 text-base dark:border-stone-700'
  const toSave = () => (kind === 'price' ? (formatPrice(draft, currency) ?? '') : draft.trim())

  return (
    <li className="space-y-2 px-4 py-3">
      <Label>{field.name}</Label>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          commit(toSave())
        }}
        onKeyDown={(e) => e.key === 'Escape' && (setDraft(value), setEditing(false))}
        className="space-y-2"
      >
        {kind === 'notes' ? (
          <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} className={`${input} py-2`} />
        ) : kind === 'date' ? (
          <input
            autoFocus
            type="date"
            value={isoDate.test(draft) ? draft : ''}
            onChange={(e) => setDraft(e.target.value)}
            className={`${input} min-w-0 appearance-none [&::-webkit-date-and-time-value]:text-left`}
          />
        ) : kind === 'price' ? (
          <input autoFocus inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="0.00" className={input} />
        ) : (
          <>
            <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} list={`${id}-s`} autoComplete="off" className={input} />
            <datalist id={`${id}-s`}>
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </>
        )}
        <div className="flex justify-end gap-2">
          {value && (
            <Button variant="ghost" className="mr-auto min-h-10 text-red-600! dark:text-red-400!" onClick={() => commit('')}>
              Clear
            </Button>
          )}
          <Button
            variant="secondary"
            className="min-h-10"
            onClick={() => {
              setDraft(value)
              setEditing(false)
            }}
          >
            Cancel
          </Button>
          <Button type="submit" className="min-h-10">
            Save
          </Button>
        </div>
      </form>
    </li>
  )
}
