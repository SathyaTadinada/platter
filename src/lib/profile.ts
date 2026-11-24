import type { Section, Sections } from '../../worker/profile'
import { db, type LibraryItem, type WantItem } from '../db/db'
import type { CollectionField } from '../api/discogs/types'
import { fieldFor, type FieldKey, type FieldMatch } from './fields'
import type { CloudApi, ProfileRow, SetupSlot } from './cloud'
import { byText, decadeOf, DESCENDING, fold, SORTS, sortName, wordsOf, yearOf, type SortKey } from './library'
import { libraryItems } from './masters'
import { knownPlayFields, listening, listeningStats, type Play } from './plays'
import { byMonth, localDate, type MonthTotal } from './value'
import { reviewYears, yearReview } from './yearReview'

// Publishing a profile: the owner's devices send what each switched-on section shows, and nothing
// else. Release details are Discogs' catalog data, which can be kept; the owner's own ratings and
// field values (condition, notes, what they paid) only go when they pick them in Your copy.
//
// Each device remembers what it last sent, row by row, so a pass sends only the rows that changed
// and takes down the ones that are gone, rather than writing the whole section again. The first
// pass, and one a week after that, sends everything and sweeps whatever it didn't send, which also
// clears out anything another device left behind.

export const SENT = 'profileSent'
const FULL_EVERY = 7 * 24 * 60 * 60_000
// mark: the whole section's fingerprint. rows: each row's, by key. full: when everything last went up.
type SentSection = { mark: string; rows: Record<string, string>; full: number }
type Sent = Partial<Record<Section, SentSection>> & { about?: string }

// What a visitor sees for one record: Discogs' catalog details and its cover, as a Discogs link, and
// whatever the owner picked to show about their copy.
export type ProfileItem = {
  id: number
  title: string
  artist: string
  year?: number
  label?: string
  format?: string
  thumb?: string
  cover?: string
  copy?: CopyDetails // only what the owner chose to show, and only what's filled in
}

// Details about the owner's own copy, when they chose to show some: their rating, and fields from
// their Discogs collection by name, in their field order
// Each field goes with its name and, where Platter knows what it's for (condition, price, notes…),
// that role, so someone else's fields can be matched to theirs whatever they're called
export type CopyDetails = { rating?: number; fields?: CopyField[] }
type CopyField = [name: string, value: string, role?: FieldKey]

// Which details go up: 'rating' and field ids, with each field's name and any role
export type CopyChoice = { details: string[]; names: Record<number, string>; roles?: Record<number, FieldKey> }

function copyOf(r: LibraryItem, choice?: CopyChoice): CopyDetails | undefined {
  if (!choice?.details.length) return undefined
  const copy: CopyDetails = {}
  if (choice.details.includes('rating') && r.rating) copy.rating = r.rating
  const fields = Object.keys(choice.names)
    .map(Number)
    .filter((id) => choice.details.includes(String(id)) && r.fields[id]?.trim())
    .map((id): CopyField =>
      choice.roles?.[id] ? [choice.names[id], r.fields[id].trim(), choice.roles[id]] : [choice.names[id], r.fields[id].trim()],
    )
  if (fields.length) copy.fields = fields
  return copy.rating || copy.fields ? copy : undefined
}

// what their devices send with their picture; playing only while they've chosen to show it
export type ProfileAbout = { avatar?: string; records?: number; playing?: { item: ProfileBrief; at: number } }

// A record in a list on a profile: just enough to show it and open it
export type ProfileBrief = Pick<ProfileItem, 'id' | 'title' | 'artist' | 'thumb'>
type ProfileCount = { label: string; count: number }

// The Stats section: the Listening view, and the collection by count, since prices aren't shared
export type ProfileStats = {
  records: number
  played: number // records played at least once
  playsByMonth: MonthTotal[]
  mostPlayed: { item: ProfileBrief; count: number }[]
  recent: { item: ProfileBrief; at: number }[]
  addedByMonth: MonthTotal[]
  genres: ProfileCount[]
  decades: ProfileCount[]
}

// One year of the Your year section. Raw facts rather than sentences, so they read in the visitor's
// own language and date format. What the owner spent stays off it.
export type ProfileYear = {
  year: number
  added: number
  newest: ProfileBrief[] // newest first
  addedByMonth: MonthTotal[]
  plays: number
  played: number
  hours: number
  playsByMonth: MonthTotal[]
  topRecords: { item: ProfileBrief; count: number }[]
  topArtists: { name: string; count: number }[]
  genre?: string
  decade?: number
  busiestDay?: number
  first?: { item: ProfileBrief; date: string }
  latest?: { item: ProfileBrief; date: string }
  oldest?: { item: ProfileBrief; year: number }
}

const item = (r: LibraryItem, choice?: CopyChoice): ProfileItem => ({
  copy: copyOf(r, choice),
  id: r.releaseId,
  title: r.title,
  artist: r.artist,
  year: r.originalYear || r.year || undefined,
  label: r.label,
  format: r.format,
  thumb: r.thumb,
  cover: r.cover,
})

const brief = (r: LibraryItem): ProfileBrief => ({ id: r.releaseId, title: r.title, artist: r.artist, thumb: r.thumb })

const want = (w: WantItem): ProfileItem => ({
  id: w.releaseId,
  title: w.title ?? 'Unknown release',
  artist: w.artist ?? '',
  year: w.year || undefined,
  format: w.format,
  thumb: w.thumb,
})

// The server pages through a section in key order, and a profile shows the newest first, so the key
// counts down from a date far in the future. It depends only on the record, so adding one doesn't
// move any of the others.
const UNTIL = 4_000_000_000_000 // some time in 2096
// When a record was added, read back from its key
export const addedAt = (key: string) => UNTIL - Number(key.split(':')[0])

const keyOf = (added: string | undefined, id: number) =>
  `${String(UNTIL - (added ? Date.parse(added) || 0 : 0)).padStart(13, '0')}:${String(id).padStart(10, '0')}`

function itemRows(items: LibraryItem[], choice?: CopyChoice): Omit<ProfileRow, 'updatedAt'>[] {
  return items.map((r) => ({ kind: 'item', key: keyOf(r.dateAdded, r.instanceId), value: JSON.stringify(item(r, choice)) }))
}

async function wantRows(): Promise<Omit<ProfileRow, 'updatedAt'>[]> {
  const all = await db.wants.toArray()
  return all.map((w) => ({ kind: 'want', key: keyOf(w.dateAdded, w.releaseId), value: JSON.stringify(want(w)) }))
}

const TOP = 8
const NEWEST = 6

function counted(labels: string[], top = TOP): ProfileCount[] {
  const counts = new Map<string, number>()
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1)
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([label, count]) => ({ label, count }))
}

function statsRows(items: LibraryItem[], plays: Play[]): Omit<ProfileRow, 'updatedAt'>[] | null {
  // until the play count fields are known, Stats waits, rather than going up with only the plays
  // logged in Platter and then changing
  const playFieldIds = knownPlayFields()
  if (!playFieldIds) return null
  const s = listeningStats(listening(items, plays, playFieldIds))
  const decades = items.map(yearOf).filter(Boolean)
  const stats: ProfileStats = {
    records: items.length,
    played: s.mostPlayed.length,
    playsByMonth: byMonth(
      plays.map((p) => ({ date: localDate(p.at), amount: 1 })),
      12,
    ),
    mostPlayed: s.mostPlayed.slice(0, TOP).map((r) => ({ item: brief(r.item), count: r.count })),
    recent: s.recent.slice(0, TOP).map((r) => ({ item: brief(r.item), at: r.last! })),
    addedByMonth: byMonth(
      items.map((i) => ({ date: i.dateAdded, amount: 1 })),
      12,
    ),
    genres: counted(items.flatMap((i) => i.genres)),
    // in order, oldest first, since that's how decades read
    decades: counted(
      decades.map((y) => `${decadeOf(y)}s`),
      Infinity,
    ).sort((a, b) => parseInt(a.label) - parseInt(b.label)),
  }
  return [{ kind: 'stats', key: 'summary', value: JSON.stringify(stats) }]
}

async function yearRows(items: LibraryItem[], plays: Play[]): Promise<Omit<ProfileRow, 'updatedAt'>[]> {
  const lengths = await db.lengths.toArray()
  const times = new Map(lengths.map((l) => [l.releaseId, l]))
  return reviewYears(items, plays).flatMap((year) => {
    // without the paid field, what was spent and the biggest buy aren't worked out at all
    const r = yearReview(year, items, plays, times)
    if (!r.added.length && !r.plays) return []
    const first = r.added[0]
    const latest = r.added.at(-1)
    const y: ProfileYear = {
      year,
      added: r.added.length,
      newest: [...r.added].reverse().slice(0, NEWEST).map(brief),
      addedByMonth: r.addedByMonth,
      plays: r.plays,
      played: r.played,
      hours: r.hours,
      playsByMonth: r.playsByMonth,
      topRecords: r.topRecords.map((t) => ({ item: brief(t.item), count: t.count })),
      topArtists: r.topArtists,
      genre: r.genres[0]?.name,
      decade: r.decade,
      busiestDay: r.busiestDay,
      first: first && { item: brief(first), date: first.dateAdded },
      latest: latest && latest !== first ? { item: brief(latest), date: latest.dateAdded } : undefined,
      oldest: r.oldest && r.added.length > 1 ? { item: brief(r.oldest.item), year: r.oldest.year } : undefined,
    }
    return [{ kind: 'year', key: String(year), value: JSON.stringify(y) }]
  })
}

// Short and cheap: a section is only sent again when something in it changed
async function fingerprint(rows: { key: string; value: string }[]): Promise<string> {
  const text = rows
    .map((r) => `${r.key}\u0000${r.value}`)
    .sort()
    .join('\u0001')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// A row's fingerprint, to tell whether it changed: quick rather than secure (cyrb53)
function rowMark(value: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

const PAGE = 200 // the server takes this many rows at a time

export type Publisher = Pick<CloudApi, 'publishProfile' | 'sweepProfile' | 'unpublishProfile'>

async function send(api: Publisher, rows: Omit<ProfileRow, 'updatedAt'>[], at: number) {
  for (let i = 0; i < rows.length; i += PAGE) {
    await api.publishProfile(rows.slice(i, i + PAGE).map((r) => ({ ...r, updatedAt: at })))
  }
}

// Sends what's changed in the sections that are on, and their picture while there's a profile to
// show it on (open: it isn't Private). Returns what it sent.
export async function publishProfile(
  api: Publisher,
  sections: Sections,
  about: ProfileAbout,
  at = Date.now(),
  choice?: CopyChoice,
  open = false,
): Promise<(Section | 'about')[]> {
  const sent = ((await db.settings.get(SENT))?.value as Sent | undefined) ?? {}
  const next: Sent = { ...sent }
  const done: (Section | 'about')[] = []

  // the collection and plays, read once for every section that needs them
  const on = (x: Section) => sections[x] === 'public'
  const items = on('collection') || on('stats') || on('year') ? await libraryItems() : []
  const plays = on('stats') || on('year') ? await db.plays.toArray() : []

  // build gives null when it can't say yet, which leaves the section as it was
  type Rows = Omit<ProfileRow, 'updatedAt'>[] | null
  const pass = async (section: Section, build: () => Rows | Promise<Rows>) => {
    if (sections[section] !== 'public') {
      delete next[section] // switched off, so the next time it goes on everything goes up again
      return
    }
    const rows = await build()
    if (!rows) return
    const mark = await fingerprint(rows)
    // (what an older version kept was just the mark, a string, which counts as nothing sent)
    const before = typeof sent[section] === 'object' ? sent[section] : undefined
    if (mark === before?.mark) return
    const marks = Object.fromEntries(rows.map((r) => [r.key, rowMark(r.value)]))
    if (!before || at - before.full >= FULL_EVERY) {
      await send(api, rows, at)
      await api.sweepProfile(section, at)
      next[section] = { mark, rows: marks, full: at }
    } else {
      await send(
        api,
        rows.filter((r) => before.rows[r.key] !== marks[r.key]),
        at,
      )
      const gone = Object.keys(before.rows).filter((k) => !(k in marks))
      for (let i = 0; i < gone.length; i += PAGE) await api.unpublishProfile(section, gone.slice(i, i + PAGE))
      next[section] = { mark, rows: marks, full: before.full }
    }
    done.push(section)
  }

  await pass('collection', () => itemRows(items, choice))
  await pass('wantlist', wantRows)
  await pass('stats', () => statsRows(items, plays))
  await pass('year', () => yearRows(items, plays))

  if (await aboutPass(api, sections, about, at, open, sent, next)) done.push('about')
  await db.settings.put({ key: SENT, value: next })
  return done
}

// The picture, record count, and record last played: one small row, sent when it changed
async function aboutPass(api: Publisher, sections: Sections, about: ProfileAbout, at: number, open: boolean, sent: Sent, next: Sent) {
  const anything = open || Object.values(sections).some((v) => v === 'public')
  const value = JSON.stringify(about)
  const mark = await fingerprint([{ key: 'about', value }])
  if (!anything) {
    delete next.about
    return false
  }
  if (mark === sent.about) return false
  await api.publishProfile([{ kind: 'about', key: 'about', value, updatedAt: at }])
  next.about = mark
  return true
}

// Just that row, between full passes, so the record last played goes up soon after it's played
export async function publishAbout(api: Publisher, sections: Sections, about: ProfileAbout, at = Date.now(), open = false) {
  const sent = ((await db.settings.get(SENT))?.value as Sent | undefined) ?? {}
  const next: Sent = { ...sent }
  if (!(await aboutPass(api, sections, about, at, open, sent, next))) return false
  await db.settings.put({ key: SENT, value: next })
  return true
}

// Every row each switched-on section would show, built here rather than read from the server, for
// the demo, whose profile never goes anywhere
export async function localProfile(sections: Sections, choice?: CopyChoice): Promise<Omit<ProfileRow, 'updatedAt'>[]> {
  const on = (x: Section) => sections[x] === 'public'
  const items = await libraryItems()
  const plays = await db.plays.toArray()
  return [
    ...(on('collection') ? itemRows(items, choice) : []),
    ...(on('wantlist') ? await wantRows() : []),
    ...(on('stats') ? (statsRows(items, plays) ?? []) : []),
    ...(on('year') ? await yearRows(items, plays) : []),
  ]
}

// After the sections change, so the next pass sends a section that has just gone back on
export async function forgetSent(sections: Sections) {
  const sent = ((await db.settings.get(SENT))?.value as Sent | undefined) ?? {}
  const next = Object.fromEntries(Object.entries(sent).filter(([k]) => k === 'about' || sections[k as Section] === 'public'))
  await db.settings.put({ key: SENT, value: next })
}

// ---- copying someone's details into yours ----

// plays come from logging them, and a loan is the owner's own business
const NOT_COPIED: FieldKey[] = ['playCount', 'lastPlayed', 'lentTo']
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '')

export type Copyable = { key: string; label: string; value: string; to: number | 'rating' }

// Which of someone's copy details can go into yours, and into which of your fields: by what the field
// is for when both sides know, otherwise by name. A dropdown only takes one of its own options.
export function copyable(copy: CopyDetails | undefined, mine: CollectionField[], matches: FieldMatch[]): Copyable[] {
  if (!copy) return []
  const out: Copyable[] = []
  if (copy.rating) out.push({ key: 'rating', label: 'Rating', value: '★'.repeat(copy.rating), to: 'rating' })
  const used = new Set<number>()
  for (const [name, value, role] of copy.fields ?? []) {
    if (role && NOT_COPIED.includes(role)) continue
    const field = (role ? fieldFor(matches, role) : null) ?? mine.find((f) => norm(f.name) === norm(name)) ?? null
    if (!field || used.has(field.id)) continue
    const mineFor = matches.find((m) => m.field?.id === field.id)?.spec.key
    if (mineFor && NOT_COPIED.includes(mineFor)) continue
    const fits = field.type === 'dropdown' ? field.options.find((o) => norm(o) === norm(value)) : value
    if (!fits) continue
    used.add(field.id)
    out.push({ key: `f${field.id}`, label: name, value: fits, to: field.id })
  }
  return out
}

// Where a record from someone's profile opens: the record page, with their copy on it when they show one
// The record they last logged a play of, for a profile that shows it
export async function lastPlayed(): Promise<{ item: ProfileBrief; at: number } | undefined> {
  const play = await db.plays.orderBy('at').last()
  const item = play && (await db.collection.get(play.instanceId))
  return play && item ? { item: brief(item), at: play.at } : undefined
}

// A setup's slots in the order they show, as worker/profile has them
export const SETUP_LABELS = [
  ['turntable', 'Turntable'],
  ['cartridge', 'Cartridge'],
  ['preamp', 'Phono preamp'],
  ['amp', 'Amp'],
  ['speakers', 'Speakers'],
] as const satisfies readonly (readonly [SetupSlot, string])[]
export const BIO_MAX = 160
export const SETUP_MAX = 60
// as the server checks it, so the reason shows before anything's sent
export const hasLink = (text: string) => /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|me|ly|xyz|app|shop|store|link)\b/i.test(text)

// The copy a record on a profile is, read back from its key, for opening your own one as yours
// The sorts someone else's records can have: nothing private is published, so no ratings, plays,
// or prices to sort by
export const SHELF_SORTS = SORTS.filter((s) => ['added', 'artist', 'title', 'year'].includes(s.key))

export type ShelfRow = { key: string; item: ProfileItem }

// Someone's collection or wantlist, searched and sorted in the browser. Keys count down, so key order
// is newest first, and it breaks ties.
export function arrangeShelf(rows: ShelfRow[], q: string, sort: SortKey, reversed: boolean): ShelfRow[] {
  const words = wordsOf(q)
  const found = words.length
    ? rows.filter(({ item }) => {
        const h = fold(`${item.artist} ${item.title} ${item.label ?? ''}`)
        return words.every((w) => h.includes(w))
      })
    : rows
  const newest = (a: ShelfRow, b: ShelfRow) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  const byArtist = (a: ShelfRow, b: ShelfRow) => byText(sortName(a.item.artist), sortName(b.item.artist))
  // ties always run A to Z, so reversing the artist sort still lists each artist's records A to Z
  const tie = (a: ShelfRow, b: ShelfRow) =>
    byArtist(a, b) || byText(sortName(a.item.title), sortName(b.item.title)) || (a.item.year ?? 0) - (b.item.year ?? 0)
  // low to high, or A to Z
  const ascending = {
    added: (a: ShelfRow, b: ShelfRow) => newest(b, a),
    artist: byArtist,
    title: (a: ShelfRow, b: ShelfRow) => byText(sortName(a.item.title), sortName(b.item.title)),
    year: (a: ShelfRow, b: ShelfRow) => (a.item.year ?? 0) - (b.item.year ?? 0),
  }[sort as 'added' | 'artist' | 'title' | 'year']
  if (!ascending) return found
  const dir = DESCENDING[sort] !== reversed ? -1 : 1
  // records without a year go last, whichever way it runs
  const yearless = (r: ShelfRow) => Number(sort === 'year' && !r.item.year)
  return [...found].sort((a, b) => yearless(a) - yearless(b) || dir * ascending(a, b) || tie(a, b) || newest(a, b))
}

export const instanceOf = (key: string) => Number(key.split(':')[1])

export const recordFrom = (item: ProfileItem, owner: string, key: string) =>
  item.copy ? `/release/${item.id}?from=${encodeURIComponent(owner)}&copy=${encodeURIComponent(key)}` : `/release/${item.id}`
