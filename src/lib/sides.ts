import type { Track } from '../api/discogs/types'

// Tracks that take up time on the record (not headings)
export const isTrack = (t: Track) => !t.type_ || t.type_ === 'track' || t.type_ === 'index'

// The side a track is on, from its position: "A2", "B", "1-C3", or "AA" (a single's flip side).
// CD and digital positions ("1", "1-4") have none.
export function sideOf(position = ''): string | undefined {
  return /^(?:\d+[-.])?([A-Z]|([A-Z])\2)(?=\d|\.|$)/.exec(position.trim())?.[1]
}

// The record's sides in order, when every track says which side it's on and there's more than one
export function sidesOf(tracklist: Track[] = []): string[] {
  const sides = tracklist.filter(isTrack).map((t) => sideOf(t.position))
  if (sides.some((s) => !s)) return []
  const unique = [...new Set(sides as string[])]
  return unique.length > 1 ? unique : []
}

// Pairs of sides, one per disc, for sets of two or more records
export function discsOf(sides: string[]): string[][] {
  if (sides.length < 4 || sides.length % 2) return []
  return sides.flatMap((s, i) => (i % 2 ? [] : [[s, sides[i + 1]]]))
}

// "side A", "sides A and B", "sides A, B, and C"
export function sidesLabel(sides: string[]): string {
  if (sides.length === 1) return `side ${sides[0]}`
  const last = sides.at(-1)
  return `sides ${sides.length === 2 ? `${sides[0]} and ${last}` : `${sides.slice(0, -1).join(', ')}, and ${last}`}`
}
