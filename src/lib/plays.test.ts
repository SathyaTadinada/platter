import { describe, expect, it } from 'vitest'
import { listensFor, parseDuration } from '../api/listenbrainz'
import type { Release } from '../api/discogs/types'
import type { LibraryItem } from '../db/db'
import { listening, listeningStats, nextPlayValues, type Play } from './plays'

const item = (instanceId: number, fields: Record<number, string> = {}) =>
  ({ instanceId, releaseId: instanceId * 10, fields }) as LibraryItem
const play = (instanceId: number, at: number): Play => ({ instanceId, releaseId: instanceId * 10, at, before: {} })
const ids = { count: 8, last: 9 }
const day = (s: string) => Date.parse(`${s}T12:00`)

describe('nextPlayValues', () => {
  it('bumps the count and sets today', () => {
    expect(nextPlayValues(item(1, { 8: '4' }), ids, day('2026-10-14'))).toEqual({ 8: '5', 9: '2026-10-14' })
    expect(nextPlayValues(item(1, { 8: 'lots' }), ids, day('2026-10-14'))[8]).toBe('1')
  })

  it('skips fields that are not set up', () => {
    expect(nextPlayValues(item(1), { last: 9 }, day('2026-10-14'))).toEqual({ 9: '2026-10-14' })
  })
})

describe('listening', () => {
  it('combines Discogs fields with the local log', () => {
    const rows = listening(
      [item(1, { 8: '7', 9: '2025-01-01' }), item(2), item(3, { 9: '2026-09-01' })],
      [play(2, day('2026-10-10')), play(2, day('2026-10-12')), play(1, day('2026-10-01'))],
      ids,
    )
    expect(rows.map((r) => [r.item.instanceId, r.count, r.last])).toEqual([
      [1, 7, day('2026-10-01')],
      [2, 2, day('2026-10-12')],
      [3, 0, day('2026-09-01')],
    ])
  })
})

describe('listeningStats', () => {
  it('sorts most played, recent, forgotten, and never played', () => {
    const now = day('2026-10-14')
    const rows = [
      { item: item(1), count: 3, last: day('2026-10-01') },
      { item: item(2), count: 9, last: day('2024-05-01') },
      { item: item(3), count: 0 },
      { item: item(4), count: 1, last: day('2025-06-01') },
    ]
    const s = listeningStats(rows, now)
    expect(s.mostPlayed.map((r) => r.item.instanceId)).toEqual([2, 1, 4])
    expect(s.recent.map((r) => r.item.instanceId)).toEqual([1, 4, 2])
    expect(s.dusty.map((r) => r.item.instanceId)).toEqual([2, 4])
    expect(s.never.map((r) => r.item.instanceId)).toEqual([3])
  })
})

describe('listenbrainz', () => {
  it('parses track lengths', () => {
    expect(parseDuration('4:05')).toBe(245)
    expect(parseDuration('1:02:03')).toBe(3723)
    expect(parseDuration('')).toBeUndefined()
    expect(parseDuration(undefined)).toBeUndefined()
  })

  it('times listens so the last track ends when the play was logged', () => {
    const release = {
      id: 5,
      title: 'Album',
      artists: [{ name: 'Band (2)' }],
      tracklist: [
        { position: '', title: 'Side A', type_: 'heading' },
        { position: 'A1', title: 'One', duration: '3:00' },
        { position: 'A2', title: 'Two', duration: '', artists: [{ name: 'Guest' }] },
        { position: 'B1', title: 'Three', duration: '2:00' },
      ],
    } as unknown as Release
    const listens = listensFor(release, 1_000_000_000)
    expect(listens.map((l) => [l.track_metadata.track_name, l.track_metadata.artist_name, l.listened_at])).toEqual([
      ['One', 'Band', 1_000_000 - 120 - 210 - 180],
      ['Two', 'Guest', 1_000_000 - 120 - 210],
      ['Three', 'Band', 1_000_000 - 120],
    ])
    expect(listens[0].track_metadata.additional_info).toMatchObject({ tracknumber: 'A1', duration_ms: 180_000, discogs_release_id: 5 })
  })
})
