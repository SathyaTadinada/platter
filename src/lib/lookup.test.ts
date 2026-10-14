import { describe, expect, it, vi } from 'vitest'
import search from '../../tests/fixtures/search-barcode.json'
import fuzzy from '../../tests/fixtures/search-fuzzy.json'
import mbFixture from '../../tests/fixtures/musicbrainz-barcode.json'
import type { SearchResponse } from '../api/discogs/types'
import { parseMbSearch } from '../api/musicbrainz'
import { exactBarcodeMatches, lookupBarcode } from './lookup'

const results = (search as SearchResponse).results
const mb = parseMbSearch(mbFixture as never)

describe('exactBarcodeMatches', () => {
  it('keeps releases whose barcode matches, ignoring spaces and dashes', () => {
    // every result in this fixture lists the code, some as "0 7567-81641-2 5"
    expect(exactBarcodeMatches(results, ['075678164125', '0075678164125'])).toHaveLength(results.length)
    expect(exactBarcodeMatches(results, ['5012394144777'])).toEqual([])
  })

  it('drops the unrelated releases Discogs returns for an unknown code', () => {
    expect((fuzzy as SearchResponse).results.length).toBeGreaterThan(0)
    expect(exactBarcodeMatches((fuzzy as SearchResponse).results, ['000000000017', '0000000000017'])).toEqual([])
  })
})

describe('lookupBarcode', () => {
  it('returns Discogs results for the first variant that hits', async () => {
    const searchDiscogs = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(results)
    const searchMb = vi.fn()
    const r = await lookupBarcode('075678164125', { searchDiscogs, searchMb })
    expect(r.kind).toBe('discogs')
    expect(searchDiscogs).toHaveBeenNthCalledWith(2, { barcode: '0075678164125' })
    expect(searchMb).not.toHaveBeenCalled()
  })

  it('falls back to MusicBrainz when Discogs only has fuzzy matches', async () => {
    const searchDiscogs = vi.fn(async (p: { barcode?: string }) => (p.barcode ? (fuzzy as SearchResponse).results : results))
    const r = await lookupBarcode('075678164125', { searchDiscogs, searchMb: async () => mb })
    expect(r.kind).toBe('musicbrainz')
    expect(searchDiscogs).toHaveBeenLastCalledWith({ artist: 'Genesis', release_title: 'Invisible Touch' })
  })

  it('reports nothing found, keeping what MusicBrainz knew', async () => {
    const r = await lookupBarcode('075678164125', { searchDiscogs: async () => [], searchMb: async () => mb })
    expect(r).toMatchObject({ kind: 'none', barcode: '075678164125' })
    if (r.kind === 'none') expect(r.mb.length).toBeGreaterThan(0)
  })

  it('survives MusicBrainz being down', async () => {
    const r = await lookupBarcode('075678164125', {
      searchDiscogs: async () => [],
      searchMb: async () => {
        throw new Error('503')
      },
    })
    expect(r.kind).toBe('none')
  })
})
