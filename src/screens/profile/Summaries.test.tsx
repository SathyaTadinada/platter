import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProfileStats, ProfileYear } from '../../lib/profile'
import { byMonth } from '../../lib/value'
import { StatsView, YearView } from './Summaries'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)
afterEach(() => act(() => root.render(null)))

const text = () => host.textContent ?? ''
const record = (id: number, title: string) => ({ id, title, artist: 'Fleetwood Mac' })
const months = (n: number) => byMonth([{ date: new Date().toISOString(), amount: n }], 12)

const stats: ProfileStats = {
  records: 3,
  played: 2,
  playsByMonth: months(3),
  mostPlayed: [
    { item: record(2, 'Tusk'), count: 2 },
    { item: record(1, 'Rumours'), count: 1 },
  ],
  recent: [{ item: record(2, 'Tusk'), at: Date.now() }],
  addedByMonth: months(1),
  genres: [{ label: 'Rock', count: 2 }],
  decades: [{ label: '1970s', count: 3 }],
}

describe('StatsView', () => {
  it('shows plays, the records behind them, and the collection by genre and decade', async () => {
    await act(() => root.render(<StatsView stats={stats} />))
    expect(text()).toContain('of 3 played')
    expect(text()).toContain('Most played')
    expect(text()).toContain('2 plays')
    expect(text()).toContain('Recently played')
    expect(text()).toContain('By genre')
    expect(text()).toContain('1970s')
    // their records open the release, not a record in the visitor's own collection
    expect(host.querySelector('a[href="/release/2"]')).not.toBeNull()
    expect(host.querySelector('a[href^="/collection/"]')).toBeNull()
  })

  it('leaves out the listening parts for someone who hasn’t played anything', async () => {
    await act(() => root.render(<StatsView stats={{ ...stats, played: 0, mostPlayed: [], recent: [], playsByMonth: months(0) }} />))
    expect(text()).not.toContain('Most played')
    expect(text()).not.toContain('Recently played')
    expect(text()).toContain('Added by month')
  })
})

const year = (y: number, added: number, plays: number): ProfileYear => ({
  year: y,
  added,
  newest: [record(3, `New in ${y}`)],
  addedByMonth: months(added),
  plays,
  played: plays ? 1 : 0,
  hours: 2.5,
  playsByMonth: months(plays),
  topRecords: plays ? [{ item: record(3, `New in ${y}`), count: plays }] : [],
  topArtists: plays ? [{ name: 'Fleetwood Mac', count: plays }] : [],
  decade: 1970,
  first: { item: record(3, `New in ${y}`), date: `${y}-02-01T10:00:00Z` },
})

describe('YearView', () => {
  it('starts on the newest year and steps back through the others', async () => {
    await act(() => root.render(<YearView years={[year(2024, 2, 0), year(2025, 4, 7)]} />))
    expect(text()).toContain('2025')
    expect(text()).toContain('Top artists')
    expect(text()).toContain('the 1970s')
    const earlier = host.querySelector<HTMLButtonElement>('button[aria-label="Earlier year"]')!
    await act(() => earlier.click())
    expect(text()).toContain('2024')
    expect(text()).not.toContain('Top artists')
    expect(earlier.disabled).toBe(true)
  })

  it('never shows what was spent', async () => {
    await act(() => root.render(<YearView years={[year(2025, 4, 7)]} />))
    expect(text()).not.toMatch(/spent|Biggest buy/)
  })
})
