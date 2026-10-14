import { useId } from 'react'
import type { CollectionField } from '../api/discogs/types'
import { useFieldSuggestions } from '../hooks/useFields'
import { fieldFor, type FieldKey, type FieldMatch } from '../lib/fields'
import type { Metadata } from '../lib/metadata'

type Part = 'conditions' | 'price' | 'date' | 'store' | 'location' | 'notes'

const input = 'min-h-11 w-full rounded-xl border border-stone-300 bg-transparent px-3 text-base dark:border-stone-700'
const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time

function currencySymbol(currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency
  } catch {
    return currency
  }
}

type Props = {
  value: Metadata
  onChange: (m: Metadata) => void
  matches: FieldMatch[] | null
  currency: string
  parts?: Part[]
}

// Condition, purchase details, location and notes. Fields the user hasn't set
// up on Discogs either fall back to Notes (marked) or aren't shown.
export function MetadataForm({ value, onChange, matches, currency, parts = ['conditions', 'price', 'date', 'store', 'location', 'notes'] }: Props) {
  const id = useId()
  const [stores, locations] = useFieldSuggestions(matches, ['purchasedFrom', 'location'])
  const field = (k: FieldKey) => (matches ? fieldFor(matches, k) : null)
  const notes = field('notes')
  const set = (k: keyof Metadata, v: string) => onChange({ ...value, [k]: v })

  // when none of the purchase fields exist, say so once under them instead of on each label
  const purchaseKeys: FieldKey[] = ['purchasePrice', 'purchaseDate', 'purchasedFrom']
  const shownPurchase = purchaseKeys.filter((k) => parts.includes(k === 'purchasePrice' ? 'price' : k === 'purchaseDate' ? 'date' : 'store'))
  const allPurchaseMissing = matches !== null && shownPurchase.length > 1 && shownPurchase.every((k) => !field(k))

  // a missing field still works if Notes exists; say so quietly
  const hint = (k: FieldKey) => {
    if (field(k) || (allPurchaseMissing && purchaseKeys.includes(k))) return null
    return <span className="font-normal text-stone-400"> · {notes ? 'in Notes' : 'not saved'}</span>
  }

  const label = (text: string, k?: FieldKey) => (
    <span className="mb-1 block text-sm font-medium">
      {text}
      {k && hint(k)}
    </span>
  )

  const conditionInput = (k: 'mediaCondition' | 'sleeveCondition', f: CollectionField | null) => {
    if (!f) return null
    return (
      <label className="block min-w-0">
        {label(k === 'mediaCondition' ? 'Media' : 'Sleeve')}
        {f.type === 'dropdown' ? (
          <select value={value[k] ?? ''} onChange={(e) => set(k, e.target.value)} className={input}>
            <option value="">Not graded</option>
            {f.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input value={value[k] ?? ''} onChange={(e) => set(k, e.target.value)} className={input} />
        )}
      </label>
    )
  }

  const loc = field('location')

  return (
    <div className="space-y-3">
      {parts.includes('conditions') && (field('mediaCondition') || field('sleeveCondition')) && (
        <div className="grid grid-cols-2 gap-2">
          {conditionInput('mediaCondition', field('mediaCondition'))}
          {conditionInput('sleeveCondition', field('sleeveCondition'))}
        </div>
      )}

      {(parts.includes('price') || parts.includes('date')) && (
        <div className={parts.includes('price') && parts.includes('date') ? 'grid grid-cols-2 gap-2' : ''}>
          {parts.includes('price') && (
            <label className="block min-w-0">
              {label('Price', 'purchasePrice')}
              <span className="relative block">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-500">{currencySymbol(currency)}</span>
                <input
                  value={value.price ?? ''}
                  onChange={(e) => set('price', e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className={`${input} pl-8`}
                />
              </span>
            </label>
          )}
          {parts.includes('date') && (
            <label className="block min-w-0">
              <span className="mb-1 flex items-baseline justify-between gap-2 text-sm font-medium">
                <span className="truncate">
                  Date{hint('purchaseDate')}
                </span>
                {value.date !== today() && (
                  <button type="button" onClick={() => set('date', today())} className="text-xs font-medium text-stone-500 underline">
                    Today
                  </button>
                )}
              </span>
              {/* iOS gives date inputs a fixed minimum width; let it shrink */}
              <input
                type="date"
                value={value.date ?? ''}
                onChange={(e) => set('date', e.target.value)}
                className={`${input} min-w-0 appearance-none [&::-webkit-date-and-time-value]:text-left`}
              />
            </label>
          )}
        </div>
      )}

      {parts.includes('store') && (
        <label className="block">
          {label('Bought from', 'purchasedFrom')}
          <input value={value.store ?? ''} onChange={(e) => set('store', e.target.value)} list={`${id}-stores`} autoComplete="off" placeholder="Store or seller" className={input} />
          <datalist id={`${id}-stores`}>
            {stores.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      )}

      {allPurchaseMissing && <p className="-mt-1 text-xs text-stone-400">{notes ? 'Saved in Notes' : 'Not saved: no purchase fields or Notes on Discogs'}</p>}

      {parts.includes('location') && (
        <label className="block">
          {label('Location', 'location')}
          {loc?.type === 'dropdown' ? (
            <select value={value.location ?? ''} onChange={(e) => set('location', e.target.value)} className={input}>
              <option value="">None</option>
              {loc.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input value={value.location ?? ''} onChange={(e) => set('location', e.target.value)} list={`${id}-locations`} autoComplete="off" placeholder="Shelf, crate, room" className={input} />
              <datalist id={`${id}-locations`}>
                {locations.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </>
          )}
        </label>
      )}

      {parts.includes('notes') && notes && (
        <label className="block">
          {label('Notes')}
          <textarea value={value.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={2} className={`${input} py-2`} />
        </label>
      )}
    </div>
  )
}
