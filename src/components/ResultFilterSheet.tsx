import type { FacetOption } from '../lib/library'
import type { ResultFacetKey, ResultFilters } from '../lib/results'
import { Group } from './FilterSheet'
import { Sheet } from './Sheet'
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
  const pick = (k: ResultFacetKey, v: string) => onChange({ ...filters, [k]: filters[k] === v ? undefined : v })

  return (
    <Sheet
      title="Filters"
      onClose={onClose}
      bodyClassName="space-y-6 px-5 py-4"
      footer={
        <div className="grid grid-cols-2 gap-2">
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
      }
    >
      {GROUPS.map(([k, title]) => (
        <Group key={k} title={title} options={facets[k]} selected={filters[k]} onPick={(v) => pick(k, v)} hideSingle={k !== 'tag'} />
      ))}
    </Sheet>
  )
}
