import { Check, Minus, Plus } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { CollectionField, Folder } from '../api/discogs/types'
import type { LibraryItem } from '../db/db'
import { useFieldSuggestions } from '../hooks/useFields'
import type { FieldKey, FieldMatch } from '../lib/fields'
import { formatPrice } from '../lib/metadata'
import { CrateSelect } from './CrateSelect'
import { DateInput } from './DateInput'

type Kind = 'select' | 'price' | 'date' | 'count' | 'notes' | 'text'

export function kindOf(field: CollectionField, key: FieldKey | undefined): Kind {
  if (field.type === 'dropdown') return 'select'
  if (key === 'purchasePrice') return 'price'
  if (key === 'purchaseDate' || key === 'lastPlayed') return 'date'
  if (key === 'playCount') return 'count'
  if (key === 'notes' || (field.lines ?? 1) > 1) return 'notes'
  return 'text'
}

// Inputs that look like plain values until hovered or focused
export const inline =
  'min-h-10 w-full min-w-0 rounded-lg bg-transparent px-2 text-right font-medium placeholder:font-normal placeholder:text-stone-500 hover:bg-stone-100 focus:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-accent-500/60 dark:hover:bg-stone-800 dark:focus:bg-stone-800'

export function Row({ label, saved, children, stacked }: { label: string; saved?: boolean; children: ReactNode; stacked?: boolean }) {
  return (
    <li className={stacked ? 'px-4 py-3' : 'flex min-h-14 items-center gap-3 px-4 py-1.5'}>
      <span className={`flex shrink-0 items-center gap-1.5 text-sm text-stone-500 ${stacked ? 'mb-1' : 'max-w-[45%]'}`}>
        {label}
        {saved && <Check size={14} className="text-emerald-600" aria-label="Saved" />}
      </span>
      {/* every control gets the same width so the column lines up */}
      <div className={stacked ? '' : 'ml-auto w-full max-w-[15rem] min-w-0'}>{children}</div>
    </li>
  )
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

// The copy's own details, edited in place: crate, date added and every custom field
export function CopyDetails({ item, folders, fields, matches, currency, onMove, onSetField }: Props) {
  const added = new Date(item.dateAdded)
  const keyOf = (f: CollectionField) => matches?.find((m) => m.field?.id === f.id)?.spec.key
  const [stores, locations] = useFieldSuggestions(matches, ['purchasedFrom', 'location'])

  return (
    <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
      <Row label="Crate">
        <CrateSelect
          value={item.folderId}
          folders={folders}
          onChange={onMove}
          className={`${inline} cursor-pointer appearance-none [text-align-last:right]`}
        />
      </Row>
      <Row label="Added">
        <span className="block px-2 text-right font-medium">
          {Number.isNaN(added.getTime()) ? '' : added.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
        </span>
      </Row>
      {fields.map((f) => {
        const key = keyOf(f)
        return (
          <Field
            key={f.id}
            field={f}
            kind={kindOf(f, key)}
            value={item.fields[f.id] ?? ''}
            currency={currency}
            suggestions={key === 'purchasedFrom' ? stores : key === 'location' ? locations : []}
            onSave={(v) => onSetField(f, v)}
          />
        )
      })}
    </ul>
  )
}

export function Field({
  field,
  kind,
  value,
  currency,
  suggestions,
  onSave,
  quiet,
}: {
  field: CollectionField
  kind: Kind
  value: string
  currency: string
  suggestions: string[]
  onSave: (v: string) => Promise<void> | void
  quiet?: boolean // no "saved" tick, for forms that save later
}) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  const [saved, setSaved] = useState(false)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => setDraft(value), [value])
  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 1500)
    return () => clearTimeout(t)
  }, [saved])

  // notes grow with their content
  useEffect(() => {
    const el = notesRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  async function commit(v: string) {
    if (v === value) return
    setDraft(v)
    await onSave(v)
    if (!quiet) setSaved(true)
  }

  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      setDraft(value)
      e.currentTarget.blur()
    }
  }

  switch (kind) {
    case 'select':
      return (
        <Row label={field.name} saved={saved}>
          <select
            aria-label={field.name}
            value={value}
            onChange={(e) => commit(e.target.value)}
            className={`${inline} cursor-pointer appearance-none [text-align-last:right]`}
          >
            <option value="">Not set</option>
            {field.type === 'dropdown' &&
              field.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
          </select>
        </Row>
      )

    case 'count': {
      const n = Number.parseInt(value, 10) || 0
      return (
        <Row label={field.name} saved={saved}>
          <span className="flex items-center justify-end gap-1">
            <button
              type="button"
              aria-label="One fewer"
              disabled={n === 0}
              onClick={() => commit(String(n - 1))}
              className="rounded-full p-1.5 hover:bg-stone-100 disabled:opacity-30 dark:hover:bg-stone-800"
            >
              <Minus size={16} />
            </button>
            <span className="min-w-8 text-center font-medium tabular-nums">{n}</span>
            <button
              type="button"
              aria-label="One more"
              onClick={() => commit(String(n + 1))}
              className="rounded-full p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <Plus size={16} />
            </button>
          </span>
        </Row>
      )
    }

    case 'date':
      return (
        <Row label={field.name} saved={saved}>
          <DateInput value={draft} onChange={(v) => commit(v)} label={field.name} />
        </Row>
      )

    case 'notes':
      return (
        <Row label={field.name} saved={saved} stacked>
          <textarea
            ref={notesRef}
            aria-label={field.name}
            value={draft}
            rows={3}
            placeholder="Add notes"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(draft.trim())}
            className={`${inline} resize-none py-2 !text-left`}
          />
        </Row>
      )

    default:
      return (
        <Row label={field.name} saved={saved}>
          <input
            aria-label={field.name}
            value={draft}
            inputMode={kind === 'price' ? 'decimal' : undefined}
            placeholder="Add"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(kind === 'price' ? (formatPrice(draft, currency) ?? '') : draft.trim())}
            onKeyDown={blurOnEnter}
            list={suggestions.length ? `${id}-s` : undefined}
            autoComplete="off"
            className={inline}
          />
          {suggestions.length > 0 && (
            <datalist id={`${id}-s`}>
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </Row>
      )
  }
}
