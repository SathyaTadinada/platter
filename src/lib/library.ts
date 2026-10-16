import type { CollectionField, CollectionItem, Folder, Release, SearchResult, WantItem as ApiWant } from '../api/discogs/types'
import type { LibraryItem, WantItem } from '../db/db'
import { ALL_MEDIA, cleanArtist, cleanLabel, describeFormats, splitTitle } from './format'
import { valueBracket } from './value'
import { readChoice, writePref } from './prefs'

// what the Format filter offers; "All Media" isn't a format (see format.ts)
const formatNames = (formats: { name: string }[] = []) => [...new Set(formats.map((f) => f.name))].filter((n) => n !== ALL_MEDIA)

// ---- building items ----

// Discogs gives each artist a joiner for the next one: "&", "feat.", or plain ","
function joiner(join?: string): string {
  const j = join?.trim()
  if (!j || j === ',') return ', '
  return /^[,;/]$/.test(j) ? `${j} ` : ` ${j} `
}

export const joinArtists = (artists: { name: string; join?: string }[]) =>
  artists.map((a, i) => cleanArtist(a.name) + (i < artists.length - 1 ? joiner(a.join) : '')).join('')

const realImage = (url?: string) => (url && !url.endsWith('spacer.gif') ? url : undefined)

export function toLibraryItem(x: CollectionItem): LibraryItem {
  const b = x.basic_information
  const fields: Record<number, string> = {}
  for (const n of x.notes ?? []) if (n.value) fields[n.field_id] = n.value
  return {
    instanceId: x.instance_id,
    releaseId: x.id,
    masterId: b.master_id,
    folderId: x.folder_id,
    title: b.title,
    artist: joinArtists(b.artists),
    year: b.year || 0,
    thumb: realImage(b.thumb),
    cover: realImage(b.cover_image),
    label: b.labels[0] && cleanLabel(b.labels[0].name),
    catno: b.labels[0]?.catno && b.labels[0].catno !== 'none' ? b.labels[0].catno : undefined,
    format: describeFormats(b.formats) ?? '',
    formatNames: formatNames(b.formats),
    formatTags: [...new Set(b.formats.flatMap((f) => f.descriptions ?? []))],
    genres: b.genres ?? [],
    styles: b.styles ?? [],
    dateAdded: x.date_added,
    rating: x.rating,
    fields,
  }
}

export function wantFromApi(w: ApiWant): WantItem {
  const b = w.basic_information
  return {
    releaseId: w.id,
    masterId: b.master_id,
    title: b.title,
    artist: joinArtists(b.artists),
    thumb: realImage(b.thumb),
    year: b.year || undefined,
    format: describeFormats(b.formats),
    dateAdded: w.date_added,
  }
}

export function wantFromRelease(r: Release, now = new Date()): WantItem {
  return {
    releaseId: r.id,
    masterId: r.master_id ?? 0,
    title: r.title,
    artist: joinArtists(r.artists),
    thumb: realImage(r.images?.[0]?.uri150 ?? r.thumb),
    year: r.year || undefined,
    format: describeFormats(r.formats),
    dateAdded: now.toISOString(),
  }
}

// After adding from a release page, so the library shows it right away
export function itemFromRelease(r: Release, instanceId: number, folderId: number, now = new Date()): LibraryItem {
  const label = r.labels?.[0]
  return {
    instanceId,
    releaseId: r.id,
    masterId: r.master_id ?? 0,
    folderId,
    title: r.title,
    artist: joinArtists(r.artists),
    year: r.year || 0,
    thumb: realImage(r.images?.[0]?.uri150 ?? r.thumb),
    cover: realImage(r.images?.[0]?.uri),
    label: label && cleanLabel(label.name),
    catno: label?.catno && label.catno !== 'none' ? label.catno : undefined,
    format: describeFormats(r.formats) ?? '',
    formatNames: formatNames(r.formats),
    formatTags: [...new Set((r.formats ?? []).flatMap((f) => f.descriptions ?? []))],
    genres: r.genres ?? [],
    styles: r.styles ?? [],
    dateAdded: now.toISOString(),
    rating: 0,
    fields: {},
  }
}

// After adding from search, so the library shows it right away
export function itemFromSearch(r: SearchResult, instanceId: number, folderId: number, now = new Date()): LibraryItem {
  const { artist, title } = splitTitle(r.title)
  const formats = r.formats ?? []
  return {
    instanceId,
    releaseId: r.id,
    masterId: r.master_id ?? 0,
    folderId,
    title,
    artist,
    year: Number(r.year) || 0,
    thumb: realImage(r.thumb),
    cover: realImage(r.cover_image),
    label: r.label?.[0] && cleanLabel(r.label[0]),
    catno: r.catno && r.catno !== 'none' ? r.catno : undefined,
    format: describeFormats(formats, r.format) ?? '',
    formatNames: formatNames(formats),
    formatTags: [...new Set(formats.flatMap((f) => f.descriptions ?? []))],
    genres: (r as { genre?: string[] }).genre ?? [],
    styles: (r as { style?: string[] }).style ?? [],
    dateAdded: now.toISOString(),
    rating: 0,
    fields: {},
  }
}

// ---- query ----

export type SortKey =
  'added' | 'added-old' | 'artist' | 'title' | 'year' | 'year-old' | 'rating' | 'value' | 'plays' | 'played' | 'location'

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'added', label: 'Recently added' },
  { key: 'added-old', label: 'Oldest added' },
  { key: 'artist', label: 'Artist' },
  { key: 'title', label: 'Title' },
  { key: 'year', label: 'Newest release' },
  { key: 'year-old', label: 'Oldest release' },
  { key: 'rating', label: 'Rating' },
  { key: 'value', label: 'Value' },
  { key: 'plays', label: 'Most played' },
  { key: 'played', label: 'Recently played' },
  { key: 'location', label: 'Location' },
]

export type Filters = {
  folder?: number
  format?: string
  tag?: string
  genre?: string
  style?: string
  decade?: number
  rating?: number // minimum stars
  fields: Record<number, string>
}

export type LibraryQuery = { q: string; sort: SortKey; filters: Filters }

export const emptyQuery = (): LibraryQuery => ({ q: '', sort: 'added', filters: { fields: {} } })

// The sort picked last time is the default, so it sticks without living in the URL
const SORT_KEY = 'platter.sort'

const savedSort = () =>
  readChoice<SortKey>(
    SORT_KEY,
    SORTS.map((s) => s.key),
    'added',
  )
export const saveSort = (sort: SortKey) => writePref(SORT_KEY, sort)

export function parseQuery(search: string): LibraryQuery {
  const p = new URLSearchParams(search)
  const num = (k: string) => (p.get(k) ? Number(p.get(k)) : undefined)
  const fields: Record<number, string> = {}
  for (const [k, v] of p) if (k.startsWith('f.')) fields[Number(k.slice(2))] = v
  const sort = (SORTS.some((s) => s.key === p.get('sort')) ? p.get('sort') : savedSort()) as SortKey
  return {
    q: p.get('q') ?? '',
    sort,
    filters: {
      folder: num('folder'),
      format: p.get('format') ?? undefined,
      tag: p.get('tag') ?? undefined,
      genre: p.get('genre') ?? undefined,
      style: p.get('style') ?? undefined,
      decade: num('decade'),
      rating: num('rating'),
      fields,
    },
  }
}

export function serializeQuery(q: LibraryQuery): string {
  const p = new URLSearchParams()
  if (q.q) p.set('q', q.q)
  if (q.sort !== savedSort()) p.set('sort', q.sort)
  const f = q.filters
  for (const k of ['folder', 'format', 'tag', 'genre', 'style', 'decade', 'rating'] as const) {
    if (f[k] !== undefined && f[k] !== '') p.set(k, String(f[k]))
  }
  for (const [id, v] of Object.entries(f.fields)) p.set(`f.${id}`, v)
  return p.toString()
}

export const activeFilterCount = (f: Filters) =>
  (['folder', 'format', 'tag', 'genre', 'style', 'decade', 'rating'] as const).filter((k) => f[k] !== undefined).length +
  Object.keys(f.fields).length

// ---- filtering ----

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export const decadeOf = (year: number) => (year ? Math.floor(year / 10) * 10 : 0)

// search text per item, worked out once per item object
const haystacks = new WeakMap<LibraryItem, string>()

function haystack(i: LibraryItem): string {
  let h = haystacks.get(i)
  if (h === undefined) {
    h = fold([i.title, i.artist, i.label, i.catno, i.year || '', i.format, ...i.genres, ...i.styles, ...Object.values(i.fields)].join(' '))
    haystacks.set(i, h)
  }
  return h
}

type FacetKey = keyof Omit<Filters, 'fields'> | `field:${number}`

function passes(i: LibraryItem, f: Filters, skip?: FacetKey): boolean {
  if (skip !== 'folder' && f.folder !== undefined && i.folderId !== f.folder) return false
  if (skip !== 'format' && f.format && !i.formatNames.includes(f.format)) return false
  if (skip !== 'tag' && f.tag && !i.formatTags.includes(f.tag)) return false
  if (skip !== 'genre' && f.genre && !i.genres.includes(f.genre)) return false
  if (skip !== 'style' && f.style && !i.styles.includes(f.style)) return false
  if (skip !== 'decade' && f.decade !== undefined && decadeOf(i.year) !== f.decade) return false
  if (skip !== 'rating' && f.rating && i.rating < f.rating) return false
  for (const [id, v] of Object.entries(f.fields)) {
    if (skip === `field:${id}`) continue
    if ((i.fields[Number(id)] ?? '') !== v) return false
  }
  return true
}

function matchesText(i: LibraryItem, words: string[]): boolean {
  if (!words.length) return true
  const h = haystack(i)
  return words.every((w) => h.includes(w))
}

const wordsOf = (q: string) => fold(q).split(/\s+/).filter(Boolean)

export function filterItems(items: LibraryItem[], q: LibraryQuery): LibraryItem[] {
  const words = wordsOf(q.q)
  return items.filter((i) => matchesText(i, words) && passes(i, q.filters))
}

// ---- sorting and grouping ----

// "The Beatles" sorts under B
export const sortName = (s: string) => fold(s).replace(/^(the|a|an)\s+/, '')

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })

// Some sorts need data that lives outside the library: prices, plays, the location field
export type SortContext = {
  value?: (i: LibraryItem) => number | undefined
  money?: (n: number) => string
  plays?: (i: LibraryItem) => number
  lastPlayed?: (i: LibraryItem) => number | undefined
  location?: (i: LibraryItem) => string | undefined
}

export function sortItems(items: LibraryItem[], sort: SortKey, ctx: SortContext = {}): LibraryItem[] {
  const out = [...items]
  const tie = (a: LibraryItem, b: LibraryItem) =>
    byText(sortName(a.artist), sortName(b.artist)) || byText(sortName(a.title), sortName(b.title))
  const cmp: Record<SortKey, (a: LibraryItem, b: LibraryItem) => number> = {
    added: (a, b) => b.dateAdded.localeCompare(a.dateAdded),
    'added-old': (a, b) => a.dateAdded.localeCompare(b.dateAdded),
    artist: (a, b) => tie(a, b) || a.year - b.year,
    title: (a, b) => byText(sortName(a.title), sortName(b.title)) || tie(a, b),
    // unknown years go last either way
    year: (a, b) => (b.year || -1) - (a.year || -1) || tie(a, b),
    'year-old': (a, b) => (a.year || 9999) - (b.year || 9999) || tie(a, b),
    rating: (a, b) => b.rating - a.rating || tie(a, b),
    // unpriced last
    value: (a, b) => (ctx.value?.(b) ?? -1) - (ctx.value?.(a) ?? -1) || tie(a, b),
    plays: (a, b) => (ctx.plays?.(b) ?? 0) - (ctx.plays?.(a) ?? 0) || tie(a, b),
    played: (a, b) => (ctx.lastPlayed?.(b) ?? 0) - (ctx.lastPlayed?.(a) ?? 0) || tie(a, b),
    // no location last
    location: (a, b) => byText(ctx.location?.(a) || '\uffff', ctx.location?.(b) || '\uffff') || tie(a, b),
  }
  return out.sort(cmp[sort])
}

export type Group = { key: string; label: string; items: LibraryItem[] }

const letter = (s: string) => {
  const c = sortName(s).charAt(0).toUpperCase()
  return /[A-Z]/.test(c) ? c : '#'
}

function groupLabel(i: LibraryItem, sort: SortKey, ctx: SortContext): string {
  switch (sort) {
    case 'added':
    case 'added-old': {
      const d = new Date(i.dateAdded)
      return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    }
    case 'artist':
      return letter(i.artist)
    case 'title':
      return letter(i.title)
    case 'year':
    case 'year-old':
      return i.year ? `${decadeOf(i.year)}s` : 'Year unknown'
    case 'rating':
      return i.rating ? `${'★'.repeat(i.rating)}` : 'Not rated'
    case 'value':
      return ctx.value && ctx.money ? valueBracket(ctx.value(i), ctx.money) : ''
    case 'plays': {
      const n = ctx.plays?.(i) ?? 0
      return n >= 10
        ? 'Played 10+ times'
        : n >= 5
          ? 'Played 5 to 9 times'
          : n >= 2
            ? 'Played 2 to 4 times'
            : n === 1
              ? 'Played once'
              : 'Never played'
    }
    case 'played': {
      const t = ctx.lastPlayed?.(i)
      return t ? new Date(t).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'Never played'
    }
    case 'location':
      return ctx.location?.(i)?.trim() || 'No location'
  }
}

// Items must already be sorted; consecutive items with the same label share a group
export function groupItems(items: LibraryItem[], sort: SortKey, ctx: SortContext = {}): Group[] {
  const groups: Group[] = []
  for (const i of items) {
    const label = groupLabel(i, sort, ctx)
    const last = groups.at(-1)
    if (last?.label === label) last.items.push(i)
    else groups.push({ key: `${label}-${groups.length}`, label, items: [i] })
  }
  return groups
}

// ---- facets ----

export type FacetOption = { value: string; label: string; count: number }

function count(values: string[][]): FacetOption[] {
  const m = new Map<string, number>()
  for (const vs of values) for (const v of new Set(vs)) m.set(v, (m.get(v) ?? 0) + 1)
  return [...m.entries()]
    .map(([value, n]) => ({ value, label: value, count: n }))
    .sort((a, b) => b.count - a.count || byText(a.value, b.value))
}

export type Facets = {
  folder: FacetOption[]
  format: FacetOption[]
  tag: FacetOption[]
  genre: FacetOption[]
  style: FacetOption[]
  decade: FacetOption[]
  rating: FacetOption[]
  fields: { field: CollectionField; options: FacetOption[] }[]
}

const MAX_FIELD_VALUES = 40 // free-text fields with more values than this aren't useful as filters

// Counts for each filter, ignoring that filter itself, so you can see what
// switching to another value would give.
export function facets(items: LibraryItem[], q: LibraryQuery, folders: Folder[], fields: CollectionField[]): Facets {
  const words = wordsOf(q.q)
  const base = items.filter((i) => matchesText(i, words))
  const without = (k: FacetKey) => base.filter((i) => passes(i, q.filters, k))
  const folderName = new Map(folders.map((f) => [String(f.id), f.name]))

  const decade = count(without('decade').map((i) => [String(decadeOf(i.year))]))
    .map((o) => ({ ...o, label: o.value === '0' ? 'Unknown' : `${o.value}s` }))
    .sort((a, b) => Number(b.value) - Number(a.value))

  const rating = [5, 4, 3, 2, 1].map((n) => ({
    value: String(n),
    label: n === 5 ? '★★★★★' : `${'★'.repeat(n)} and up`,
    count: without('rating').filter((i) => i.rating >= n).length,
  }))

  return {
    // every crate, even empty ones, so any of them can be picked
    folder: (() => {
      const counted = new Map(count(without('folder').map((i) => [String(i.folderId)])).map((o) => [o.value, o.count]))
      const ids = new Set([...folders.map((f) => String(f.id)), ...counted.keys()])
      return [...ids]
        .map((id) => ({ value: id, label: folderName.get(id) ?? 'Crate', count: counted.get(id) ?? 0 }))
        .sort((a, b) => b.count - a.count || byText(a.label, b.label))
    })(),
    format: count(without('format').map((i) => i.formatNames)),
    tag: count(without('tag').map((i) => i.formatTags)),
    genre: count(without('genre').map((i) => i.genres)),
    style: count(without('style').map((i) => i.styles)),
    decade,
    rating: rating.filter((r) => r.count > 0),
    fields: fields
      .map((field) => ({
        field,
        options: count(without(`field:${field.id}`).map((i) => (i.fields[field.id] ? [i.fields[field.id]] : []))),
      }))
      .filter((f) => f.options.length > 0 && f.options.length <= MAX_FIELD_VALUES),
  }
}

// ---- export ----

const csvCell = (v: string | number) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Same columns as the Discogs collection export, so the file opens the same way
export function toCsv(items: LibraryItem[], folders: Folder[], fields: CollectionField[]): string {
  const folderName = new Map(folders.map((f) => [f.id, f.name]))
  const head = [
    'Catalog#',
    'Artist',
    'Title',
    'Label',
    'Format',
    'Rating',
    'Released',
    'release_id',
    'CollectionFolder',
    'Date Added',
    ...fields.map((f) => `Collection ${f.name}`),
  ]
  const rows = items.map((i) => [
    i.catno ?? '',
    i.artist,
    i.title,
    i.label ?? '',
    i.format,
    i.rating || '',
    i.year || '',
    i.releaseId,
    folderName.get(i.folderId) ?? '',
    i.dateAdded.replace('T', ' ').slice(0, 19),
    ...fields.map((f) => i.fields[f.id] ?? ''),
  ])
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
}
