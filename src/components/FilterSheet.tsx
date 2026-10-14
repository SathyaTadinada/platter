import { Star, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FacetOption, Facets, Filters } from '../lib/library'
import { Button } from './ui'

type Props = { facets: Facets; filters: Filters; count: number; onChange: (f: Filters) => void; onClose: () => void }

const SHOW = 12 // options shown before "Show all"

export function FilterSheet({ facets, filters, count, onChange, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal()
  }, [])

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: filters[k] === v ? undefined : v })
  const setField = (id: number, v: string) => {
    const fields = { ...filters.fields }
    if (fields[id] === v) delete fields[id]
    else fields[id] = v
    onChange({ ...filters, fields })
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="filters-title"
      className="m-0 mt-auto max-h-[85dvh] w-full max-w-none flex-col open:flex rounded-t-3xl bg-white p-0 text-stone-900 sm:m-auto sm:max-w-lg sm:rounded-3xl dark:bg-stone-900 dark:text-stone-100"
    >
      <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3 dark:border-stone-800">
        <h2 id="filters-title" className="text-lg font-bold">
          Filters
        </h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="-mr-2 rounded-full p-2 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X size={20} />
        </button>
      </div>

      <div className="min-h-0 flex-auto space-y-6 overflow-y-auto px-5 py-4">
        <Group
          title="Crate"
          options={facets.folder}
          selected={filters.folder !== undefined ? String(filters.folder) : undefined}
          onPick={(v) => set('folder', Number(v))}
          hideSingle
        />
        <Group title="Format" options={facets.format} selected={filters.format} onPick={(v) => set('format', v)} hideSingle />
        <Group title="Format details" options={facets.tag} selected={filters.tag} onPick={(v) => set('tag', v)} />
        <Group title="Genre" options={facets.genre} selected={filters.genre} onPick={(v) => set('genre', v)} />
        <Group title="Style" options={facets.style} selected={filters.style} onPick={(v) => set('style', v)} />
        <Group
          title="Decade"
          options={facets.decade}
          selected={filters.decade !== undefined ? String(filters.decade) : undefined}
          onPick={(v) => set('decade', Number(v))}
        />
        <RatingPicker options={facets.rating} value={filters.rating} onPick={(n) => set('rating', n)} />
        {facets.fields.map(({ field, options }) => (
          <Group
            key={field.id}
            title={field.name}
            options={options}
            selected={filters.fields[field.id]}
            onPick={(v) => setField(field.id, v)}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-stone-200 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] dark:border-stone-800">
        <Button
          variant="secondary"
          onClick={() => {
            onChange({ fields: {} })
            onClose()
          }}
        >
          Clear all
        </Button>
        <Button onClick={onClose}>{count === 1 ? 'Show 1 record' : `Show ${count} records`}</Button>
      </div>
    </dialog>
  )
}

function Group({
  title,
  options,
  selected,
  onPick,
  hideSingle,
}: {
  title: string
  options: FacetOption[]
  selected?: string
  onPick: (v: string) => void
  hideSingle?: boolean // nothing to choose between
}) {
  const [all, setAll] = useState(false)
  if ((!options.length && !selected) || (hideSingle && options.length < 2 && !selected)) return null
  const shown = all ? options : options.slice(0, SHOW)
  // keep the selected option visible even when it's past the cut
  if (selected && !shown.some((o) => o.value === selected)) {
    shown.push(options.find((o) => o.value === selected) ?? { value: selected, label: selected, count: 0 })
  }
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-stone-500">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {shown.map((o) => {
          const on = o.value === selected
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(o.value)}
              disabled={!on && o.count === 0}
              className={`rounded-full px-3 py-1.5 text-sm transition disabled:opacity-40 ${
                on
                  ? 'bg-stone-900 text-white dark:bg-accent-500 dark:text-stone-950'
                  : 'bg-stone-100 text-stone-800 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700'
              }`}
            >
              {o.label} <span className={on ? 'opacity-70' : 'text-stone-500'}>{o.count}</span>
            </button>
          )
        })}
        {options.length > SHOW && (
          <button type="button" onClick={() => setAll(!all)} className="px-2 py-1.5 text-sm font-medium underline">
            {all ? 'Show fewer' : `Show all ${options.length}`}
          </button>
        )}
      </div>
    </section>
  )
}

// Five stars on one line: tap one for "this many and up", tap it again to clear
function RatingPicker({ options, value, onPick }: { options: FacetOption[]; value?: number; onPick: (n: number) => void }) {
  const [hover, setHover] = useState(0)
  if (!options.length && !value) return null
  const count = (n: number) => options.find((o) => o.value === String(n))?.count ?? 0
  const lit = hover || value || 0
  const note = lit ? `${lit}+ stars · ${count(lit)}` : 'Any'
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-stone-500">Rating</h3>
      <div className="flex items-center" onPointerLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? '' : 's'} and up`}
            aria-pressed={value === n}
            disabled={value !== n && !count(n)}
            onPointerEnter={() => setHover(n)}
            onClick={() => onPick(n)}
            className="p-1 transition-transform hover:scale-110 disabled:opacity-30"
          >
            <Star size={28} className={n <= lit ? 'fill-accent-500 text-accent-500' : 'text-stone-300 dark:text-stone-600'} aria-hidden />
          </button>
        ))}
        <span className="ml-3 text-sm text-stone-500 tabular-nums">{note}</span>
      </div>
    </section>
  )
}
