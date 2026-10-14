import { useId } from 'react'
import type { CollectionField } from '../api/discogs/types'
import { useFieldSuggestions } from '../hooks/useFields'
import { inline, Row } from './CopyDetails'
import { DateInput } from './DateInput'
import { fieldFor, type FieldKey, type FieldMatch } from '../lib/fields'
import type { Metadata } from '../lib/metadata'

type Part = 'conditions' | 'price' | 'date' | 'store' | 'location' | 'notes'

const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time

type Props = {
  value: Metadata
  onChange: (m: Metadata) => void
  matches: FieldMatch[] | null
  parts?: Part[]
}

// Condition, purchase details, location, and notes. Fields the user hasn't set
// up on Discogs either fall back to Notes (marked) or aren't shown.
export function MetadataForm({ value, onChange, matches, parts = ['conditions', 'price', 'date', 'store', 'location', 'notes'] }: Props) {
  const id = useId()
  const [stores, locations] = useFieldSuggestions(matches, ['purchasedFrom', 'location'])
  const field = (k: FieldKey) => (matches ? fieldFor(matches, k) : null)
  const notes = field('notes')
  const set = (k: keyof Metadata, v: string) => onChange({ ...value, [k]: v })

  // when none of the purchase fields exist, say so once under them instead of on each label
  const purchaseKeys: FieldKey[] = ['purchasePrice', 'purchaseDate', 'purchasedFrom']
  const shownPurchase = purchaseKeys.filter((k) =>
    parts.includes(k === 'purchasePrice' ? 'price' : k === 'purchaseDate' ? 'date' : 'store'),
  )
  const allPurchaseMissing = matches !== null && shownPurchase.length > 1 && shownPurchase.every((k) => !field(k))

  // a missing field still works if Notes exists; say so quietly in its label
  const hintText = (k: FieldKey) => (field(k) || (allPurchaseMissing && purchaseKeys.includes(k)) ? '' : notes ? 'in Notes' : 'not saved')
  const label = (text: string, k?: FieldKey) => (k && hintText(k) ? `${text} · ${hintText(k)}` : text)

  const select = (value: string, onPick: (v: string) => void, options: string[], none: string, name: string) => (
    <select
      aria-label={name}
      value={value}
      onChange={(e) => onPick(e.target.value)}
      className={`${inline} cursor-pointer appearance-none [text-align-last:right]`}
    >
      <option value="">{none}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )

  const condition = (k: 'mediaCondition' | 'sleeveCondition', f: CollectionField | null) => {
    if (!f) return null
    const name = k === 'mediaCondition' ? 'Media Condition' : 'Sleeve Condition'
    return (
      <Row label={name}>
        {f.type === 'dropdown' ? (
          select(value[k] ?? '', (v) => set(k, v), f.options, 'Not graded', name)
        ) : (
          <input aria-label={name} value={value[k] ?? ''} onChange={(e) => set(k, e.target.value)} placeholder="Add" className={inline} />
        )}
      </Row>
    )
  }

  const loc = field('location')
  const shown = (part: Part) => parts.includes(part)

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
        {shown('conditions') && condition('mediaCondition', field('mediaCondition'))}
        {shown('conditions') && condition('sleeveCondition', field('sleeveCondition'))}
        {shown('price') && (
          <Row label={label('Purchase Price', 'purchasePrice')}>
            <input
              aria-label="Purchase price"
              value={value.price ?? ''}
              onChange={(e) => set('price', e.target.value)}
              inputMode="decimal"
              placeholder="Add"
              className={inline}
            />
          </Row>
        )}
        {shown('date') && (
          <Row label={label('Purchase Date', 'purchaseDate')}>
            <DateInput
              value={value.date ?? ''}
              onChange={(v) => set('date', v)}
              label="Purchase date"
              extra={
                <button
                  type="button"
                  onClick={() => set('date', today())}
                  className="rounded-lg px-2 py-2 text-sm font-medium hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  Today
                </button>
              }
            />
          </Row>
        )}
        {shown('store') && (
          <Row label={label('Purchased From', 'purchasedFrom')}>
            <input
              aria-label="Purchased from"
              value={value.store ?? ''}
              onChange={(e) => set('store', e.target.value)}
              list={`${id}-stores`}
              autoComplete="off"
              placeholder="Add"
              className={inline}
            />
            <datalist id={`${id}-stores`}>
              {stores.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Row>
        )}
        {shown('location') && (
          <Row label={label('Location', 'location')}>
            {loc?.type === 'dropdown' ? (
              select(value.location ?? '', (v) => set('location', v), loc.options, 'None', 'Location')
            ) : (
              <>
                <input
                  aria-label="Location"
                  value={value.location ?? ''}
                  onChange={(e) => set('location', e.target.value)}
                  list={`${id}-locations`}
                  autoComplete="off"
                  placeholder="Add"
                  className={inline}
                />
                <datalist id={`${id}-locations`}>
                  {locations.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </>
            )}
          </Row>
        )}
        {shown('notes') && notes && (
          <Row label="Notes" stacked>
            <textarea
              aria-label="Notes"
              value={value.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              placeholder="Add notes"
              className={`${inline} !text-left`}
            />
          </Row>
        )}
      </ul>
      {allPurchaseMissing && (
        <p className="px-1 text-xs text-stone-500">
          {notes ? 'Purchase details are saved in Notes' : "You don't have purchase fields or Notes on Discogs, so these won't be saved"}
        </p>
      )}
    </div>
  )
}
