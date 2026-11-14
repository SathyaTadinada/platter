import type { CollectionField, CollectionItem, Folder, Release, SearchResult, WantItem as ApiWant } from '../api/discogs/types'
import type { LibraryItem, WantItem } from '../db/db'
import { ALL_MEDIA, cleanArtist, cleanLabel, describeFormats, realImage, splitTitle } from './format'
import { fieldFor, matchFields } from './fields'
import { loanName } from './loans'
import { formatDay } from './time'
import { parseMoney, PRICE_RANGES, rangeLabel, valueBracket } from './value'
import { readPref, writePref } from './prefs'

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

export type SortKey = 'added' | 'artist' | 'title' | 'year' | 'rating' | 'value' | 'paid' | 'plays' | 'played' | 'location'

// Each sort starts in the direction people usually want; picking it again reverses it.
// order: what the first and the reversed direction are called.
export const SORTS: { key: SortKey; label: string; order: [string, string] }[] = [
  { key: 'added', label: 'Added', order: ['Newest first', 'Oldest first'] },
  { key: 'artist', label: 'Artist', order: ['A to Z', 'Z to A'] },
  { key: 'title', label: 'Title', order: ['A to Z', 'Z to A'] },
  { key: 'year', label: 'Release year', order: ['Newest first', 'Oldest first'] },
  { key: 'rating', label: 'Rating', order: ['Highest first', 'Lowest first'] },
  { key: 'value', label: 'Value', order: ['Highest first', 'Lowest first'] },
  { key: 'paid', label: 'Paid', order: ['Highest first', 'Lowest first'] },
  { key: 'plays', label: 'Plays', order: ['Most first', 'Fewest first'] },
  { key: 'played', label: 'Last played', order: ['Most recent first', 'Least recent first'] },
  { key: 'location', label: 'Location', order: ['A to Z', 'Z to A'] },
]

// Whether a sort's first direction runs from high to low (newest, highest, most)
export const DESCENDING: Record<SortKey, boolean> = {
  added: true,
  artist: false,
  title: false,
  year: true,
  rating: true,
  value: true,
  paid: true,
  plays: true,
  played: true,
  location: false,
}

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

export type LibraryQuery = { q: string; sort: SortKey; reversed: boolean; filters: Filters }

export const emptyQuery = (): LibraryQuery => ({ q: '', sort: 'added', reversed: false, filters: { fields: {} } })

// A sort as one string, for the URL and the saved choice: "artist", or "artist-rev" reversed.
// "added-old" and "year-old" are how the reversed ones were saved before.
export const sortParam = (sort: SortKey, reversed: boolean) => (reversed ? `${sort}-rev` : sort)

export function parseSort(v: string | null): { sort: SortKey; reversed: boolean } | null {
  if (!v) return null
  const m = /^([a-z]+)(-rev|-old)?$/.exec(v)
  const sort = SORTS.find((s) => s.key === m?.[1])?.key
  return sort ? { sort, reversed: Boolean(m![2]) } : null
}

// The sort picked last time is the default, so it sticks without living in the URL
const SORT_KEY = 'platter.sort'

const savedSort = () => parseSort(readPref(SORT_KEY)) ?? { sort: 'added' as SortKey, reversed: false }
export const saveSort = (sort: SortKey, reversed: boolean) => writePref(SORT_KEY, sortParam(sort, reversed))

export function parseQuery(search: string): LibraryQuery {
  const p = new URLSearchParams(search)
  const num = (k: string) => (p.get(k) ? Number(p.get(k)) : undefined)
  const fields: Record<number, string> = {}
  for (const [k, v] of p) if (k.startsWith('f.')) fields[Number(k.slice(2))] = v
  const { sort, reversed } = parseSort(p.get('sort')) ?? savedSort()
  return {
    q: p.get('q') ?? '',
    sort,
    reversed,
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
  const saved = savedSort()
  if (q.sort !== saved.sort || q.reversed !== saved.reversed) p.set('sort', sortParam(q.sort, q.reversed))
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

// When the music is from: the album's original year where known, else this pressing's
export const yearOf = (i: Pick<LibraryItem, 'year' | 'originalYear'>) => i.originalYear || i.year

// search text per item, worked out once per item object
const haystacks = new WeakMap<LibraryItem, string>()

function haystack(i: LibraryItem): string {
  let h = haystacks.get(i)
  if (h === undefined) {
    h = fold(
      [
        i.title,
        i.artist,
        i.label,
        i.catno,
        i.year || '',
        i.originalYear ?? '',
        i.format,
        ...i.genres,
        ...i.styles,
        ...Object.values(i.fields),
      ].join(' '),
    )
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
  if (skip !== 'decade' && f.decade !== undefined && decadeOf(yearOf(i)) !== f.decade) return false
  if (skip !== 'rating' && f.rating && i.rating < f.rating) return false
  for (const [id, v] of Object.entries(f.fields)) {
    if (skip === `field:${id}`) continue
    const value = i.fields[Number(id)] ?? ''
    const range = priceRange(v)
    if (range ? !inRange(parseMoney(value), range) : loanName(value) !== v) return false
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
  paid?: (i: LibraryItem) => number | undefined // what was typed into the purchase price field
  money?: (n: number) => string
  plays?: (i: LibraryItem) => number
  lastPlayed?: (i: LibraryItem) => number | undefined
  location?: (i: LibraryItem) => string | undefined
}

export function sortItems(items: LibraryItem[], sort: SortKey, ctx: SortContext = {}, reversed = false): LibraryItem[] {
  const tie = (a: LibraryItem, b: LibraryItem) =>
    byText(sortName(a.artist), sortName(b.artist)) || byText(sortName(a.title), sortName(b.title))
  const num = (f: (i: LibraryItem) => number | undefined) => (a: LibraryItem, b: LibraryItem) => (f(a) ?? 0) - (f(b) ?? 0)
  // low to high, or A to Z
  const ascending: Record<SortKey, (a: LibraryItem, b: LibraryItem) => number> = {
    added: (a, b) => a.dateAdded.localeCompare(b.dateAdded),
    artist: (a, b) => tie(a, b) || yearOf(a) - yearOf(b),
    title: (a, b) => byText(sortName(a.title), sortName(b.title)),
    year: num(yearOf),
    rating: num((i) => i.rating),
    value: num((i) => ctx.value?.(i)),
    paid: num((i) => ctx.paid?.(i)),
    plays: num((i) => ctx.plays?.(i)),
    played: num((i) => ctx.lastPlayed?.(i)),
    location: (a, b) => byText(ctx.location?.(a) ?? '', ctx.location?.(b) ?? ''),
  }
  // records missing what's sorted on go last, whichever way it runs
  const missing: Partial<Record<SortKey, (i: LibraryItem) => boolean>> = {
    year: (i) => !yearOf(i),
    rating: (i) => !i.rating,
    value: (i) => ctx.value?.(i) === undefined,
    paid: (i) => ctx.paid?.(i) === undefined,
    played: (i) => !ctx.lastPlayed?.(i),
    location: (i) => !ctx.location?.(i)?.trim(),
  }
  const dir = DESCENDING[sort] !== reversed ? -1 : 1
  const gone = missing[sort]
  return [...items].sort((a, b) => (gone ? Number(gone(a)) - Number(gone(b)) : 0) || dir * ascending[sort](a, b) || tie(a, b))
}

export type Group = { key: string; label: string; items: LibraryItem[] }

const letter = (s: string) => {
  const c = sortName(s).charAt(0).toUpperCase()
  return /[A-Z]/.test(c) ? c : '#'
}

function groupLabel(i: LibraryItem, sort: SortKey, ctx: SortContext): string {
  switch (sort) {
    case 'added': {
      const d = new Date(i.dateAdded)
      return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    }
    case 'artist':
      return letter(i.artist)
    case 'title':
      return letter(i.title)
    case 'year':
      return yearOf(i) ? `${decadeOf(yearOf(i))}s` : 'Year unknown'
    case 'rating':
      return i.rating ? `${'★'.repeat(i.rating)}` : 'Not rated'
    case 'value':
      return ctx.value && ctx.money ? valueBracket(ctx.value(i), ctx.money) : ''
    case 'paid': {
      const n = ctx.paid?.(i)
      return n === undefined ? 'No price paid' : ctx.money ? valueBracket(n, ctx.money) : ''
    }
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

// a purchase price filter is a range, like "range:10-20" or "range:100-"
const priceRange = (v: string): [number, number] | undefined => {
  const m = /^range:(\d+)-(\d*)$/.exec(v)
  return m ? [Number(m[1]), m[2] ? Number(m[2]) : Infinity] : undefined
}
const inRange = (n: number | undefined, [lo, hi]: [number, number]) => n !== undefined && n >= lo && n < hi

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
export function facets(
  items: LibraryItem[],
  q: LibraryQuery,
  folders: Folder[],
  fields: CollectionField[],
  money: (n: number) => string = String,
): Facets {
  const words = wordsOf(q.q)
  const base = items.filter((i) => matchesText(i, words))
  const without = (k: FacetKey) => base.filter((i) => passes(i, q.filters, k))
  const folderName = new Map(folders.map((f) => [String(f.id), f.name]))
  const matches = matchFields(fields)
  const [playCount, paid] = [fieldFor(matches, 'playCount')?.id, fieldFor(matches, 'purchasePrice')?.id]
  const dates = new Set([fieldFor(matches, 'lastPlayed')?.id, fieldFor(matches, 'purchaseDate')?.id])

  const fieldOptions = (field: CollectionField) => {
    const list = without(`field:${field.id}`)
    // prices go in ranges, as in the By price chart
    if (field.id === paid)
      return PRICE_RANGES.map((r) => ({
        value: `range:${r[0]}-${r[1] === Infinity ? '' : r[1]}`,
        label: rangeLabel(r, money),
        count: list.filter((i) => inRange(parseMoney(i.fields[field.id] ?? ''), r)).length,
      })).filter((o) => o.count > 0)
    const options = count(
      list.map((i) => {
        const v = i.fields[field.id]
        // a play count of 0 is the same as never played; a loan goes by who has it
        return v && !(field.id === playCount && v === '0') ? [loanName(v)] : []
      }),
    )
    // dates read as dates, newest first
    if (dates.has(field.id))
      return options
        .map((o) => (/^\d{4}-\d{2}-\d{2}$/.test(o.value) ? { ...o, label: formatDay(o.value) } : o))
        .sort((a, b) => byText(b.value, a.value))
    return options
  }

  const decade = count(without('decade').map((i) => [String(decadeOf(yearOf(i)))]))
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
      .map((field) => ({ field, options: fieldOptions(field) }))
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
    // Platter's own columns go after Discogs' (only Platter imports collection files anyway).
    // The importer finds columns by name, so new ones can be added on the end; just don't start
    // one with "Collection ", which marks a custom field.
    'master_id',
    'Original Year',
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
    i.masterId || '',
    i.originalYear || '',
  ])
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
}
