import type { LibraryItem } from '../db/db'
import type { Play } from './plays'
import { stylusUse, type RecordLength } from './stylus'
import { byMonth, localDate, parseMoney, type MonthTotal } from './value'

// A year of the collection: what came in, what got played, and for how long. Plays come from
// the log on this device; the Discogs fields only hold a total and the last date.

export type YearReview = {
  year: number
  added: LibraryItem[] // oldest first
  addedByMonth: MonthTotal[]
  spent?: { total: number; count: number }
  plays: number
  played: number // different records
  hours: number
  estimated: boolean
  playsByMonth: MonthTotal[]
  topRecords: { item: LibraryItem; count: number }[]
  topArtists: { name: string; count: number }[]
  genres: { name: string; count: number }[] // of the records added
  decade?: number // the decade most of the year's plays came from
}

const TOP = 5

function ranked<K>(counts: Map<K, number>, top: number) {
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, top)
}

const bump = <K>(m: Map<K, number>, k: K, n = 1) => m.set(k, (m.get(k) ?? 0) + n)

export function yearReview(
  year: number,
  items: LibraryItem[],
  plays: Pick<Play, 'instanceId' | 'releaseId' | 'at'>[],
  lengths: Map<number, Pick<RecordLength, 'seconds' | 'estimated'>>,
  fields: { paid?: number; date?: number } = {},
): YearReview {
  const y = String(year)
  const months = new Date(year, 11, 1)
  const added = items.filter((i) => i.dateAdded.startsWith(y)).sort((a, b) => a.dateAdded.localeCompare(b.dateAdded))

  let spent: YearReview['spent']
  if (fields.paid !== undefined) {
    spent = { total: 0, count: 0 }
    for (const i of items) {
      const amount = parseMoney(i.fields[fields.paid])
      const date = (fields.date !== undefined && i.fields[fields.date]) || i.dateAdded
      if (amount === undefined || !date.startsWith(y)) continue
      spent.total += amount
      spent.count++
    }
  }

  const byId = new Map(items.map((i) => [i.instanceId, i]))
  const inYear = plays.filter((p) => localDate(p.at).startsWith(y))
  const use = stylusUse(inYear, lengths)
  const records = new Map<number, number>()
  const artists = new Map<string, number>()
  const decades = new Map<number, number>()
  for (const p of inYear) {
    bump(records, p.instanceId)
    const item = byId.get(p.instanceId)
    if (!item) continue
    bump(artists, item.artist)
    const from = item.originalYear || item.year
    if (from) bump(decades, Math.floor(from / 10) * 10)
  }

  const genres = new Map<string, number>()
  for (const i of added) for (const g of i.genres) bump(genres, g)

  return {
    year,
    added,
    addedByMonth: byMonth(
      added.map((i) => ({ date: i.dateAdded, amount: 1 })),
      12,
      months,
    ),
    spent,
    plays: inYear.length,
    played: records.size,
    hours: use.hours,
    estimated: use.estimated,
    playsByMonth: byMonth(
      inYear.map((p) => ({ date: localDate(p.at), amount: 1 })),
      12,
      months,
    ),
    topRecords: ranked(records, Infinity)
      .flatMap(([id, count]) => (byId.has(id) ? [{ item: byId.get(id)!, count }] : []))
      .slice(0, TOP),
    topArtists: ranked(artists, TOP).map(([name, count]) => ({ name, count })),
    genres: ranked(genres, 3).map(([name, count]) => ({ name, count })),
    decade: ranked(decades, 1)[0]?.[0],
  }
}

// Years with anything to show, newest first
export function reviewYears(items: Pick<LibraryItem, 'dateAdded'>[], plays: Pick<Play, 'at'>[]): number[] {
  const years = new Set<number>()
  for (const i of items) years.add(Number(i.dateAdded.slice(0, 4)))
  for (const p of plays) years.add(new Date(p.at).getFullYear())
  return [...years].filter((n) => n > 1900).sort((a, b) => b - a)
}
