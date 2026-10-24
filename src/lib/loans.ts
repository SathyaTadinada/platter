import { localDate } from './value'

// A record lent out lives in an optional "Lent To" field on Discogs, so it shows on every
// device and on Discogs itself, e.g. "Alex (since 2026-10-24)". A value typed by hand
// without the date still counts; it just has no date.

export type Loan = { to: string; since?: string }

const PATTERN = /^(.*?)\s*\(since (\d{4}-\d{2}-\d{2})\)$/

export function parseLoan(value: string | undefined): Loan | null {
  const v = value?.trim()
  if (!v) return null
  const m = PATTERN.exec(v)
  return m ? { to: m[1].trim(), since: m[2] } : { to: v }
}

export const formatLoan = (to: string, now = Date.now()) => `${to.trim()} (since ${localDate(now)})`

// what filters and facets go by: the person, not the date
export const loanName = (value: string) => (PATTERN.test(value.trim()) ? parseLoan(value)!.to : value)

// how long it's been out: "lent today", "for 5 days", "for 3 weeks", "for over a year"
export function lentFor(since: string, now = Date.now()): string {
  const days = Math.floor((now - Date.parse(`${since}T00:00`)) / 86_400_000)
  if (days < 1) return 'lent today'
  if (days < 14) return `for ${days} day${days === 1 ? '' : 's'}`
  if (days < 60) return `for ${Math.round(days / 7)} weeks`
  if (days < 365) return `for ${Math.round(days / 30)} months`
  return 'for over a year'
}
