import { describe, expect, it } from 'vitest'
import type { LibraryItem } from '../db/db'
import { collectionReport } from './report'
import type { PriceEntry } from './value'

const item = (releaseId: number, artist: string, fields: Record<number, string>) =>
  ({ instanceId: releaseId, releaseId, artist, title: 'T', fields }) as LibraryItem
const price = (releaseId: number, lowest: number | null, suggested?: Record<string, number>): PriceEntry => ({
  releaseId,
  at: 0,
  currency: 'USD',
  lowest,
  forSale: 1,
  suggested,
})

describe('collectionReport', () => {
  it('values each copy, sorts by artist, and adds it all up', () => {
    const r = collectionReport(
      [item(1, 'Zappa', { 1: 'Very Good (VG)', 5: '$20' }), item(2, 'Abba', { 1: 'Mint (M)' }), item(3, 'Bowie', { 5: '$5.50' })],
      new Map([
        [1, price(1, 30, { 'Very Good (VG)': 25 })],
        [2, price(2, 12)],
        [3, price(3, null)],
      ]),
      { media: 1, paid: 5 },
    )
    expect(r.rows.map((x) => [x.item.artist, x.value, x.paid])).toEqual([
      ['Abba', 12, undefined],
      ['Bowie', undefined, 5.5],
      ['Zappa', 25, 20],
    ])
    expect(r).toMatchObject({ value: 37, paid: 25.5, unpriced: 1 })
  })
})
