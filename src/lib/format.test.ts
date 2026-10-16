import { describe, expect, it } from 'vitest'
import search from '../../tests/fixtures/search-barcode.json'
import type { SearchResponse } from '../api/discogs/types'
import { cleanArtist, cleanLabel, describeFormats, shortGrade, splitTitle, toCard } from './format'

describe('format', () => {
  it('shortens grades to their abbreviation', () => {
    expect(shortGrade('Very Good Plus (VG+)')).toBe('VG+')
    expect(shortGrade('Near Mint (NM or M-)')).toBe('NM')
    expect(shortGrade('Generic')).toBe('Generic')
    expect(shortGrade(undefined)).toBeUndefined()
  })

  it('splits "Artist - Title"', () => {
    expect(splitTitle('Genesis - Invisible Touch')).toEqual({ artist: 'Genesis', title: 'Invisible Touch' })
    expect(splitTitle('Untitled')).toEqual({ artist: '', title: 'Untitled' })
  })

  it('drops Discogs artist numbering', () => {
    expect(cleanArtist('Nirvana (2)')).toBe('Nirvana')
    expect(cleanArtist('Prince*')).toBe('Prince')
  })

  it('drops label numbering too', () => {
    expect(cleanLabel('Darkroom (4)')).toBe('Darkroom')
    expect(cleanLabel('Epic')).toBe('Epic')
  })

  it('describes formats with quantity and details', () => {
    expect(describeFormats([{ name: 'Vinyl', qty: '2', descriptions: ['LP', 'Album'], text: 'Red' }])).toBe('2× Vinyl, LP, Album, Red')
    expect(describeFormats(undefined, ['Vinyl', 'LP', 'Vinyl'])).toBe('Vinyl, LP')
    // "All Media" holds notes for the whole release, not a format of its own
    expect(
      describeFormats([
        { name: 'Vinyl', qty: '1', descriptions: ['LP'] },
        { name: 'CD', qty: '1', descriptions: ['Album'] },
        { name: 'All Media', qty: '1', descriptions: ['Limited Edition'] },
      ]),
    ).toBe('Vinyl, LP + CD, Album · Limited Edition')
  })

  it('builds a card from a real search result', () => {
    const card = toCard((search as SearchResponse).results[0])
    expect(card.artist).toBe('Genesis')
    expect(card.title).toBe('Invisible Touch')
    expect(card.discogsUrl).toMatch(/^https:\/\/www\.discogs\.com\/release\//)
    expect(card.id).toBeGreaterThan(0)
  })
})
