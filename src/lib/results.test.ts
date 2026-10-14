import { describe, expect, it } from 'vitest'
import type { SearchResult } from '../api/discogs/types'
import { filterResults, resultFacets } from './results'

const r = (id: number, format: string, descriptions: string[], country: string, year: string, genre: string[]) =>
  ({
    id,
    title: 'A - B',
    uri: '',
    type: 'release',
    formats: [{ name: format, qty: '1', descriptions }],
    country,
    year,
    genre,
  }) as SearchResult

const results = [
  r(1, 'Vinyl', ['LP', 'Album'], 'US', '2023', ['Jazz']),
  r(2, 'Vinyl', ['7"', 'Single'], 'UK', '2024', ['Jazz', 'Pop']),
  r(3, 'CD', ['Album'], 'US', '2023', ['Pop']),
  r(4, 'File', ['FLAC', 'Album'], '', '0', ['Jazz']),
]

describe('result facets', () => {
  it('counts formats, details, countries, decades, and genres', () => {
    const f = resultFacets(results, {})
    expect(f.format.map((o) => [o.value, o.count])).toEqual([
      ['Vinyl', 2],
      ['CD', 1],
      ['File', 1],
    ])
    expect(f.tag.find((o) => o.value === 'Album')?.count).toBe(3)
    expect(f.decade.map((o) => o.value)).toEqual(['2020s'])
    expect(f.country.map((o) => o.value)).toEqual(['US', 'UK'])
  })

  it("counts each group as if its own choice weren't made", () => {
    const f = resultFacets(results, { format: 'Vinyl' })
    expect(f.format.map((o) => o.count)).toEqual([2, 1, 1])
    expect(f.genre.map((o) => [o.value, o.count])).toEqual([
      ['Jazz', 2],
      ['Pop', 1],
    ])
  })

  it('filters on every choice at once', () => {
    expect(filterResults(results, { format: 'Vinyl', genre: 'Pop' }).map((x) => x.id)).toEqual([2])
    expect(filterResults(results, { tag: 'Album', country: 'US' }).map((x) => x.id)).toEqual([1, 3])
  })
})
