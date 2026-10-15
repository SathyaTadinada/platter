import { describe, expect, it } from 'vitest'
import type { LibraryItem } from '../db/db'
import { cardFacts, cardRows } from './shareCard'

const item = (p: Partial<LibraryItem>) => ({ title: 'T', artist: 'A', year: 0, genres: [], dateAdded: '2020-01-01', ...p }) as LibraryItem

describe('share card', () => {
  const items = [
    item({ title: 'Kind of Blue', artist: 'Miles Davis', year: 1959, genres: ['Jazz'], dateAdded: '2026-02-01' }),
    item({ title: 'AM', artist: 'Arctic Monkeys', year: 2013, genres: ['Rock'] }),
    item({ title: 'Blue', artist: 'Joni Mitchell', year: 1971, genres: ['Rock', 'Folk, World, & Country'] }),
    item({ title: 'Unknown', year: 0, genres: [] }),
  ]
  const rows = [
    { item: items[1], count: 12 },
    { item: items[0], count: 3 },
  ]
  const f = cardFacts('sam', items, rows, '$900', new Date('2026-10-14T12:00'))

  it('picks the facts', () => {
    expect(f.records).toBe(4)
    expect(f.mostPlayed).toEqual({ title: 'AM', artist: 'Arctic Monkeys', plays: 12 })
    expect(f.genre).toEqual({ name: 'Rock', count: 2 })
    expect(f.oldest?.year).toBe(1959) // records without a year don't count
    expect(f.addedThisYear).toBe(1)
  })

  it('keeps four rows and skips what it has no data for', () => {
    expect(cardRows(f).map((r) => r[0])).toEqual(['Worth about', 'Most played', 'Mostly', 'Oldest'])
    const bare = cardRows(cardFacts('sam', [item({})], [], undefined))
    expect(bare).toEqual([])
  })
})
