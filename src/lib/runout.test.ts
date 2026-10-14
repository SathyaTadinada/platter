import { describe, expect, it } from 'vitest'
import vinyl from '../../tests/fixtures/release-vinyl.json'
import type { Identifier, Release } from '../api/discogs/types'
import {
  confidence,
  levenshtein,
  loosen,
  normalize,
  partialRatio,
  rankByRunout,
  runoutCandidates,
  scoreRelease,
  similarity,
} from './runout'

const ids = (vinyl as Release).identifiers
const runout = (value: string, description?: string): Identifier => ({ type: 'Matrix / Runout', value, description })

describe('normalize and loosen', () => {
  it('uppercases and drops spacing and punctuation', () => {
    expect(normalize(' pb 41447-A2 ‡ utopia/ms ')).toBe('PB41447A2UTOPIAMS')
  })

  it('maps lookalike characters together', () => {
    expect(loosen('B0SOIL')).toBe('805011')
    expect(loosen(normalize('PB41447'))).toBe(loosen(normalize('P841447')))
  })
})

describe('levenshtein', () => {
  it('counts edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('same', 'same')).toBe(0)
  })
})

describe('partialRatio', () => {
  it('finds a fragment inside a longer runout', () => {
    expect(partialRatio('41447A2', 'PB41447A2UTOPIAMS')).toBe(1)
  })
  it('tolerates a slip', () => {
    expect(partialRatio('41447A3', 'PB41447A2UTOPIAMS')).toBeGreaterThan(0.8)
  })
})

describe('similarity', () => {
  it('is perfect for an exact transcription, whatever the spacing', () => {
    expect(similarity('PB 41447 A2 UTOPIA MS', 'PB 41447 A2 UTOPIA MS')).toBe(1)
    expect(similarity('pb41447a2utopiams', 'PB 41447 A2 UTOPIA MS')).toBe(1)
  })

  it('treats O/0, I/1/l, S/5 and B/8 as near matches', () => {
    const s = similarity('P8 4I447 A2 UT0PIA M5', 'PB 41447 A2 UTOPIA MS')
    expect(s).toBeGreaterThan(0.9)
    expect(s).toBeLessThan(1)
  })

  it('scores a partial transcription well, but below a full one', () => {
    const part = similarity('41447 A2', 'PB 41447 A2 UTOPIA MS')
    expect(part).toBeGreaterThan(0.85)
    expect(part).toBeLessThan(similarity('PB 41447 A2 UTOPIA MS', 'PB 41447 A2 UTOPIA MS'))
  })

  it('separates neighbouring cuts', () => {
    expect(similarity('PB 41447 A2', 'PB 41447 A2 UTOPIA MS')).toBeGreaterThan(similarity('PB 41447 A2', 'PB 41447 A1 UTOPIA MS'))
  })

  it('is low for unrelated text', () => {
    expect(similarity('XYZ 999', 'PB 41447 A2 UTOPIA MS')).toBeLessThan(0.5)
  })
})

describe('scoreRelease', () => {
  it('matches each side to its best identifier, using real Discogs data', () => {
    const r = scoreRelease(['PB 41447 A2 UTOPIA MS', 'PB 41447 B'], ids)
    expect(r.kind).toBe('scored')
    if (r.kind !== 'scored') return
    expect(r.matches[0].identifier.value).toBe('PB 41447 A2 UTOPIA MS')
    expect(r.matches[0].score).toBe(1)
    expect(r.matches[1].identifier.value).toMatch(/^PB 41447 B/)
    expect(r.score).toBeGreaterThan(0.9)
  })

  it('ignores barcodes and other identifier types', () => {
    const r = scoreRelease(['5012394144777'], ids)
    expect(r.kind === 'scored' && r.matches[0].identifier.type).toBe('Matrix / Runout')
  })

  it('reports releases without runout data instead of scoring them', () => {
    expect(scoreRelease(['ABC 123'], [{ type: 'Barcode', value: '123' }])).toEqual({ kind: 'nodata' })
  })

  it('scores nothing when nothing useful was typed', () => {
    expect(scoreRelease(['', ' - '], [runout('ABC 123')])).toEqual({ kind: 'scored', score: 0, matches: [] })
  })
})

describe('rankByRunout', () => {
  const releases = [
    { id: 1, ids: [runout('ABC 123 A1'), runout('ABC 123 B1')] },
    { id: 2, ids: undefined }, // details not loaded
    { id: 3, ids: [runout('XYZ 999 A')] },
    { id: 4, ids: [runout('ABC 123 A2'), runout('ABC 123 B2')] },
    { id: 5, ids: [{ type: 'Barcode', value: '1' }] },
  ]
  const ranked = rankByRunout(releases, ['ABC 123 A2', 'ABC 123 B2'], (r) => r.ids)

  it('puts the best match first', () => {
    expect(ranked[0].item.id).toBe(4)
    expect(ranked[1].item.id).toBe(1)
  })

  it('keeps releases without runout data ahead of poor matches', () => {
    expect(ranked.map((r) => r.item.id)).toEqual([4, 1, 2, 5, 3])
    expect(ranked[2].result.kind).toBe('nodata')
  })
})

describe('confidence', () => {
  it('buckets scores', () => {
    expect([0.95, 0.8, 0.6, 0.3].map(confidence)).toEqual(['strong', 'likely', 'weak', 'none'])
  })
})

describe('runoutCandidates', () => {
  it('keeps plausible lines from OCR output, longest first', () => {
    const text = 'PB 41447 A2 ‡ UTOPIA MS\n~~\nSTERLING\nA2\nside 1 —  ZZ-123 \n'
    expect(runoutCandidates(text)).toEqual(['PB 41447 A2 UTOPIA MS', 'side 1 ZZ-123'])
  })
})
