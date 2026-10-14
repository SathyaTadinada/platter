import { describe, expect, it } from 'vitest'
import {
  chartPaths,
  isFresh,
  localDate,
  paidTotal,
  parseMoney,
  upsertDaily,
  valueBracket,
  valueOf,
  type PriceEntry,
  type ValueSnapshot,
} from './value'

describe('parseMoney', () => {
  it.each([
    ['$1,546.30', 1546.3],
    ['€1.546,30', 1546.3],
    ['1 546,30 kr', 1546.3],
    ['25', 25],
    ['24.99', 24.99],
    ['24,5', 24.5],
    ['1,546', 1546],
    ['1,234,567', 1234567],
    ['1.234.567', 1234567],
    ['£12', 12],
  ])('%s', (s, n) => expect(parseMoney(s)).toBe(n))

  it('ignores text without a number', () => {
    expect(parseMoney('free')).toBeUndefined()
    expect(parseMoney('')).toBeUndefined()
    expect(parseMoney(undefined)).toBeUndefined()
  })
})

const entry = (p: Partial<PriceEntry> = {}): PriceEntry => ({ releaseId: 1, at: 0, currency: 'USD', lowest: 12, forSale: 3, ...p })

describe('valueOf', () => {
  it('uses the suggestion for the copy grade', () => {
    const p = entry({ suggested: { 'Very Good Plus (VG+)': 30, 'Mint (M)': 50 } })
    expect(valueOf(p, 'Very Good Plus (VG+)')).toEqual({ amount: 30, basis: 'suggested' })
  })

  it('falls back to the lowest listing', () => {
    expect(valueOf(entry(), 'Mint (M)')).toEqual({ amount: 12, basis: 'lowest' })
    expect(valueOf(entry({ suggested: { 'Mint (M)': 50 } }))).toEqual({ amount: 12, basis: 'lowest' })
  })

  it('has nothing without listings or suggestions', () => {
    expect(valueOf(entry({ lowest: null }))).toBeUndefined()
    expect(valueOf(undefined)).toBeUndefined()
  })
})

describe('isFresh', () => {
  it('expires after six hours or a currency change', () => {
    const p = entry({ at: 1000 })
    expect(isFresh(p, 'USD', 1000 + 5 * 3600_000)).toBe(true)
    expect(isFresh(p, 'USD', 1000 + 6 * 3600_000)).toBe(false)
    expect(isFresh(p, 'EUR', 1000)).toBe(false)
  })
})

describe('valueBracket', () => {
  const money = (n: number) => `$${n}`
  it.each([
    [250, '$100 and up'],
    [100, '$100 and up'],
    [75, '$50 to $100'],
    [20, '$20 to $50'],
    [12, '$10 to $20'],
    [3, 'Under $10'],
    [undefined, 'No price yet'],
  ])('%s', (n, label) => expect(valueBracket(n, money)).toBe(label))
})

const snap = (date: string, median: number): ValueSnapshot => ({
  date,
  at: Date.parse(date),
  currency: 'USD',
  min: median / 2,
  median,
  max: median * 2,
  count: 10,
})

describe('upsertDaily', () => {
  it('keeps one reading per day, in order', () => {
    const h = upsertDaily([snap('2026-10-02', 10), snap('2026-10-01', 9)], snap('2026-10-02', 11))
    expect(h.map((s) => [s.date, s.median])).toEqual([
      ['2026-10-01', 9],
      ['2026-10-02', 11],
    ])
  })
})

describe('localDate', () => {
  it('formats in local time', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 30).getTime())).toBe('2026-01-05')
  })
})

describe('paidTotal', () => {
  it('adds up parseable prices', () => {
    const items: { fields: Record<number, string> }[] = [
      { fields: { 5: '$25.00' } },
      { fields: { 5: '10' } },
      { fields: { 5: 'gift' } },
      { fields: {} },
    ]
    expect(paidTotal(items, 5)).toEqual({ total: 35, count: 2 })
    expect(paidTotal(items, undefined)).toEqual({ total: 0, count: 0 })
  })
})

describe('chartPaths', () => {
  it('needs two readings', () => {
    expect(chartPaths([snap('2026-10-01', 10)], 100, 50)).toBeNull()
  })

  it('scales the median to the box with some headroom', () => {
    const p = chartPaths([snap('2026-10-01', 10), snap('2026-10-03', 20)], 100, 60, 0)!
    expect(p.line).toBe('M0.0,50.0 L100.0,10.0')
    expect(p.area).toBe('M0.0,50.0 L100.0,10.0 L100.0,60 L0.0,60 Z')
  })
})
