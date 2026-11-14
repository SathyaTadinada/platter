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
  saveSort,
  serializeQuery,
  parseSort,
  sortItems,
  sortParam,
  type SortContext,
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
    expect(sortItems(withUnknown, 'year', {}, true).at(-1)!.year).toBe(0)
  })

  it('sorts by what was paid, highest first, with records that have no price last either way', () => {
    const [a, b, c] = items
    const ctx: SortContext = { paid: (i) => ({ [a.instanceId]: 12, [b.instanceId]: 150 })[i.instanceId], money: (n) => `$${n}` }
    const s = sortItems([a, b, c], 'paid', ctx)
    expect(s.map((i) => i.instanceId)).toEqual([b.instanceId, a.instanceId, c.instanceId])
    expect(sortItems([a, b, c], 'paid', ctx, true).map((i) => i.instanceId)).toEqual([a.instanceId, b.instanceId, c.instanceId])
    expect(groupItems(s, 'paid', ctx).map((g) => g.label)).toEqual(['$100 and up', '$10 to $20', 'No price paid'])
  })

  it('sorts by value, unpriced last', () => {
    const [a, b, c] = items
    const prices: SortContext = { value: (i) => ({ [a.instanceId]: 5, [b.instanceId]: 80 })[i.instanceId], money: (n) => `$${n}` }
    const s = sortItems([a, b, c], 'value', prices)
    expect(s.map((i) => i.instanceId)).toEqual([b.instanceId, a.instanceId, c.instanceId])
    expect(groupItems(s, 'value', prices).map((g) => g.label)).toEqual(['$50 to $100', 'Under $10', 'No price yet'])
  })

  it('sorts and groups by location, with no location last', () => {
    const [a, b, c] = items
    const ctx: SortContext = { location: (i) => ({ [a.instanceId]: 'Shelf B', [c.instanceId]: 'Shelf A' })[i.instanceId] }
    const s = sortItems([a, b, c], 'location', ctx)
    expect(s.map((i) => i.instanceId)).toEqual([c.instanceId, a.instanceId, b.instanceId])
    expect(groupItems(s, 'location', ctx).map((g) => g.label)).toEqual(['Shelf A', 'Shelf B', 'No location'])
  })

  it('reverses a sort, keeping records without a value last', () => {
    const [a, b, c] = items
    const prices: SortContext = { value: (i) => ({ [a.instanceId]: 5, [b.instanceId]: 80 })[i.instanceId] }
    expect(sortItems([a, b, c], 'value', prices, true).map((i) => i.instanceId)).toEqual([a.instanceId, b.instanceId, c.instanceId])
    const s = sortItems(items, 'added', {}, true)
    expect(s[0].dateAdded <= s.at(-1)!.dateAdded).toBe(true)
  })

  it('reads a sort from the URL or the saved choice, including the old reversed names', () => {
    expect(parseSort('artist')).toEqual({ sort: 'artist', reversed: false })
    expect(parseSort('artist-rev')).toEqual({ sort: 'artist', reversed: true })
    expect(parseSort('added-old')).toEqual({ sort: 'added', reversed: true })
    expect(parseSort('year-old')).toEqual({ sort: 'year', reversed: true })
    expect(parseSort('nope')).toBeNull()
    expect(sortParam('title', true)).toBe('title-rev')
  })

  it('sorts by plays and groups by how often', () => {
    const [a, b, c] = items
    const ctx: SortContext = { plays: (i) => ({ [a.instanceId]: 1, [b.instanceId]: 12 })[i.instanceId] ?? 0 }
    const s = sortItems([a, b, c], 'plays', ctx)
    expect(s.map((i) => i.instanceId)).toEqual([b.instanceId, a.instanceId, c.instanceId])
    expect(groupItems(s, 'plays', ctx).map((g) => g.label)).toEqual(['Played 10+ times', 'Played once', 'Never played'])
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

  it("goes by the album's original year when it's known", () => {
    // a 2023 reissue of a 1973 album, and a pressing with no year of its own
    const reissue = { ...items[0], year: 2023, originalYear: 1973 }
    const undated = { ...items[1], year: 0, originalYear: 2015 }
    const list = [reissue, undated]
    expect(filterItems(list, q({ filters: { decade: 1970, fields: {} } }))).toEqual([reissue])
    expect(filterItems(list, q({ filters: { decade: 2020, fields: {} } }))).toEqual([])
    expect(groupItems(sortItems(list, 'year', {}, true), 'year').map((g) => g.label)).toEqual(['1970s', '2010s'])
    expect(facets(list, q({}), folders, fields).decade.map((o) => o.label)).toEqual(['2010s', '1970s'])
  })
})

describe('facets', () => {
  it('leaves a play count of 0 out of the filters', () => {
    const playCount = { id: 8, name: 'Play Count', type: 'textarea', position: 8, public: false } as CollectionField
    const list = [
      { ...items[0], fields: { 8: '0' } },
      { ...items[1], fields: { 8: '3' } },
    ]
    const f = facets(list, q({}), folders, [playCount])
    expect(f.fields[0].options.map((o) => o.value)).toEqual(['3'])
  })

  it('groups purchase prices into ranges and shows dates as dates', () => {
    const field = (id: number, name: string) => ({ id, name, type: 'textarea', position: id, public: false }) as CollectionField
    const custom = [field(4, 'Purchase Price'), field(5, 'Last Played')]
    const list = [
      { ...items[0], fields: { 4: '$12.50', 5: '2026-03-04' } },
      { ...items[1], fields: { 4: '15', 5: '2026-10-14' } },
      { ...items[2], fields: { 4: '$140', 5: '' } },
    ]
    const [price, played] = facets(list, q(), folders, custom, (n) => `$${n}`).fields
    expect(price.options).toEqual([
      { value: 'range:10-20', label: '$10–$20', count: 2 },
      { value: 'range:100-', label: '$100+', count: 1 },
    ])
    expect(played.options.map((o) => o.value)).toEqual(['2026-10-14', '2026-03-04'])
    expect(played.options[0].label).not.toBe('2026-10-14')
    expect(filterItems(list, q({ filters: { fields: { 4: 'range:10-20' } } }))).toEqual(list.slice(0, 2))
    expect(filterItems(list, q({ filters: { fields: { 4: 'range:100-' } } }))).toEqual([list[2]])
  })

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

  it('uses the last sort picked when the URL has none, and keeps others in the URL', () => {
    saveSort('artist', false)
    expect(parseQuery('').sort).toBe('artist')
    expect(serializeQuery(q({ sort: 'artist' }))).toBe('')
    expect(serializeQuery(q({ sort: 'added' }))).toBe('sort=added')
    expect(serializeQuery(q({ sort: 'artist', reversed: true }))).toBe('sort=artist-rev')
    saveSort('year', true)
    expect(parseQuery('')).toMatchObject({ sort: 'year', reversed: true })
    localStorage.clear()
  })
})

describe('toCsv', () => {
  it('writes Discogs-style columns and quotes where needed', () => {
    const csv = toCsv(items.slice(0, 2), folders, fields)
    const [head, first] = csv.split('\n')
    expect(head).toBe(
      'Catalog#,Artist,Title,Label,Format,Rating,Released,release_id,CollectionFolder,Date Added,Collection Media Condition,Collection Sleeve Condition,Collection Notes,Collection Location,master_id,Original Year',
    )
    expect(first).toContain(String(items[0].releaseId))
    expect(toCsv([{ ...items[0], title: 'Say "Hi", ok' }], folders, [])).toContain('"Say ""Hi"", ok"')
  })

  it("adds the album's original year after Discogs' columns", () => {
    const row = toCsv([{ ...items[0], masterId: 10362, originalYear: 1973 }], folders, []).split('\n')[1]
    expect(row.endsWith(',10362,1973')).toBe(true)
  })
})
