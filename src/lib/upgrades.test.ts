import { describe, expect, it } from 'vitest'
import type { LibraryItem } from '../db/db'
import { defaultThreshold, needsUpgrade, ungraded } from './upgrades'

const grades = [
  'Mint (M)',
  'Near Mint (NM or M-)',
  'Very Good Plus (VG+)',
  'Very Good (VG)',
  'Good Plus (G+)',
  'Good (G)',
  'Fair (F)',
  'Poor (P)',
]
const item = (instanceId: number, grade: string | undefined, artist = 'A') =>
  ({ instanceId, artist, title: String(instanceId), fields: grade ? { 1: grade } : {} }) as LibraryItem

describe('upgrades', () => {
  const items = [
    item(1, 'Good (G)'),
    item(2, 'Poor (P)', 'B'),
    item(3, 'Fair (F)', 'C'),
    item(4, 'Fair (F)', 'A'),
    item(5, undefined),
    item(6, 'Mint (M)'),
  ]

  it('starts one step below Good', () => {
    expect(defaultThreshold(grades)).toBe('Fair (F)')
    expect(defaultThreshold(['Great', 'OK', 'Bad'])).toBe('OK')
  })

  it('lists records at or below the grade, worst first', () => {
    expect(needsUpgrade(items, 1, grades, 'Fair (F)').map((i) => i.instanceId)).toEqual([2, 4, 3])
    expect(needsUpgrade(items, 1, grades, 'Good (G)').map((i) => i.instanceId)).toEqual([2, 4, 3, 1])
    expect(needsUpgrade(items, 1, grades, 'Nope')).toEqual([])
  })

  it('counts records with no grade', () => {
    expect(ungraded(items, 1, grades)).toBe(1)
  })
})
