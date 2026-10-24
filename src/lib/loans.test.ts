import { describe, expect, it } from 'vitest'
import { formatLoan, lentFor, loanName, parseLoan } from './loans'

const day = (s: string) => Date.parse(`${s}T12:00`)

describe('loans', () => {
  it('writes and reads back who has it and since when', () => {
    const v = formatLoan(' Alex ', day('2026-10-03'))
    expect(v).toBe('Alex (since 2026-10-03)')
    expect(parseLoan(v)).toEqual({ to: 'Alex', since: '2026-10-03' })
  })

  it('takes a name typed on Discogs without a date', () => {
    expect(parseLoan('Sam')).toEqual({ to: 'Sam' })
    expect(parseLoan('  ')).toBeNull()
  })

  it('filters by the person, not the date', () => {
    expect(loanName('Alex (since 2026-10-03)')).toBe('Alex')
    expect(loanName('Shelf B')).toBe('Shelf B')
  })

  it('says how long it has been out', () => {
    expect(lentFor('2026-10-24', day('2026-10-24'))).toBe('lent today')
    expect(lentFor('2026-10-19', day('2026-10-24'))).toBe('for 5 days')
    expect(lentFor('2026-10-03', day('2026-10-24'))).toBe('for 3 weeks')
    expect(lentFor('2026-06-01', day('2026-10-24'))).toBe('for 5 months')
    expect(lentFor('2025-01-01', day('2026-10-24'))).toBe('for over a year')
  })
})
