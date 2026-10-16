import { Check } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'wouter'
import { Stars } from '../../components/Stars'
import type { LibraryItem } from '../../db/db'
import { Cover } from '../../components/Cover'

type Selectable = { selected?: boolean; onSelect?: () => void }

// In select mode a tap toggles the record instead of opening it
function Tap({
  item,
  onSelect,
  selected,
  className,
  children,
}: Selectable & { item: LibraryItem; className: string; children: React.ReactNode }) {
  return onSelect ? (
    <button type="button" onClick={onSelect} aria-pressed={selected} className={`w-full text-left ${className}`}>
      {children}
    </button>
  ) : (
    <Link href={`/collection/${item.instanceId}`} className={className}>
      {children}
    </Link>
  )
}

function Tick({ on }: { on?: boolean }) {
  return (
    <span
      className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
        on ? 'border-accent bg-accent text-accent-fg' : 'border-white bg-black/30 text-transparent'
      }`}
      aria-hidden
    >
      <Check size={14} strokeWidth={3} />
    </span>
  )
}

export function GridTile({ item, note, selected, onSelect }: { item: LibraryItem; note?: string } & Selectable) {
  return (
    <li className="min-w-0">
      <Tap item={item} selected={selected} onSelect={onSelect} className="group block">
        <div className="relative">
          <Cover
            item={item}
            className={`aspect-square w-full rounded-xl shadow-sm ring-1 ring-black/5 transition group-active:scale-[0.98] ${selected ? 'opacity-70 ring-4 ring-accent' : ''}`}
          />
          {onSelect && (
            <span className="absolute top-2 right-2">
              <Tick on={selected} />
            </span>
          )}
        </div>
        <p className="mt-2 truncate text-sm font-semibold">{item.title}</p>
        <p className="truncate text-sm text-stone-500">{item.artist}</p>
        {note && <p className="text-sm font-medium tabular-nums">{note}</p>}
      </Tap>
    </li>
  )
}

export function ListRow({ item, note, selected, onSelect }: { item: LibraryItem; note?: string } & Selectable) {
  const meta = [item.year || null, item.format].filter(Boolean).join(' · ')
  return (
    <li>
      <Tap
        item={item}
        selected={selected}
        onSelect={onSelect}
        className={`flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-stone-800/50 dark:active:bg-stone-800 ${selected ? 'bg-accent-50 dark:bg-accent/10' : ''}`}
      >
        {onSelect && <Tick on={selected} />}
        <Cover item={item} small className="size-14 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{item.title}</p>
          <p className="truncate text-sm text-stone-600 dark:text-stone-400">{item.artist}</p>
          {meta && <p className="truncate text-xs text-stone-500">{meta}</p>}
        </div>
        {note ? (
          <span className="shrink-0 text-sm font-semibold tabular-nums">{note}</span>
        ) : (
          item.rating > 0 && (
            <span className="shrink-0">
              <Stars value={item.rating} size={12} />
            </span>
          )
        )}
      </Tap>
    </li>
  )
}

export function LoadMore({ onVisible }: { onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const cb = useRef(onVisible)
  cb.current = onVisible
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && cb.current(), { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <div ref={ref} className="h-10" aria-hidden />
}
