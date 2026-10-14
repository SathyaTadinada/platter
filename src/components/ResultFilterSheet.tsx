import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { FacetOption } from '../lib/library'
import type { ResultFacetKey, ResultFilters } from '../lib/results'
import { Group } from './FilterSheet'
import { Button } from './ui'

const GROUPS: [ResultFacetKey, string][] = [
  ['format', 'Format'],
  ['tag', 'Format details'],
  ['genre', 'Genre'],
  ['decade', 'Decade'],
  ['country', 'Country'],
]

// Same look as the collection's filters, for narrowing down search results
export function ResultFilterSheet({
  facets,
  filters,
  count,
  onChange,
  onClose,
}: {
  facets: Record<ResultFacetKey, FacetOption[]>
  filters: ResultFilters
  count: number
  onChange: (f: ResultFilters) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal()
  }, [])
  const pick = (k: ResultFacetKey, v: string) => onChange({ ...filters, [k]: filters[k] === v ? undefined : v })

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="result-filters-title"
      className="m-0 mt-auto max-h-[85dvh] w-full max-w-none flex-col open:flex rounded-t-3xl bg-white p-0 text-stone-900 sm:m-auto sm:max-w-lg sm:rounded-3xl dark:bg-stone-900 dark:text-stone-100"
    >
      <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3 dark:border-stone-800">
        <h2 id="result-filters-title" className="text-lg font-bold">
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
        {GROUPS.map(([k, title]) => (
          <Group key={k} title={title} options={facets[k]} selected={filters[k]} onPick={(v) => pick(k, v)} hideSingle={k !== 'tag'} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-stone-200 px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] dark:border-stone-800">
        <Button
          variant="secondary"
          onClick={() => {
            onChange({})
            onClose()
          }}
        >
          Clear all
        </Button>
        <Button onClick={onClose}>{count === 1 ? 'Show 1 result' : `Show ${count} results`}</Button>
      </div>
    </dialog>
  )
}
