import { beforeEach, describe, expect, it } from 'vitest'
import { json } from '../../tests/helpers'
import { db } from '../db/db'
import { findAppleAlbum, pickAlbum, searchLinks } from './listen'

const album = (collectionId: number, artistName: string, collectionName: string, collectionType = 'Album') => ({
  collectionId,
  artistName,
  collectionName,
  collectionType,
  collectionViewUrl: `https://music.apple.com/us/album/x/${collectionId}`,
})

describe('searchLinks', () => {
  it('searches each service for artist and title', () => {
    const l = searchLinks('Laufey', 'Bewitched')
    expect(l.spotify).toBe('https://open.spotify.com/search/Laufey%20Bewitched/albums')
    expect(l.bandcamp).toContain('q=Laufey%20Bewitched')
  })
})

describe('pickAlbum', () => {
  it('matches title and artist, ignoring editions and punctuation', () => {
    const results = [
      album(1, 'Laufey', 'Bewitched: The Goddess Edition'),
      album(2, 'Laufey', 'Bewitched (Deluxe Edition)'),
      album(3, 'Someone Else', 'Bewitched'),
    ]
    expect(pickAlbum(results, 'Laufey', 'Bewitched')?.id).toBe(2)
  })

  it('accepts a fuller artist credit', () => {
    expect(
      pickAlbum(
        [album(4, 'Joe Hisaishi & Royal Philharmonic Orchestra', 'A Symphonic Celebration')],
        'Joe Hisaishi',
        'A Symphonic Celebration',
      )?.id,
    ).toBe(4)
  })

  it('gives up rather than guess', () => {
    expect(pickAlbum([album(5, 'Laufey', 'Everything I Know About Love')], 'Laufey', 'Bewitched')).toBeNull()
  })
})

describe('findAppleAlbum', () => {
  beforeEach(() => db.cache.clear())

  it('tries the barcode first, then the name, and remembers the answer', async () => {
    const seen: string[] = []
    const fetchFn = (async (url: string) => {
      seen.push(url)
      if (url.includes('lookup')) return json({ results: [] })
      return json({ results: [album(9, 'Laufey', 'Bewitched')] })
    }) as unknown as typeof fetch
    const a = await findAppleAlbum('100', ['0 196588 460319'], 'Laufey', 'Bewitched', fetchFn)
    expect(a?.id).toBe(9)
    expect(seen[0]).toContain('upc=0196588460319')
    expect(seen[1]).toContain('search?term=Laufey%20Bewitched')
    await findAppleAlbum('100', [], 'Laufey', 'Bewitched', fetchFn)
    expect(seen).toHaveLength(2)
  })
})
