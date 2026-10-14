import { describe, expect, it } from 'vitest'
import demo from '../../tests/fixtures/collection-demo.json'
import fieldsFixture from '../../tests/fixtures/fields.json'
import search from '../../tests/fixtures/search-barcode.json'
import type { CollectionField, CollectionPage, SearchResponse } from '../api/discogs/types'
import {
  activeFilterCount,
  emptyQuery,
  facets,
  filterItems,
  groupItems,
  itemFromSearch,
  joinArtists,
  parseQuery,
  serializeQuery,
  sortItems,
  sortName,
  toCsv,
  toLibraryItem,
  type LibraryQuery,
} from './library'

const items = (demo as unknown as CollectionPage).releases.map(toLibraryItem)
const fields: CollectionField[] = [
  ...(fieldsFixture.fields as CollectionField[]),
  { id: 4, name: 'Location', type: 'textarea', position: 4, public: false },
]
const folders = [
  { id: 1, name: 'Uncategorized', count: 0 },
  { id: 2, name: 'Shelf', count: 0 },
]
const q = (patch: Partial<LibraryQuery> = {}): LibraryQuery => ({ ...emptyQuery(), ...patch })

describe('toLibraryItem', () => {
  it('flattens a collection item', () => {
    const i = items.find((x) => x.title === 'Kind Of Blue')!
    expect(i.artist).toBe('Miles Davis')
    expect(i.formatNames).toContain('Vinyl')
    expect(i.genres).toContain('Jazz')
    expect(i.fields[1]).toBeTruthy()
  })

  it('drops Discogs artist numbering and joins credits', () => {
    const i = toLibraryItem({
      ...(demo as unknown as CollectionPage).releases[0],
      basic_information: {
        ...(demo as unknown as CollectionPage).releases[0].basic_information,
        artists: [{ name: 'Nirvana (2)' }, { name: 'Prince*' }],
      },
    })
    expect(i.artist).toBe('Nirvana, Prince')
  })
})

describe('joinArtists', () => {
  it('spaces joiners like Discogs shows them', () => {
    expect(joinArtists([{ name: 'Frédéric Chopin', join: ',' }, { name: 'Christoph Eschenbach' }])).toBe(
      'Frédéric Chopin, Christoph Eschenbach',
    )
    expect(joinArtists([{ name: 'Simon', join: '&' }, { name: 'Garfunkel' }])).toBe('Simon & Garfunkel')
    expect(joinArtists([{ name: 'A', join: 'Feat.' }, { name: 'B' }])).toBe('A Feat. B')
    expect(joinArtists([{ name: 'A', join: '' }, { name: 'B (2)' }])).toBe('A, B')
  })
})

describe('itemFromSearch', () => {
  it('builds a library item from a search result', () => {
    const r = (search as SearchResponse).results[0]
    const i = itemFromSearch(r, 9, 1, new Date('2026-10-13T00:00:00Z'))
    expect(i).toMatchObject({ instanceId: 9, releaseId: r.id, artist: 'Genesis', title: 'Invisible Touch', folderId: 1 })
    expect(i.dateAdded).toBe('2026-10-13T00:00:00.000Z')
  })
})

describe('filterItems', () => {
  it('matches every word, anywhere, ignoring case and accents', () => {
    expect(filterItems(items, q({ q: 'bjork' })).map((i) => i.artist)).toEqual(['Björk'])
    expect(filterItems(items, q({ q: 'miles blue' })).map((i) => i.title)).toEqual(['Kind Of Blue'])
    expect(filterItems(items, q({ q: 'zzzz' }))).toEqual([])
  })

  it('searches custom field values', () => {
    const shelf = items[0].fields[4]
    expect(filterItems(items, q({ q: shelf })).length).toBeGreaterThan(0)
  })

  it('applies filters together', () => {
    const jazz = filterItems(items, q({ filters: { genre: 'Jazz', fields: {} } }))
    expect(jazz.length).toBeGreaterThan(0)
    expect(jazz.every((i) => i.genres.includes('Jazz'))).toBe(true)
    const jazz60s = filterItems(items, q({ filters: { genre: 'Jazz', decade: 1960, fields: {} } }))
    expect(jazz60s.every((i) => i.year >= 1960 && i.year < 1970)).toBe(true)
  })

  it('filters by a custom field value', () => {
    const v = items[0].fields[4]
    const hits = filterItems(items, q({ filters: { fields: { 4: v } } }))
    expect(hits.every((i) => i.fields[4] === v)).toBe(true)
  })

  it('treats rating as a minimum', () => {
    expect(filterItems(items, q({ filters: { rating: 4, fields: {} } })).every((i) => i.rating >= 4)).toBe(true)
  })
})

describe('sortItems', () => {
  it('ignores a leading "The" for artists', () => {
    expect(sortName('The Beatles')).toBe('beatles')
    const sorted = sortItems(items, 'artist').map((i) => i.artist)
    expect(sorted.indexOf('The Beatles')).toBeLessThan(sorted.indexOf('Björk'))
  })

  it('sorts by date added, newest first by default', () => {
    const s = sortItems(items, 'added')
    expect(s[0].dateAdded >= s.at(-1)!.dateAdded).toBe(true)
  })

  it('puts unknown years last', () => {
    const withUnknown = [...items, { ...items[0], instanceId: 1, year: 0 }]
    expect(sortItems(withUnknown, 'year').at(-1)!.year).toBe(0)
    expect(sortItems(withUnknown, 'year-old').at(-1)!.year).toBe(0)
  })
})

describe('groupItems', () => {
  it('groups by first letter when sorted by artist', () => {
    const groups = groupItems(sortItems(items, 'artist'), 'artist')
    expect(groups.map((g) => g.label)).toEqual([...new Set(groups.map((g) => g.label))])
    expect(groups.find((g) => g.label === 'B')?.items.some((i) => i.artist === 'The Beatles')).toBe(true)
  })

  it('groups by decade when sorted by year', () => {
    const labels = groupItems(sortItems(items, 'year'), 'year').map((g) => g.label)
    expect(labels[0]).toMatch(/^\d{4}s$/)
  })
})

describe('facets', () => {
  it('counts each option while ignoring its own filter', () => {
    const f = facets(items, q({ filters: { format: 'Vinyl', fields: {} } }), folders, fields)
    expect(f.format.find((o) => o.value === 'Vinyl')?.count).toBe(items.filter((i) => i.formatNames.includes('Vinyl')).length)
    expect(f.genre.reduce((n, o) => Math.max(n, o.count), 0)).toBeLessThanOrEqual(items.length)
  })

  it('names folders and lists field values', () => {
    const f = facets(items, q(), folders, fields)
    expect(f.folder.map((o) => o.label).sort()).toEqual(['Shelf', 'Uncategorized'])
    // empty crates are still listed
    const withEmpty = facets(items, q(), [...folders, { id: 9, name: 'Empty', count: 0 }], fields)
    expect(withEmpty.folder.find((o) => o.label === 'Empty')?.count).toBe(0)
    expect(f.fields.map((x) => x.field.name)).toContain('Location')
  })
})

describe('query in the URL', () => {
  it('round-trips', () => {
    const query = q({ q: 'blue note', sort: 'year', filters: { genre: 'Jazz', decade: 1950, rating: 3, fields: { 4: 'Shelf A' } } })
    expect(parseQuery(serializeQuery(query))).toEqual({
      ...query,
      filters: { ...query.filters, folder: undefined, format: undefined, tag: undefined, style: undefined },
    })
    expect(activeFilterCount(query.filters)).toBe(4)
  })

  it('falls back to defaults for junk', () => {
    expect(parseQuery('sort=nonsense').sort).toBe('added')
  })
})

describe('toCsv', () => {
  it('writes Discogs-style columns and quotes where needed', () => {
    const csv = toCsv(items.slice(0, 2), folders, fields)
    const [head, first] = csv.split('\n')
    expect(head).toBe(
      'Catalog#,Artist,Title,Label,Format,Rating,Released,release_id,CollectionFolder,Date Added,Collection Media Condition,Collection Sleeve Condition,Collection Notes,Collection Location',
    )
    expect(first).toContain(String(items[0].releaseId))
    expect(toCsv([{ ...items[0], title: 'Say "Hi", ok' }], folders, [])).toContain('"Say ""Hi"", ok"')
  })
})
