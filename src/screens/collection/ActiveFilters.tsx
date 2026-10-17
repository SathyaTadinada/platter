import { X } from 'lucide-react'
import { facets as buildFacets, type Filters } from '../../lib/library'

// Chips for active filters, each removable
export function ActiveFilters({
  filters,
  facets,
  onChange,
}: {
  filters: Filters
  facets: ReturnType<typeof buildFacets> | null
  onChange: (f: Filters) => void
}) {
  const chips: { key: string; label: string; clear: () => void }[] = []
  const folderName = facets?.folder.find((o) => o.value === String(filters.folder))?.label
  if (filters.folder !== undefined)
    chips.push({ key: 'folder', label: folderName ?? 'Crate', clear: () => onChange({ ...filters, folder: undefined }) })
  for (const k of ['format', 'tag', 'genre', 'style'] as const) {
    const v = filters[k]
    if (v) chips.push({ key: k, label: v, clear: () => onChange({ ...filters, [k]: undefined }) })
  }
  if (filters.decade !== undefined)
    chips.push({
      key: 'decade',
      label: filters.decade ? `${filters.decade}s` : 'Year unknown',
      clear: () => onChange({ ...filters, decade: undefined }),
    })
  if (filters.rating)
    chips.push({ key: 'rating', label: `${'★'.repeat(filters.rating)}+`, clear: () => onChange({ ...filters, rating: undefined }) })
  for (const [id, v] of Object.entries(filters.fields)) {
    chips.push({
      key: `f${id}`,
      label: v,
      clear: () => {
        const fields = { ...filters.fields }
        delete fields[Number(id)]
        onChange({ ...filters, fields })
      },
    })
  }
  if (!chips.length) return null
  return (
    // one line that scrolls sideways, since it sits in the header and shouldn't make it taller
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.clear}
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-stone-900 py-1 pr-2 pl-3 text-sm text-white dark:bg-accent dark:text-accent-fg"
          aria-label={`Remove filter ${c.label}`}
        >
          {c.label}
          <X size={14} aria-hidden />
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange({ fields: {} })}
        className="shrink-0 px-2 text-sm whitespace-nowrap text-stone-500 underline"
      >
        Clear all
      </button>
    </div>
  )
}
