import { ArrowDownUp, ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-react'
import { DESCENDING, type SortKey } from '../lib/library'
import { Menu } from './Menu'

type Sort = { key: SortKey; label: string; order: [string, string] }

// What to sort by, and a separate button that turns it around in one tap
export function SortPill({
  sorts,
  sort,
  reversed,
  onChange,
}: {
  sorts: Sort[]
  sort: SortKey
  reversed: boolean
  onChange: (sort: SortKey, reversed: boolean) => void
}) {
  const sorting = sorts.find((s) => s.key === sort) ?? sorts[0]
  return (
    <div className="flex min-w-0 items-center rounded-full bg-stone-200 dark:bg-stone-800">
      <Menu
        label="Sort by"
        align="left"
        className="min-w-0"
        buttonClassName="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-l-full py-1 pr-2.5 pl-3 text-sm font-medium hover:bg-stone-300 dark:hover:bg-stone-700"
        button={
          <>
            <ArrowDownUp size={16} className="shrink-0" aria-hidden />
            <span className="truncate whitespace-nowrap">{sorting.label}</span>
          </>
        }
        // picking the current sort again turns it around too
        items={sorts.map((s) => ({
          label: s.label,
          checked: s.key === sort,
          checkedMark: (
            <span className="flex items-center gap-1.5 text-xs text-stone-500">
              {s.order[reversed ? 1 : 0]}
              <SortArrow sort={s.key} reversed={reversed} size={16} className="text-accent" />
            </span>
          ),
          onSelect: () => onChange(s.key, s.key === sort ? !reversed : false),
        }))}
      />
      <button
        type="button"
        onClick={() => onChange(sort, !reversed)}
        aria-label={`${sorting.order[reversed ? 1 : 0]}. Reverse order`}
        title={sorting.order[reversed ? 1 : 0]}
        className="inline-flex min-h-9 items-center rounded-r-full border-l border-stone-300 pr-3 pl-2.5 hover:bg-stone-300 dark:border-stone-700 dark:hover:bg-stone-700"
      >
        <SortArrow sort={sort} reversed={reversed} size={16} />
      </button>
    </div>
  )
}

// Which way a sort runs: high to low, or low to high (A to Z)
function SortArrow({
  sort,
  reversed,
  size,
  className = 'shrink-0',
}: {
  sort: SortKey
  reversed: boolean
  size: number
  className?: string
}) {
  const Icon = DESCENDING[sort] !== reversed ? ArrowDownWideNarrow : ArrowUpNarrowWide
  return <Icon size={size} className={className} aria-hidden />
}
