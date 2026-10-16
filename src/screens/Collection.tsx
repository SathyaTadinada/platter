import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowDownUp,
  Disc3,
  Download,
  Heart,
  LayoutGrid,
  List as ListIcon,
  SquareCheckBig,
  RefreshCw,
  Search,
  Shuffle,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { deleteInstance, editInstance, setFieldValue } from '../api/discogs/endpoints'
import { FilterSheet } from '../components/FilterSheet'
import { Menu } from '../components/Menu'
import { toast } from '../components/Toaster'
import { Button, buttonClass, IconButton, List, Notice, Screen, Spinner } from '../components/ui'
import { db, type LibraryItem } from '../db/db'
import { invalidateCollectionMeta, useCollectionMeta } from '../hooks/useCollectionMeta'
import { useSignedIn } from '../hooks/session'
import { useSync } from '../hooks/sync'
import { useFieldMatches } from '../hooks/useFields'
import { useListening } from '../hooks/plays'
import { dayAgo } from '../lib/time'
import { download, today } from '../lib/download'
import { useCurrency, useFreshPrices } from '../hooks/prices'
import {
  activeFilterCount,
  facets as buildFacets,
  filterItems,
  groupItems,
  parseQuery,
  saveSort,
  serializeQuery,
  SORTS,
  sortItems,
  toCsv,
  type Filters,
  type LibraryQuery,
  type SortContext,
} from '../lib/library'
import { fieldFor } from '../lib/fields'
import { formatMoney, valueOf } from '../lib/value'
import { applyFields, runBulk } from '../lib/bulk'
import { SYNC_MAX_AGE } from '../lib/sync'
import { FieldNudge } from './FieldNudge'
import { readChoice, writePref } from '../lib/prefs'
import { PriceCoverage } from '../components/PriceCoverage'
import { GridTile, ListRow, LoadMore } from './collection/RecordTiles'
import { ActiveFilters } from './collection/ActiveFilters'
import { BulkBar } from './collection/BulkBar'

type View = 'grid' | 'list'
const VIEW_KEY = 'platter.libraryView'
const PAGE = 120 // items rendered at a time; more load as you scroll
const headerButton =
  'hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-200 disabled:opacity-40 lg:inline-flex dark:text-stone-300 dark:hover:bg-stone-800'

const loadView = () => readChoice<View>(VIEW_KEY, ['grid', 'list'], 'grid')

export function Collection() {
  const { client, username } = useSignedIn()
  const sync = useSync()
  const search = useSearch()
  const [, navigate] = useLocation()
  // the saved sort isn't in the URL, so picking one needs its own nudge to re-read the query
  const [sortPicked, setSortPicked] = useState(0)
  // sortPicked isn't read inside; it's listed so parseQuery runs again after the saved sort changes
  const query = useMemo(() => parseQuery(search), [search, sortPicked])
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
  const listened = useListening()
  const locationField = matches ? fieldFor(matches, 'location')?.id : undefined
  const sortCtx = useMemo<SortContext>(() => {
    const byInstance = new Map(listened?.rows.map((r) => [r.item.instanceId, r]))
    return {
      value: prices ? (i) => valueOf(prices.get(i.releaseId), mediaField ? i.fields[mediaField] : undefined)?.amount : undefined,
      money: currency ? (n) => formatMoney(n, currency, { whole: true }) : undefined,
      plays: (i) => byInstance.get(i.instanceId)?.count ?? 0,
      lastPlayed: (i) => byInstance.get(i.instanceId)?.last,
      location: locationField !== undefined ? (i) => i.fields[locationField] : undefined,
    }
  }, [prices, currency, mediaField, listened, locationField])

  // a short note under each record for sorts where it helps
  const noteOf = (i: LibraryItem) => {
    if (query.sort === 'value') {
      const v = sortCtx.value?.(i)
      return v === undefined || !currency ? undefined : formatMoney(v, currency)
    }
    if (query.sort === 'plays') {
      const n = sortCtx.plays?.(i) ?? 0
      return n ? `${n} play${n === 1 ? '' : 's'}` : undefined
    }
    if (query.sort === 'played') {
      const t = sortCtx.lastPlayed?.(i)
      return t ? dayAgo(t) : undefined
    }
  }

  const filtered = useMemo(() => (items ? sortItems(filterItems(items, query), query.sort, sortCtx) : []), [items, query, sortCtx])
  // headings only help when groups are reasonably full; sparse ones just break up the grid
  const groups = useMemo(() => {
    const shown = filtered.slice(0, limit)
    const all = groupItems(filtered, query.sort, sortCtx)
    if (all.length < 2 || filtered.length / all.length < 3) return [{ key: 'all', label: '', items: shown }]
    return groupItems(shown, query.sort, sortCtx)
  }, [filtered, limit, query.sort, sortCtx])
  const facets = useMemo(() => (items ? buildFacets(items, query, folders, fields) : null), [items, query, folders, fields])

  const fresh = syncedAt !== undefined && Date.now() - syncedAt < SYNC_MAX_AGE
  const nFilters = activeFilterCount(query.filters)
  const searching = Boolean(query.q) || nFilters > 0
  const onlyCrate = !query.q && nFilters === 1 && query.filters.folder !== undefined

  function toggleView() {
    const next = view === 'grid' ? 'list' : 'grid'
    setView(next)
    writePref(VIEW_KEY, next)
  }

  function shuffle() {
    if (!filtered.length) return
    const pick = filtered[Math.floor(Math.random() * filtered.length)]
    navigate(`/collection/${pick.instanceId}`)
  }

  function exportCsv(items = filtered) {
    download(`${username}-collection-${today()}.csv`, toCsv(items, folders, fields), 'text/csv')
  }

  const toolbar = (
    <div className="space-y-2">
      <label className="relative block">
        <span className="sr-only">Search your collection</span>
        <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-500" aria-hidden />
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
            className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-stone-500"
          >
            <X size={18} />
          </button>
        )}
      </label>
      <div className="flex items-center gap-2">
        <Menu
          label="Sort by"
          align="left"
          className="min-w-0"
          buttonClassName="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-stone-200 px-3 text-sm font-medium hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700"
          button={
            <>
              <ArrowDownUp size={16} className="shrink-0" aria-hidden />
              <span className="truncate whitespace-nowrap">{SORTS.find((s) => s.key === query.sort)?.label}</span>
            </>
          }
          items={SORTS.map((s) => ({
            label: s.label,
            checked: s.key === query.sort,
            onSelect: () => {
              saveSort(s.key)
              setSortPicked((n) => n + 1)
              setQuery({ ...query, sort: s.key })
            },
          }))}
        />
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap ${
            nFilters ? 'bg-stone-900 text-white dark:bg-accent dark:text-accent-fg' : 'bg-stone-200 dark:bg-stone-800'
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

  // only what's still in the collection, so the count drops as records are removed
  const chosenCount = selected ? filtered.filter((i) => selected.has(i.instanceId)).length : 0

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

  async function editFields(changes: Record<number, string>, onProgress: (d: number, t: number) => void) {
    const chosen = filtered.filter((i) => selected?.has(i.instanceId))
    const target = (i: LibraryItem) => ({ folderId: i.folderId, releaseId: i.releaseId, instanceId: i.instanceId })
    let changed = 0
    const r = await runBulk(
      chosen,
      async (i) => {
        const fields = await applyFields(i.fields, changes, (id, v) => setFieldValue(client, username, target(i), id, v))
        if (!fields) return
        await db.collection.update(i.instanceId, { fields })
        changed++
      },
      onProgress,
    )
    const n = (k: number) => `${k} record${k === 1 ? '' : 's'}`
    const same = r.done.length - changed
    if (r.failed.length) toast(`Updated ${n(changed)}. ${r.failed.length} failed: ${r.failed[0].error}`, { tone: 'error' })
    else if (!changed) toast(`Nothing to change. ${same === 1 ? 'It' : 'They'} already had those values.`, { tone: 'success' })
    else toast(`Updated ${n(changed)}.${same ? ` ${same} already matched.` : ''}`, { tone: 'success' })
    setSelected(null)
  }

  const selectActions = (
    <>
      <button
        type="button"
        onClick={() => setSelected(new Set(chosenCount === filtered.length ? [] : filtered.map((i) => i.instanceId)))}
        className="rounded-lg px-2 py-1.5 text-sm font-medium"
      >
        {chosenCount === filtered.length ? 'Select none' : 'Select all'}
      </button>
      <button type="button" onClick={() => setSelected(null)} className="rounded-lg px-2 py-1.5 text-sm font-semibold">
        Done
      </button>
    </>
  )

  const exportLabel = searching ? `Export these ${filtered.length}` : 'Export collection'

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
      <IconButton label="Wantlist" onClick={() => navigate('/wantlist')} className="lg:hidden">
        <Heart size={20} />
      </IconButton>
      <IconButton label="Select records" onClick={() => setSelected(new Set())} disabled={!filtered.length}>
        <SquareCheckBig size={20} />
      </IconButton>
      <IconButton label="Refresh from Discogs" onClick={() => sync.sync(true)} disabled={sync.running} className="hidden lg:block">
        <RefreshCw size={20} className={sync.running ? 'animate-spin' : ''} />
      </IconButton>
      <span className="mx-1 hidden h-6 w-px bg-stone-200 lg:block dark:bg-stone-800" aria-hidden />
      <button type="button" onClick={() => navigate('/wantlist')} className={headerButton}>
        <Heart size={18} aria-hidden /> Wantlist
      </button>
      <button type="button" onClick={() => exportCsv()} disabled={!filtered.length} className={headerButton}>
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
            { label: exportLabel, icon: <Download size={18} />, onSelect: () => exportCsv(), disabled: !filtered.length },
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
        <p className="max-w-xs text-balance text-stone-500">Scan a record or import a collection to get started.</p>
        <div className="mt-2 flex gap-2">
          <Link href="/scan" className={buttonClass('primary')}>
            Scan a record
          </Link>
          <Link href="/import" className={buttonClass('secondary')}>
            Import collection
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
        <FieldNudge className="mb-4" />
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
                    note={noteOf(i)}
                    selected={selected?.has(i.instanceId)}
                    onSelect={selected ? () => toggle(i.instanceId) : undefined}
                  />
                ))}
              </ul>
            ) : (
              <List>
                {g.items.map((i) => (
                  <ListRow
                    key={i.instanceId}
                    item={i}
                    note={noteOf(i)}
                    selected={selected?.has(i.instanceId)}
                    onSelect={selected ? () => toggle(i.instanceId) : undefined}
                  />
                ))}
              </List>
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
      title={selected ? (chosenCount ? `${chosenCount} selected` : 'Select records') : 'Collection'}
      width="full"
      actions={actions}
      toolbar={items?.length && fresh ? toolbar : undefined}
    >
      {body}
      {selected && chosenCount > 0 && (
        <BulkBar
          count={chosenCount}
          folders={folders}
          onRun={bulk}
          onEdit={editFields}
          onExport={() => exportCsv(filtered.filter((i) => selected.has(i.instanceId)))}
          fields={fields}
          matches={matches}
          currency={currency ?? 'USD'}
        />
      )}
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
