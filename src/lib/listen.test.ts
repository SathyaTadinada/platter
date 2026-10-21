import { beforeEach, describe, expect, it } from 'vitest'
import { json } from '../../tests/helpers'
import { db } from '../db/db'
import { findAppleAlbum, pickAlbum, searchLinks } from './listen'

const album = (collectionId: number, artistName: string, collectionName: string, collectionType: string | undefined = 'Album') => ({
  collectionId,
  artistName,
  collectionName,
  collectionType,
  collectionViewUrl: `https://music.apple.com/us/album/x/${collectionId}`,
})

describe('searchLinks', () => {
  it('searches each service for artist and title', () => {
    const l = searchLinks('Laufey', 'Bewitched')
    expect(l.spotify).toBe('https://open.spotify.com/search/Laufey%20Bewitched')
    expect(l.youtube).toBe('https://music.youtube.com/search?q=Laufey%20Bewitched')
    expect(l.apple).toBe('https://music.apple.com/search?term=Laufey%20Bewitched')
  })

  it('ends the Spotify link with the search itself, which is what the app reads', () => {
    const l = searchLinks('Peter Cat Recording Co.', 'Bismillah')
    expect(l.spotify).toBe('https://open.spotify.com/search/Peter%20Cat%20Recording%20Co.%20Bismillah')
    expect(decodeURIComponent(new URL(l.spotify).pathname.split('/').pop()!)).toBe('Peter Cat Recording Co. Bismillah')
  })

  it('encodes punctuation that would break the URL', () => {
    const l = searchLinks('Simon & Garfunkel', 'Bridge Over Troubled Water / #1?')
    expect(l.spotify).toBe('https://open.spotify.com/search/Simon%20%26%20Garfunkel%20Bridge%20Over%20Troubled%20Water%20%2F%20%231%3F')
    expect(new URL(l.youtube).searchParams.get('q')).toBe('Simon & Garfunkel Bridge Over Troubled Water / #1?')
  })

  it('searches the web for "All services" when there is no album.link page', () => {
    expect(new URL(searchLinks('Peter Cat Recording Co.', 'Bismillah').web).searchParams.get('q')).toBe(
      'Peter Cat Recording Co. Bismillah album',
    )
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

  it("finds the album through its songs when Apple's album search misses it", async () => {
    const seen: string[] = []
    const fetchFn = (async (url: string) => {
      seen.push(url)
      if (url.includes('entity=album')) return json({ results: [] })
      return json({
        results: [
          {
            ...album(1833862435, 'Peter Cat Recording Co.', 'Bismillah', undefined),
            collectionViewUrl: 'https://music.apple.com/us/album/bismillah/1833862435?i=1833862436&uo=4',
          },
        ],
      })
    }) as unknown as typeof fetch
    const a = await findAppleAlbum('200', [], 'Peter Cat Recording Co.', 'Bismillah', fetchFn)
    expect(a).toEqual({
      id: 1833862435,
      url: 'https://music.apple.com/us/album/bismillah/1833862435?uo=4',
      artist: 'Peter Cat Recording Co.',
      title: 'Bismillah',
    })
    expect(seen[1]).toContain('search?term=Peter%20Cat%20Recording%20Co.%20Bismillah&entity=song')
  })

  it('tries a miss again after a day', async () => {
    let calls = 0
    const fetchFn = (async () => {
      calls++
      return json({ results: [] })
    }) as unknown as typeof fetch
    expect(await findAppleAlbum('300', [], 'Nobody', 'Nothing', fetchFn)).toBeNull()
    expect(await findAppleAlbum('300', [], 'Nobody', 'Nothing', fetchFn)).toBeNull()
    expect(calls).toBe(2) // album and song search, once
    await db.cache.update('apple2:300', { fetchedAt: Date.now() - 2 * 24 * 60 * 60 * 1000 })
    await findAppleAlbum('300', [], 'Nobody', 'Nothing', fetchFn)
    expect(calls).toBe(4)
  })
})
