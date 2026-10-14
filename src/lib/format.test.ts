import { describe, expect, it } from 'vitest'
import search from '../../tests/fixtures/search-barcode.json'
import type { SearchResponse } from '../api/discogs/types'
import { cleanArtist, describeFormats, splitTitle, toCard } from './format'

describe('format', () => {
  it('splits "Artist - Title"', () => {
    expect(splitTitle('Genesis - Invisible Touch')).toEqual({ artist: 'Genesis', title: 'Invisible Touch' })
    expect(splitTitle('Untitled')).toEqual({ artist: '', title: 'Untitled' })
  })

  it('drops Discogs artist numbering', () => {
    expect(cleanArtist('Nirvana (2)')).toBe('Nirvana')
    expect(cleanArtist('Prince*')).toBe('Prince')
  })

  it('describes formats with quantity and details', () => {
    expect(describeFormats([{ name: 'Vinyl', qty: '2', descriptions: ['LP', 'Album'], text: 'Red' }])).toBe('2× Vinyl, LP, Album, Red')
    expect(describeFormats(undefined, ['Vinyl', 'LP', 'Vinyl'])).toBe('Vinyl, LP')
  })

  it('builds a card from a real search result', () => {
    const card = toCard((search as SearchResponse).results[0])
    expect(card.artist).toBe('Genesis')
    expect(card.title).toBe('Invisible Touch')
    expect(card.discogsUrl).toMatch(/^https:\/\/www\.discogs\.com\/release\//)
    expect(card.id).toBeGreaterThan(0)
  })
})
