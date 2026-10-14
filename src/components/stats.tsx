import type { ReactNode } from 'react'
import { Link } from 'wouter'
import type { LibraryItem } from '../db/db'
import type { MonthTotal } from '../lib/value'
import { Cover } from '../screens/Collection'

// Bits shared by the Value and Listening views

export const statCard = 'rounded-2xl bg-white ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800'
export const pct = (n: number, of: number) => `${of > 0 ? Math.max(2, (n / of) * 100) : 0}%`

export function Toggle<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="mb-4 inline-flex gap-1 rounded-lg bg-stone-100 p-0.5 dark:bg-stone-800">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
            value === v ? 'bg-white shadow-sm dark:bg-stone-950' : 'text-stone-600 dark:text-stone-400'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// A record with cover, title and artist; opens the record unless onClick is given
export function RecordRow({
  item,
  detail,
  onClick,
  children,
}: {
  item: LibraryItem
  detail?: string
  onClick?: () => void
  children?: ReactNode
}) {
  const className = 'flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-stone-50 dark:hover:bg-stone-800/50'
  const inner = (
    <>
      <Cover item={item} small className="size-11 shrink-0 rounded-md" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        <span className="block truncate text-xs text-stone-500">{detail ?? item.artist}</span>
      </span>
      {children && <span className="shrink-0 text-right">{children}</span>}
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  ) : (
    <Link href={`/collection/${item.instanceId}`} className={className}>
      {inner}
    </Link>
  )
}

export function MonthBars({ months, text }: { months: MonthTotal[]; text: (n: number) => string }) {
  const most = Math.max(...months.map((m) => m.total))
  return (
    <>
      <div className="flex h-28 items-end gap-1">
        {months.map((m) => (
          <div key={m.month} className="group flex h-full flex-1 flex-col justify-end" title={`${m.label}: ${text(m.total)}`}>
            <span
              className="w-full rounded-t-md bg-accent-500/80 group-hover:bg-accent-500"
              style={{ height: m.total ? pct(m.total, most) : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 border-t border-stone-200 pt-1 dark:border-stone-800">
        {months.map((m, i) => (
          <span key={m.month} className="flex-1 text-center text-[0.625rem] text-stone-500">
            {i % 2 === 1 ? m.label : ''}
          </span>
        ))}
      </div>
    </>
  )
}
