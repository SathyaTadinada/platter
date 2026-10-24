import { describe, expect, it } from 'vitest'
import type { LibraryItem } from '../db/db'
import { reviewYears, yearReview } from './yearReview'

const item = (instanceId: number, dateAdded: string, more: Partial<LibraryItem> = {}) =>
  ({ instanceId, releaseId: instanceId, artist: 'A', year: 0, genres: [], fields: {}, dateAdded, ...more }) as LibraryItem
const play = (instanceId: number, day: string) => ({ instanceId, releaseId: instanceId, at: Date.parse(`${day}T20:00`) })

const items = [
  item(1, '2025-12-30T10:00:00-08:00', { artist: 'Bowie', year: 2016, originalYear: 1972, genres: ['Rock'], fields: { 5: '$20' } }),
  item(2, '2026-02-01T10:00:00-08:00', { artist: 'Bowie', year: 1977, genres: ['Rock'], fields: { 5: '$30', 7: '2025-11-02' } }),
  item(3, '2026-03-15T10:00:00-08:00', { artist: 'Sade', year: 1984, genres: ['Funk / Soul', 'Pop'], fields: { 5: '$15' } }),
]
const plays = [
  play(1, '2026-01-02'),
  play(1, '2026-03-01'),
  play(2, '2026-03-02'),
  play(3, '2026-05-05'),
  play(3, '2025-06-01'),
  play(9, '2026-04-01'),
]
const lengths = new Map([
  [1, { seconds: 3600, estimated: false }],
  [2, { seconds: 1800, estimated: false }],
  [3, { seconds: 2400, estimated: false }],
])

describe('yearReview', () => {
  const r = yearReview(2026, items, plays, lengths, { paid: 5, date: 7 })

  it('lists what came in that year', () => {
    expect(r.added.map((i) => i.instanceId)).toEqual([2, 3])
    expect(r.addedByMonth.map((m) => m.total)).toEqual([0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(r.genres).toEqual([
      { name: 'Rock', count: 1 },
      { name: 'Funk / Soul', count: 1 },
      { name: 'Pop', count: 1 },
    ])
  })

  it('adds up spending by purchase date when there is one', () => {
    expect(r.spent).toEqual({ total: 15, count: 1 })
    expect(yearReview(2025, items, plays, lengths, { paid: 5, date: 7 }).spent).toEqual({ total: 50, count: 2 })
    expect(yearReview(2026, items, plays, lengths).spent).toBeUndefined()
  })

  it('counts the year’s plays and hours', () => {
    expect(r).toMatchObject({ plays: 5, played: 4, estimated: true })
    // three known records, plus a removed one guessed at 40 minutes
    expect(r.hours).toBeCloseTo((3600 * 2 + 1800 + 2400 + 2400) / 3600)
    expect(r.playsByMonth.slice(0, 5).map((m) => m.total)).toEqual([1, 0, 2, 1, 1])
  })

  it('ranks records, artists, and the decade, skipping records no longer in the collection', () => {
    expect(r.topRecords.map((t) => [t.item.instanceId, t.count])).toEqual([
      [1, 2],
      [2, 1],
      [3, 1],
    ])
    expect(r.topArtists).toEqual([
      { name: 'Bowie', count: 3 },
      { name: 'Sade', count: 1 },
    ])
    expect(r.decade).toBe(1970)
  })
})

describe('reviewYears', () => {
  it('lists years with records added or played, newest first', () => {
    expect(reviewYears(items, plays)).toEqual([2026, 2025])
  })
})
