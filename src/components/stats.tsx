import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'wouter'
import type { LibraryItem } from '../db/db'
import type { MonthTotal } from '../lib/value'
import { Cover } from './Cover'

// Bits shared by Stats, Your year, and the same on someone's profile

export const statCard = 'rounded-2xl bg-white ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-800'
// a card of rows with lines between them
export const statList = `divide-y divide-stone-200 overflow-clip dark:divide-stone-800 ${statCard}`
export const pct = (n: number, of: number) => `${of > 0 ? Math.max(2, (n / of) * 100) : 0}%`

type RowItem = Pick<LibraryItem, 'instanceId' | 'title' | 'artist' | 'cover' | 'thumb'>

// A record with cover, title, and artist; opens the record unless given somewhere else to go
export function RecordRow({
  item,
  detail,
  href,
  onClick,
  children,
}: {
  item: RowItem
  detail?: string
  href?: string
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
      {children && <span className="shrink-0 pl-3 text-right">{children}</span>}
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  ) : (
    <Link href={href ?? `/collection/${item.instanceId}`} className={className}>
      {inner}
    </Link>
  )
}

// short: what fits over a bar, e.g. "$1.2K" or "4"
export function MonthBars({
  months,
  text,
  short = text,
  now,
}: {
  months: MonthTotal[]
  text: (n: number) => string
  short?: (n: number) => string
  now?: boolean // the last bar is this month, so it stands out from the rest
}) {
  const most = Math.max(...months.map((m) => m.total))
  return (
    <>
      <div className="flex h-32 items-end gap-1">
        {months.map((m, i) => (
          <div
            key={m.month}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5"
            aria-label={`${m.label}: ${text(m.total)}`}
          >
            {m.total > 0 && <span className="text-[0.625rem] font-semibold whitespace-nowrap tabular-nums">{short(m.total)}</span>}
            <span
              className={`w-full rounded-t-md ${now && i < months.length - 1 ? 'bg-accent/35' : 'bg-accent/80'}`}
              style={{ height: m.total ? pct(m.total, most) : 0 }}
            />
          </div>
        ))}
      </div>
      {/* every month where there's room, every other one on narrow cards */}
      <div className="@container mt-1 border-t border-stone-200 pt-1 dark:border-stone-800">
        <div className="flex gap-1">
          {months.map((m, i) => (
            <span key={m.month} className="min-w-0 flex-1 text-center text-[0.625rem] text-stone-500">
              <span className={i % 2 === 1 ? '' : 'invisible @md:visible'}>{m.label}</span>
            </span>
          ))}
        </div>
      </div>
    </>
  )
}

export function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className={`${statCard} p-3`}>
      <p className="truncate text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-stone-500">{label}</p>
    </div>
  )
}

// Records with a figure on the right, like "12 plays"
export function RecordList({ rows }: { rows: { item: RowItem; href?: string; right: string }[] }) {
  return (
    <ul className={statList}>
      {rows.map(({ item, href, right }) => (
        <li key={item.instanceId}>
          <RecordRow item={item} href={href}>
            <span className="text-sm font-medium text-stone-600 tabular-nums dark:text-stone-300">{right}</span>
          </RecordRow>
        </li>
      ))}
    </ul>
  )
}

export function TopArtists({ artists, text }: { artists: { name: string; count: number }[]; text: (n: number) => string }) {
  return (
    <ol className={statList}>
      {artists.map((a, i) => (
        <li key={a.name} className="flex items-center gap-3 px-4 py-3 text-sm">
          <span className="w-4 text-stone-500 tabular-nums">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
          <span className="shrink-0 font-medium text-stone-600 tabular-nums dark:text-stone-300">{text(a.count)}</span>
        </li>
      ))}
    </ol>
  )
}

export type Highlight = { label: string; value: string; record?: { item: RowItem; href?: string } }

// Your year's highlights: plain facts, and ones about a record that open it
export function Highlights({ facts }: { facts: Highlight[] }) {
  return (
    <ul className={statList}>
      {facts.map(({ label, value, record }) =>
        record ? (
          <li key={label}>
            <RecordRow item={record.item} href={record.href}>
              <span className="block text-xs text-stone-500">{label}</span>
              <span className="block text-sm font-medium tabular-nums">{value}</span>
            </RecordRow>
          </li>
        ) : (
          <li key={label} className="flex min-h-14 items-center justify-between gap-3 px-4 text-sm">
            <span className="text-stone-500">{label}</span>
            <span className="font-medium">{value}</span>
          </li>
        ),
      )}
    </ul>
  )
}

// ‹ 2026 so far ›, with an arrow turned off when there's no year that way
export function YearStepper({ year, onEarlier, onLater }: { year: number; onEarlier?: () => void; onLater?: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-stone-200 p-1 lg:max-w-[26rem] dark:bg-stone-800">
      <YearButton label="Earlier year" onClick={onEarlier}>
        <ChevronLeft size={18} />
      </YearButton>
      <span className="text-sm font-semibold tabular-nums">
        {year}
        {year === new Date().getFullYear() && <span className="font-normal text-stone-500"> so far</span>}
      </span>
      <YearButton label="Later year" onClick={onLater}>
        <ChevronRight size={18} />
      </YearButton>
    </div>
  )
}

function YearButton({ label, onClick, children }: { label: string; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={!onClick}
      onClick={onClick}
      className="flex min-h-9 min-w-11 items-center justify-center rounded-lg hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-stone-950"
    >
      {children}
    </button>
  )
}
