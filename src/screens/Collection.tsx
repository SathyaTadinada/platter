import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowDownUp,
  Check,
  Disc3,
  Download,
  FileUp,
  LayoutGrid,
  List as ListIcon,
  ListChecks,
  RefreshCw,
  Search,
  Shuffle,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { deleteInstance, editInstance } from '../api/discogs/endpoints'
import type { Folder } from '../api/discogs/types'
import { FilterSheet } from '../components/FilterSheet'
import { CrateSelect } from '../components/CrateSelect'
import { Menu } from '../components/Menu'
import { toast } from '../components/Toaster'
import { Stars } from '../components/Stars'
import { Button, buttonClass, IconButton, Notice, Screen, Spinner } from '../components/ui'
import { db, type LibraryItem } from '../db/db'
import { invalidateCollectionMeta, useCollectionMeta } from '../hooks/useCollectionMeta'
import { useSignedIn } from '../hooks/session'
import { useSync } from '../hooks/sync'
import { useFieldMatches } from '../hooks/useFields'
import { checkPrices, useCurrency, useFreshPrices, usePriceCheck } from '../hooks/prices'
import {
  activeFilterCount,
  facets as buildFacets,
  filterItems,
  groupItems,
  parseQuery,
  serializeQuery,
  SORTS,
  sortItems,
  toCsv,
  type Filters,
  type LibraryQuery,
  type ValueLookup,
} from '../lib/library'
import { fieldFor } from '../lib/fields'
import { formatMoney, valueOf } from '../lib/value'
import { runBulk } from '../lib/bulk'
import { SYNC_MAX_AGE } from '../lib/sync'

type View = 'grid' | 'list'
const VIEW_KEY = 'platter.libraryView'
const PAGE = 120 // items rendered at a time; more load as you scroll
const headerButton =
  'hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-200 disabled:opacity-40 lg:inline-flex dark:text-stone-300 dark:hover:bg-stone-800'

function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

export function Collection() {
  const { client, username } = useSignedIn()
  const sync = useSync()
  const search = useSearch()
  const [, navigate] = useLocation()
  const query = useMemo(() => parseQuery(search), [search])
  const [text, setText] = useState(query.q)
  const [view, setView] = useState<View>(loadView)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<Set<number> | null>(null) // null = not selecting
  const meta = useCollectionMeta()

  const items = useLiveQuery(() => db.collection.toArray(), [])
  const syncedAt = useLiveQuery(async () => (await db.settings.get('collectionSyncedAt'))?.value as number | undefined, [])

  const setQuery = (next: LibraryQuery) => {
    const qs = serializeQuery(next)
    navigate(qs ? `/?${qs}` : '/', { replace: true })
  }
  const setFilters = (filters: Filters) => setQuery({ ...query, filters })

  // typing updates the URL after a short pause
  useEffect(() => {
    if (text === query.q) return
    const t = setTimeout(() => setQuery({ ...query, q: text }), 200)
    return () => clearTimeout(t)
  })

  // follow the URL when it changes from elsewhere (back button, genre links)
  useEffect(() => setText(query.q), [query.q])
  useEffect(() => setLimit(PAGE), [search])

  const folders = meta.data?.folders ?? []
  const fields = meta.data?.fields ?? []
  // prices only matter when sorting by value
  const byValue = query.sort === 'value'
  const currency = useCurrency()
  const prices = useFreshPrices(byValue ? currency : undefined)
  const matches = useFieldMatches()
  const mediaField = matches ? fieldFor(matches, 'mediaCondition')?.id : undefined
  const valueLookup = useMemo<ValueLookup | undefined>(
    () =>
      prices && currency
        ? {
            value: (i) => valueOf(prices.get(i.releaseId), mediaField ? i.fields[mediaField] : undefined)?.amount,
            money: (n) => formatMoney(n, currency, { whole: true }),
          }
        : undefined,
    [prices, currency, mediaField],
  )
  const priceOf = (i: LibraryItem) => {
    const v = byValue ? valueLookup?.value(i) : undefined
    return v === undefined || !currency ? undefined : formatMoney(v, currency)
  }

  const filtered = useMemo(() => (items ? sortItems(filterItems(items, query), query.sort, valueLookup) : []), [items, query, valueLookup])
  // headings only help when groups are reasonably full; sparse ones just break up the grid
  const groups = useMemo(() => {
    const shown = filtered.slice(0, limit)
    const all = groupItems(filtered, query.sort, valueLookup)
    if (all.length < 2 || filtered.length / all.length < 3) return [{ key: 'all', label: '', items: shown }]
    return groupItems(shown, query.sort, valueLookup)
  }, [filtered, limit, query.sort, valueLookup])
  const facets = useMemo(() => (items ? buildFacets(items, query, folders, fields) : null), [items, query, folders, fields])

  const fresh = syncedAt !== undefined && Date.now() - syncedAt < SYNC_MAX_AGE
  const nFilters = activeFilterCount(query.filters)
  const searching = Boolean(query.q) || nFilters > 0
  const onlyCrate = !query.q && nFilters === 1 && query.filters.folder !== undefined

  function toggleView() {
    const next = view === 'grid' ? 'list' : 'grid'
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // not important
    }
  }

  function shuffle() {
    if (!filtered.length) return
    const pick = filtered[Math.floor(Math.random() * filtered.length)]
    navigate(`/collection/${pick.instanceId}`)
  }

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([toCsv(filtered, folders, fields)], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${username}-collection-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toolbar = (
    <div className="space-y-2">
      <label className="relative block">
        <span className="sr-only">Search your collection</span>
        <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" aria-hidden />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search artist, title, label, genre…"
          autoComplete="off"
          className="min-h-11 w-full rounded-xl border border-stone-300 bg-white pr-9 pl-10 text-base dark:border-stone-700 dark:bg-stone-900 [&::-webkit-search-cancel-button]:hidden"
        />
        {text && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setText('')}
            className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-stone-400"
          >
            <X size={18} />
          </button>
        )}
      </label>
      <div className="flex items-center gap-2">
        {/* the visible pill sizes to the current label; the real select sits on top, invisible */}
        <label className="relative inline-flex min-h-9 min-w-0 items-center gap-1.5 rounded-full bg-stone-200 px-3 text-sm font-medium dark:bg-stone-800">
          <ArrowDownUp size={16} className="shrink-0" aria-hidden />
          <span aria-hidden className="truncate whitespace-nowrap">
            {SORTS.find((s) => s.key === query.sort)?.label}
          </span>
          <span className="sr-only">Sort by</span>
          <select
            value={query.sort}
            onChange={(e) => setQuery({ ...query, sort: e.target.value as LibraryQuery['sort'] })}
            className="absolute inset-0 cursor-pointer appearance-none opacity-0"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap ${
            nFilters ? 'bg-stone-900 text-white dark:bg-accent-500 dark:text-stone-950' : 'bg-stone-200 dark:bg-stone-800'
          }`}
        >
          <SlidersHorizontal size={16} aria-hidden />
          Filters{nFilters ? ` · ${nFilters}` : ''}
        </button>
        {items && (
          <span className="ml-auto text-sm text-stone-500 tabular-nums">
            {searching ? `${filtered.length} of ${items.length}` : items.length}
          </span>
        )}
      </div>
    </div>
  )

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  async function bulk(kind: 'remove' | 'move', folderId?: number, onProgress?: (d: number, t: number) => void) {
    const chosen = filtered.filter((i) => selected?.has(i.instanceId))
    const target = (i: LibraryItem) => ({ folderId: i.folderId, releaseId: i.releaseId, instanceId: i.instanceId })
    const r = await runBulk(
      chosen,
      async (i) => {
        if (kind === 'remove') {
          await deleteInstance(client, username, target(i))
          await db.collection.delete(i.instanceId)
        } else {
          await editInstance(client, username, target(i), { folder_id: folderId })
          await db.collection.update(i.instanceId, { folderId })
        }
      },
      onProgress,
    )
    invalidateCollectionMeta()
    const verb = kind === 'remove' ? 'Removed' : 'Moved'
    const n = (k: number) => `${k} record${k === 1 ? '' : 's'}`
    if (r.failed.length) toast(`${verb} ${n(r.done.length)}. ${r.failed.length} failed: ${r.failed[0].error}`, { tone: 'error' })
    else toast(`${verb} ${n(r.done.length)}.`, { tone: 'success' })
    setSelected(null)
  }

  const selectActions = (
    <>
      <button
        type="button"
        onClick={() => setSelected(new Set(selected?.size === filtered.length ? [] : filtered.map((i) => i.instanceId)))}
        className="rounded-lg px-2 py-1.5 text-sm font-medium"
      >
        {selected?.size === filtered.length ? 'Select none' : 'Select all'}
      </button>
      <button type="button" onClick={() => setSelected(null)} className="rounded-lg px-2 py-1.5 text-sm font-semibold">
        Done
      </button>
    </>
  )

  const exportLabel = searching ? `Export these ${filtered.length}` : 'Export CSV'

  // Phones get the everyday actions plus a menu; desktop has room for all of them
  const actions = selected ? (
    selectActions
  ) : (
    <>
      <IconButton label="Pick a random record" onClick={shuffle} disabled={!filtered.length}>
        <Shuffle size={20} />
      </IconButton>
      <IconButton label={view === 'grid' ? 'Show as list' : 'Show as grid'} onClick={toggleView}>
        {view === 'grid' ? <ListIcon size={20} /> : <LayoutGrid size={20} />}
      </IconButton>
      <IconButton label="Select records" onClick={() => setSelected(new Set())} disabled={!filtered.length}>
        <ListChecks size={20} />
      </IconButton>
      <IconButton label="Refresh from Discogs" onClick={() => sync.sync(true)} disabled={sync.running} className="hidden lg:block">
        <RefreshCw size={20} className={sync.running ? 'animate-spin' : ''} />
      </IconButton>
      <span className="mx-1 hidden h-6 w-px bg-stone-200 lg:block dark:bg-stone-800" aria-hidden />
      <button type="button" onClick={() => navigate('/import')} className={headerButton}>
        <FileUp size={18} aria-hidden /> Import CSV
      </button>
      <button type="button" onClick={exportCsv} disabled={!filtered.length} className={headerButton}>
        <Download size={18} aria-hidden /> {exportLabel}
      </button>
      <div className="lg:hidden">
        <Menu
          label="More"
          items={[
            {
              label: sync.running ? 'Refreshing…' : 'Refresh from Discogs',
              icon: <RefreshCw size={18} />,
              onSelect: () => sync.sync(true),
              disabled: sync.running,
            },
            { label: 'Import CSV', icon: <FileUp size={18} />, onSelect: () => navigate('/import') },
            { label: exportLabel, icon: <Download size={18} />, onSelect: exportCsv, disabled: !filtered.length },
          ]}
        />
      </div>
    </>
  )

  let body
  if (!items) {
    body = <Spinner />
  } else if (!fresh) {
    // Discogs asks apps not to show data more than 6 hours old
    body = sync.running ? (
      <Spinner label={sync.total > 1 ? `Updating your collection (${sync.done} of ${sync.total})` : 'Updating your collection'} />
    ) : (
      <div className="space-y-3 py-6">
        <Notice tone={sync.error ? 'error' : 'info'}>
          {sync.error ? `Couldn't update your collection: ${sync.error}` : 'Your collection is out of date.'}
        </Notice>
        <Button onClick={() => sync.sync(true)}>Refresh now</Button>
      </div>
    )
  } else if (!items.length) {
    body = (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Disc3 size={48} className="text-stone-400" aria-hidden />
        <p className="text-lg font-semibold">No records yet</p>
        <p className="max-w-xs text-stone-500">Scan a record or import a CSV to get started.</p>
        <div className="mt-2 flex gap-2">
          <Link href="/scan" className={buttonClass('primary')}>
            Scan a record
          </Link>
          <Link href="/import" className={buttonClass('secondary')}>
            Import a CSV
          </Link>
        </div>
      </div>
    )
  } else if (!filtered.length) {
    body = (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        {onlyCrate ? (
          <p className="text-lg font-semibold">
            Nothing in {facets?.folder.find((o) => o.value === String(query.filters.folder))?.label ?? 'this crate'}
          </p>
        ) : (
          <>
            <p className="text-lg font-semibold">No matches</p>
            <p className="text-stone-500">Try a different search or clear the filters.</p>
          </>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            setText('')
            setQuery({ ...query, q: '', filters: { fields: {} } })
          }}
        >
          Clear search and filters
        </Button>
      </div>
    )
  } else {
    body = (
      <>
        <ActiveFilters filters={query.filters} facets={facets} onChange={setFilters} />
        {byValue && currency && prices && <PriceCoverage items={filtered} prices={prices} currency={currency} />}
        {groups.map((g) => (
          <section key={g.key} className="mb-6">
            {g.label && <h2 className="mb-2 text-sm font-semibold text-stone-500">{g.label}</h2>}
            {view === 'grid' ? (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {g.items.map((i) => (
                  <GridTile
                    key={i.instanceId}
                    item={i}
                    price={priceOf(i)}
                    selected={selected?.has(i.instanceId)}
                    onSelect={selected ? () => toggle(i.instanceId) : undefined}
                  />
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:divide-stone-800 dark:bg-stone-900 dark:ring-stone-800">
                {g.items.map((i) => (
                  <ListRow
                    key={i.instanceId}
                    item={i}
                    price={priceOf(i)}
                    selected={selected?.has(i.instanceId)}
                    onSelect={selected ? () => toggle(i.instanceId) : undefined}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}
        {filtered.length > limit && <LoadMore onVisible={() => setLimit((n) => n + PAGE)} />}
        <footer className="mt-4 border-t border-stone-200 pt-4 text-sm dark:border-stone-800">
          <a
            href={`https://www.discogs.com/user/${encodeURIComponent(username)}/collection`}
            target="_blank"
            rel="noopener"
            className="text-stone-500 underline underline-offset-2"
          >
            Data provided by Discogs.
          </a>
        </footer>
      </>
    )
  }

  return (
    <Screen
      title={selected ? (selected.size ? `${selected.size} selected` : 'Select records') : 'Collection'}
      width="full"
      actions={actions}
      toolbar={items?.length && fresh ? toolbar : undefined}
    >
      {body}
      {selected && selected.size > 0 && <BulkBar count={selected.size} folders={folders} onRun={bulk} />}
      {filtersOpen && facets && (
        <FilterSheet
          facets={facets}
          filters={query.filters}
          count={filtered.length}
          onChange={setFilters}
          onClose={() => setFiltersOpen(false)}
        />
      )}
    </Screen>
  )
}

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
        on ? 'border-accent-500 bg-accent-500 text-stone-950' : 'border-white bg-black/30 text-transparent'
      }`}
      aria-hidden
    >
      <Check size={14} strokeWidth={3} />
    </span>
  )
}

function GridTile({ item, price, selected, onSelect }: { item: LibraryItem; price?: string } & Selectable) {
  return (
    <li className="min-w-0">
      <Tap item={item} selected={selected} onSelect={onSelect} className="group block">
        <div className="relative">
          <Cover
            item={item}
            className={`aspect-square w-full rounded-xl shadow-sm ring-1 ring-black/5 transition group-active:scale-[0.98] ${selected ? 'opacity-70 ring-4 ring-accent-500' : ''}`}
          />
          {onSelect && (
            <span className="absolute top-2 right-2">
              <Tick on={selected} />
            </span>
          )}
        </div>
        <p className="mt-2 truncate text-sm font-semibold">{item.title}</p>
        <p className="truncate text-sm text-stone-500">{item.artist}</p>
        {price && <p className="text-sm font-medium tabular-nums">{price}</p>}
      </Tap>
    </li>
  )
}

function ListRow({ item, price, selected, onSelect }: { item: LibraryItem; price?: string } & Selectable) {
  const meta = [item.year || null, item.format].filter(Boolean).join(' · ')
  return (
    <li>
      <Tap
        item={item}
        selected={selected}
        onSelect={onSelect}
        className={`flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-stone-800/50 dark:active:bg-stone-800 ${selected ? 'bg-accent-50 dark:bg-accent-500/10' : ''}`}
      >
        {onSelect && <Tick on={selected} />}
        <Cover item={item} small className="size-14 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{item.title}</p>
          <p className="truncate text-sm text-stone-600 dark:text-stone-400">{item.artist}</p>
          {meta && <p className="truncate text-xs text-stone-500">{meta}</p>}
        </div>
        {price ? (
          <span className="shrink-0 text-sm font-semibold tabular-nums">{price}</span>
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

export function Cover({
  item,
  className = '',
  small,
}: {
  item: Pick<LibraryItem, 'cover' | 'thumb'>
  className?: string
  small?: boolean
}) {
  const src = small ? (item.thumb ?? item.cover) : (item.cover ?? item.thumb)
  return src ? (
    <img src={src} alt="" loading="lazy" decoding="async" className={`bg-stone-200 object-cover dark:bg-stone-800 ${className}`} />
  ) : (
    <div className={`flex items-center justify-center bg-stone-200 text-stone-400 dark:bg-stone-800 ${className}`}>
      <Disc3 size={small ? 20 : 40} aria-hidden />
    </div>
  )
}

// Sorting by value only works for records with a recent price
export function PriceCoverage({ items, prices, currency }: { items: LibraryItem[]; prices: Map<number, unknown>; currency: string }) {
  const { client } = useSignedIn()
  const check = usePriceCheck()
  const ids = [...new Set(items.map((i) => i.releaseId))]
  const priced = ids.filter((id) => prices.has(id)).length
  if (!check.running && priced >= ids.length) return null
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl bg-stone-100 px-3 py-2 text-sm dark:bg-stone-900">
      {check.running ? (
        <>
          <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent text-stone-500" />
          <span className="tabular-nums">
            Getting prices · {check.done} of {check.total}
          </span>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1">
            {check.error
              ? `Couldn't get prices: ${check.error}`
              : priced
                ? `Prices for ${priced} of ${ids.length} records.`
                : 'No prices yet.'}
          </span>
          <button type="button" onClick={() => checkPrices(client, ids, currency)} className="shrink-0 font-semibold">
            {check.error ? 'Try again' : priced ? 'Get the rest' : 'Get prices'}
          </button>
        </>
      )}
    </div>
  )
}

function LoadMore({ onVisible }: { onVisible: () => void }) {
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

// Chips for active filters, each removable
function ActiveFilters({
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
    <div className="mb-4 flex flex-wrap gap-2">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.clear}
          className="inline-flex items-center gap-1 rounded-full bg-stone-900 py-1 pr-2 pl-3 text-sm text-white dark:bg-accent-500 dark:text-stone-950"
          aria-label={`Remove filter ${c.label}`}
        >
          {c.label}
          <X size={14} aria-hidden />
        </button>
      ))}
      <button type="button" onClick={() => onChange({ fields: {} })} className="px-2 text-sm text-stone-500 underline">
        Clear all
      </button>
    </div>
  )
}

// Pinned to the bottom while records are selected
function BulkBar({
  count,
  folders,
  onRun,
}: {
  count: number
  folders: Folder[]
  onRun: (kind: 'remove' | 'move', folderId?: number, onProgress?: (d: number, t: number) => void) => Promise<void>
}) {
  const [confirm, setConfirm] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const records = `${count} record${count === 1 ? '' : 's'}`

  async function run(kind: 'remove' | 'move', folderId?: number) {
    const verb = kind === 'remove' ? 'Removing' : 'Moving'
    setProgress(`${verb}…`)
    await onRun(kind, folderId, (d, t) => setProgress(`${verb} ${d} of ${t}…`))
    setProgress(null)
    setConfirm(false)
  }

  return (
    <div className="sticky bottom-3 z-10 mt-4">
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-3 shadow-xl ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-700">
        {progress ? (
          <p className="py-2 text-center text-sm font-medium" role="status">
            {progress}
          </p>
        ) : confirm ? (
          <div className="space-y-2">
            <p className="text-sm">Remove {records} from your Discogs collection? Their notes and other details are deleted too.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => run('remove')}>
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="relative">
              <span className={buttonClass('secondary', 'w-full')}>Move to crate…</span>
              <CrateSelect
                ariaLabel="Move to crate"
                value={undefined}
                placeholder="Move to crate…"
                folders={folders}
                onChange={(id) => run('move', id)}
                className="absolute inset-0 opacity-0"
              />
            </label>
            <Button variant="danger" onClick={() => setConfirm(true)}>
              Remove
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
