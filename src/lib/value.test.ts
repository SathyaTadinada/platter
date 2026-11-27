import { describe, expect, it } from 'vitest'
import {
  byMonth,
  change,
  chartPaths,
  chartRanges,
  inRange,
  distribution,
  totalsBy,
  isFresh,
  paidTotal,
  parseMoney,
  valueBracket,
  valueOf,
  type PriceEntry,
  type ValueSnapshot,
} from './value'
import { localDate } from './time'

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
  it('goes by the lowest listing', () => {
    expect(valueOf(entry({ suggested: { 'Mint (M)': 50 } }), 'Mint (M)', 'lowest')).toEqual({ amount: 12, basis: 'lowest' })
    expect(valueOf(entry({ lowest: null }), 'Mint (M)', 'lowest')).toBeUndefined()
  })

  it('or by the suggestion for the copy grade, with nothing for a copy without one', () => {
    const p = entry({ suggested: { 'Very Good Plus (VG+)': 30, 'Mint (M)': 50 } })
    expect(valueOf(p, 'Very Good Plus (VG+)', 'suggested')).toEqual({ amount: 30, basis: 'suggested' })
    expect(valueOf(p, undefined, 'suggested')).toBeUndefined()
    expect(valueOf(entry(), 'Mint (M)', 'suggested')).toBeUndefined()
  })

  it('has nothing without a price', () => {
    expect(valueOf(undefined, undefined, 'lowest')).toBeUndefined()
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

describe('change', () => {
  it('gives the difference and percentage', () => {
    expect(change(100, 125)).toEqual({ abs: 25, pct: 0.25 })
    expect(change(0, 5)).toEqual({ abs: 5, pct: undefined })
  })
})

describe('distribution', () => {
  it('buckets amounts by price range', () => {
    const b = distribution([3, 12, 15, 60, 250, 100], (n) => `$${n}`)
    expect(b.map((x) => [x.label, x.count, x.total])).toEqual([
      ['Under $10', 1, 3],
      ['$10–$20', 2, 27],
      ['$20–$50', 0, 0],
      ['$50–$100', 1, 60],
      ['$100+', 2, 350],
    ])
  })
})

describe('totalsBy', () => {
  it('splits records across their groups and folds the tail into Other', () => {
    const rows = [
      { row: ['Rock'], amount: 10 },
      { row: ['Rock', 'Pop'], amount: 20 },
      { row: ['Jazz'], amount: 5 },
      { row: ['Folk'], amount: 1 },
    ]
    expect(totalsBy(rows, (r) => r, 3)).toEqual([
      { label: 'Rock', total: 20 },
      { label: 'Pop', total: 10 },
      { label: 'Other', total: 6 },
    ])
  })
})

describe('byMonth', () => {
  it('totals the last few months, including empty ones', () => {
    const rows = [
      { date: '2026-10-02', amount: 20 },
      { date: '2026-10-20T10:00:00-07:00', amount: 5 },
      { date: '2026-08-15', amount: 12 },
      { date: '2025-01-01', amount: 99 },
      { date: 'soon', amount: 1 },
    ]
    const m = byMonth(rows, 3, new Date(2026, 9, 14))
    expect(m.map((x) => [x.month, x.total])).toEqual([
      ['2026-08', 12],
      ['2026-09', 0],
      ['2026-10', 25],
    ])
  })
})

describe('chart ranges', () => {
  // a reading every day from the given date, for `days` days
  const daily = (from: string, days: number) =>
    Array.from({ length: days }, (_, i) => {
      const d = new Date(`${from}T12:00`)
      d.setDate(d.getDate() + i)
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return { date, at: 0, currency: 'USD', min: 0, median: 100 + i, max: 0, count: 1 }
    })

  it('offers only ranges shorter than the history', () => {
    expect(chartRanges(daily('2026-10-17', 42))).toEqual(['1W', '1M', 'All'])
    expect(chartRanges(daily('2025-06-01', 500))).toEqual(['1W', '1M', '3M', '1Y', 'All'])
    expect(chartRanges(daily('2026-11-20', 5))).toEqual(['All'])
  })

  it('needs two readings in a range to draw it', () => {
    const sparse = [...daily('2026-09-01', 1), ...daily('2026-11-27', 1)]
    expect(chartRanges(sparse)).toEqual(['All'])
  })

  it('counts back from the latest reading', () => {
    const shown = inRange(daily('2026-10-17', 42), '1W')
    expect(shown.map((s) => s.date)).toEqual([
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
    ])
    expect(inRange(daily('2026-10-17', 42), 'All')).toHaveLength(42)
  })
})
