import type { Identifier } from '../api/discogs/types'

// Matching what someone reads off the dead wax against the Matrix / Runout
// identifiers Discogs has for each candidate release.

// Uppercase, letters and digits only. Etchings are full of spaces, dashes,
// slashes and symbols that people (and OCR) transcribe inconsistently.
export const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

// Characters that are easy to confuse when etched or photographed. Applied to
// both sides, so matching letters still match and confusable ones meet in between.
const LOOKALIKES: Record<string, string> = { O: '0', I: '1', L: '1', S: '5', B: '8' }
export const loosen = (normalized: string) => normalized.replace(/[OILSB]/g, (c) => LOOKALIKES[c])

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

const ratio = (a: string, b: string) => (a.length || b.length ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 1)

// Best similarity between `input` and any stretch of `target` of about the
// same length. People often type only part of a long runout.
export function partialRatio(input: string, target: string): number {
  if (!input || !target) return 0
  if (input.length >= target.length) return ratio(input, target)
  let best = 0
  for (const len of [input.length - 1, input.length, input.length + 1]) {
    if (len < 1 || len > target.length) continue
    for (let i = 0; i + len <= target.length; i++) {
      best = Math.max(best, ratio(input, target.slice(i, i + len)))
      if (best === 1) return 1
    }
  }
  return best
}

// 0..1. A typed fragment that covers most of the runout scores a little better
// than one that only covers a few characters of it.
export function similarity(input: string, identifier: string): number {
  const a = normalize(input)
  const b = normalize(identifier)
  if (!a || !b) return 0
  const score = (x: string, y: string) => {
    const coverage = Math.min(1, x.length / y.length)
    return Math.max(ratio(x, y), partialRatio(x, y) * (0.85 + 0.15 * coverage))
  }
  // lookalike matches count, but slightly less than exact ones
  return Math.max(score(a, b), score(loosen(a), loosen(b)) * 0.96)
}

export type SideMatch = { input: string; identifier: Identifier; score: number }

export type RunoutResult =
  | { kind: 'nodata' } // Discogs has no runout info for this release
  | { kind: 'scored'; score: number; matches: SideMatch[] }

export const isRunout = (i: Identifier) => i.type === 'Matrix / Runout'

// Each thing the user typed is matched to its best identifier on the release;
// the release's score is the average over everything typed.
export function scoreRelease(inputs: string[], identifiers: Identifier[]): RunoutResult {
  const runouts = identifiers.filter(isRunout)
  if (!runouts.length) return { kind: 'nodata' }
  const typed = inputs.filter((s) => normalize(s).length >= 2)
  if (!typed.length) return { kind: 'scored', score: 0, matches: [] }

  const matches = typed.map((input) => {
    let best: SideMatch = { input, identifier: runouts[0], score: -1 }
    for (const id of runouts) {
      const s = similarity(input, id.value)
      if (s > best.score) best = { input, identifier: id, score: s }
    }
    return best
  })
  return { kind: 'scored', score: matches.reduce((n, m) => n + m.score, 0) / matches.length, matches }
}

export type Confidence = 'strong' | 'likely' | 'weak' | 'none'

export function confidence(score: number): Confidence {
  if (score >= 0.9) return 'strong'
  if (score >= 0.75) return 'likely'
  if (score >= 0.55) return 'weak'
  return 'none'
}

export type Ranked<T> = { item: T; result: RunoutResult }

// Good matches first, then releases with no runout data (unknown, not bad),
// then weak or missing matches.
export function rankByRunout<T>(items: T[], inputs: string[], identifiersOf: (item: T) => Identifier[] | undefined): Ranked<T>[] {
  const ranked = items.map((item) => {
    const ids = identifiersOf(item)
    return { item, result: ids ? scoreRelease(inputs, ids) : ({ kind: 'nodata' } as RunoutResult) }
  })
  const tier = (r: RunoutResult) => (r.kind === 'nodata' ? 1 : confidence(r.score) === 'none' ? 2 : 0)
  const score = (r: RunoutResult) => (r.kind === 'scored' ? r.score : 0)
  // stable sort keeps Discogs' own order within a tier
  return ranked
    .map((r, i) => ({ ...r, i }))
    .sort((a, b) => tier(a.result) - tier(b.result) || score(b.result) - score(a.result) || a.i - b.i)
    .map(({ item, result }) => ({ item, result }))
}

// Text fragments from OCR that look worth trying as a runout: anything with
// a few letters or digits, longest first.
export function runoutCandidates(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((l) =>
      l
        .replace(/[^A-Za-z0-9\s\-/.]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((l) => normalize(l).length >= 3 && /\d/.test(l))
  return [...new Set(lines)].sort((a, b) => normalize(b).length - normalize(a).length).slice(0, 8)
}
