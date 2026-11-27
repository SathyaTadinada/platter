import { describe, expect, it } from 'vitest'
import { listensFor } from '../api/listenbrainz'
import type { Release } from '../api/discogs/types'
import { discsOf, sideOf, sidesLabel, sidesOf } from './sides'
import { recordSeconds, stylusUse } from './stylus'

const track = (position: string, duration?: string, type_ = 'track') => ({ position, title: position || 'x', duration, type_ })

describe('sideOf', () => {
  it('reads the side from vinyl and cassette positions', () => {
    expect(['A1', 'B', 'C12', '1-D3', 'A3a', 'AA', 'BB1'].map(sideOf)).toEqual(['A', 'B', 'C', 'D', 'A', 'AA', 'BB'])
  })

  it('finds none on CDs and digital releases', () => {
    expect(['1', '1-4', '', 'CD1-1', 'Video'].map(sideOf)).toEqual([undefined, undefined, undefined, undefined, undefined])
  })
})

describe('sidesOf', () => {
  it('lists the sides in order, skipping headings', () => {
    expect(sidesOf([track('', undefined, 'heading'), track('A1'), track('A2'), track('B1')])).toEqual(['A', 'B'])
  })

  it('offers nothing for one side, or when some tracks have no side', () => {
    expect(sidesOf([track('A1'), track('A2')])).toEqual([])
    expect(sidesOf([track('A1'), track('B1'), track('Bonus')])).toEqual([])
    expect(sidesOf()).toEqual([])
  })
})

describe('discsOf', () => {
  it('pairs the sides of a set of records', () => {
    expect(discsOf(['A', 'B', 'C', 'D'])).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ])
    expect(discsOf(['A', 'B'])).toEqual([])
    expect(discsOf(['A', 'B', 'C'])).toEqual([])
  })
})

describe('sidesLabel', () => {
  it('reads like a sentence', () => {
    expect(sidesLabel(['A'])).toBe('side A')
    expect(sidesLabel(['A', 'B'])).toBe('sides A and B')
    expect(sidesLabel(['A', 'B', 'C'])).toBe('sides A, B, and C')
  })
})

describe('a play of some sides', () => {
  const tracklist = [track('A1', '10:00'), track('A2', '10:00'), track('B1', '15:00'), track('B2')]

  it('times just those sides, guessing missing lengths from the rest', () => {
    expect(recordSeconds(tracklist, ['A'])).toEqual({ seconds: 1200, estimated: false })
    expect(recordSeconds(tracklist, ['B'])).toEqual({ seconds: 900 + 700, estimated: true })
    expect(recordSeconds(tracklist).seconds).toBe(2800)
  })

  it('counts only its own time on the stylus', () => {
    const lengths = new Map([[1, { seconds: 2800, estimated: true }]])
    expect(stylusUse([{ releaseId: 1, at: 1, seconds: 1200 }], lengths)).toEqual({ hours: 1200 / 3600, plays: 1, estimated: false })
  })

  it('scrobbles only the tracks on those sides, ending when it was logged', () => {
    const release = { id: 1, title: 'R', artists: [{ name: 'X' }], tracklist } as unknown as Release
    const listens = listensFor(release, 3_600_000, ['A'])
    expect(listens.map((l) => l.track_metadata.track_name)).toEqual(['A1', 'A2'])
    expect(listens.map((l) => l.listened_at)).toEqual([3600 - 1200, 3600 - 600])
  })
})
