import type { Section, Sections } from '../../worker/profile'
import { db, type LibraryItem, type WantItem } from '../db/db'
import type { CloudApi, ProfileRow } from './cloud'
import { decadeOf, yearOf } from './library'
import { libraryItems } from './masters'
import { listening, listeningStats, type Play, type PlayFields } from './plays'
import { byMonth, localDate, type MonthTotal } from './value'
import { reviewYears, yearReview } from './yearReview'

// Publishing a profile: the owner's devices send what each switched-on section shows, and nothing
// else. Release details are Discogs' catalog data, which can be kept; the owner's own ratings,
// notes, conditions, and what they paid never leave the device.
//
// A pass sends every row of a section with the same time on it, then sweeps the ones older than
// that, so a record they no longer have drops off. Passes are rare: each section carries a
// fingerprint of what was last sent, and an unchanged section isn't sent again.

export const SENT = 'profileSent'
type Sent = Partial<Record<Section | 'about', string>>

// What a visitor sees for one record: Discogs' catalog details and its cover, as a Discogs link. Not
// the owner's rating, notes, or condition, which would need a switch of their own to share.
export type ProfileItem = {
  id: number
  title: string
  artist: string
  year?: number
  label?: string
  format?: string
  thumb?: string
  cover?: string
}

export type ProfileAbout = { avatar?: string; records?: number }

// A record in a list on a profile: just enough to show it and open it
export type ProfileBrief = Pick<ProfileItem, 'id' | 'title' | 'artist' | 'thumb'>
export type ProfileCount = { label: string; count: number }

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

const item = (r: LibraryItem): ProfileItem => ({
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

function itemRows(items: LibraryItem[]): Omit<ProfileRow, 'updatedAt'>[] {
  return items.map((r) => ({ kind: 'item', key: keyOf(r.dateAdded, r.instanceId), value: JSON.stringify(item(r)) }))
}

async function wantRows(): Promise<Omit<ProfileRow, 'updatedAt'>[]> {
  const all = await db.wants.toArray()
  return all.map((w) => ({ kind: 'want', key: keyOf(w.dateAdded, w.releaseId), value: JSON.stringify(want(w)) }))
}

// Which Discogs fields hold play counts, once they're known (Shell sets them). Until then Stats waits,
// rather than going up with only the plays logged in Platter and then changing.
let playFieldIds: PlayFields | null = null
export const setPlayFields = (ids: PlayFields | null) => {
  playFieldIds = ids
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

const PAGE = 200 // the server takes this many rows at a time

export type Publisher = Pick<CloudApi, 'publishProfile' | 'sweepProfile'>

async function sendPass(api: Publisher, rows: Omit<ProfileRow, 'updatedAt'>[], section: Section, at: number) {
  for (let i = 0; i < rows.length; i += PAGE) {
    await api.publishProfile(rows.slice(i, i + PAGE).map((r) => ({ ...r, updatedAt: at })))
  }
  await api.sweepProfile(section, at)
}

// Sends what's changed in the sections that are on. Returns the sections it sent.
export async function publishProfile(
  api: Publisher,
  sections: Sections,
  about: ProfileAbout,
  at = Date.now(),
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
    if (mark === sent[section]) return
    await sendPass(api, rows, section, at)
    next[section] = mark
    done.push(section)
  }

  await pass('collection', () => itemRows(items))
  await pass('wantlist', wantRows)
  await pass('stats', () => statsRows(items, plays))
  await pass('year', () => yearRows(items, plays))

  // their Discogs picture, while any section is on
  const anything = Object.values(sections).some((v) => v === 'public')
  const value = JSON.stringify(about)
  const mark = await fingerprint([{ key: 'about', value }])
  if (!anything) delete next.about
  else if (mark !== sent.about) {
    await api.publishProfile([{ kind: 'about', key: 'about', value, updatedAt: at }])
    next.about = mark
    done.push('about')
  }

  await db.settings.put({ key: SENT, value: next })
  return done
}

// After the sections change, so the next pass sends a section that has just gone back on
export async function forgetSent(sections: Sections) {
  const sent = ((await db.settings.get(SENT))?.value as Sent | undefined) ?? {}
  const next = Object.fromEntries(Object.entries(sent).filter(([k]) => k === 'about' || sections[k as Section] === 'public'))
  await db.settings.put({ key: SENT, value: next })
}
