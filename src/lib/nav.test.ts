import { beforeEach, describe, expect, it, vi } from 'vitest'

// nav.ts keeps module state, so each test gets a fresh copy
async function fresh() {
  vi.resetModules()
  return import('./nav')
}

// what wouter does on a link click, then what App does after the render
function go(nav: Awaited<ReturnType<typeof fresh>>, url: string, state: unknown = null) {
  history.pushState(state, '', url)
  const u = new URL(url, location.origin)
  nav.trackLocation(u.pathname, u.search.slice(1))
}

describe('back navigation', () => {
  beforeEach(() => {
    sessionStorage.clear()
    history.replaceState(null, '', '/')
  })

  it('goes back through history when the page behind is the one it came from', async () => {
    const nav = await fresh()
    nav.trackLocation('/', '')
    go(nav, '/results?q=currents')
    go(nav, '/release/1')
    expect(nav.backTarget('/search')).toEqual({ history: true })
  })

  it('returns to the results after leaving Search and coming back through the tab', async () => {
    const nav = await fresh()
    nav.trackLocation('/', '')
    go(nav, '/search')
    go(nav, '/results?q=currents')
    go(nav, '/release/1')
    go(nav, '/') // Collection tab

    const last = nav.lastSearch()
    expect(last).toEqual({ url: '/release/1', from: '/results?q=currents' })
    go(nav, last.url, { platterFrom: last.from }) // Search tab

    const back = nav.backTarget('/search')
    expect(back).toMatchObject({ to: '/results?q=currents' })
  })

  it('falls back when opened directly', async () => {
    const nav = await fresh()
    history.replaceState(null, '', '/release/1')
    nav.trackLocation('/release/1', '')
    expect(nav.backTarget('/search')).toMatchObject({ to: '/search' })
  })

  it('steps back for a fixed Back target only when that page is right behind', async () => {
    const nav = await fresh()
    nav.trackLocation('/', '')
    go(nav, '/settings')
    go(nav, '/import')
    expect(nav.backIsHistory('/settings')).toBe(true)
    expect(nav.backIsHistory('/scan')).toBe(false)
  })

  it('remembers scroll per history entry', async () => {
    const nav = await fresh()
    nav.trackLocation('/', '')
    nav.rememberScroll(400)
    const collection = history.state
    go(nav, '/collection/1')
    expect(nav.savedScroll()).toBe(0) // a new page starts at the top
    nav.rememberScroll(120)
    history.replaceState(collection, '') // as if Back was pressed
    expect(nav.savedScroll()).toBe(400)
  })

  it('gives a page back what it saved when you return to it', async () => {
    const nav = await fresh()
    nav.trackLocation('/results', 'artist=Bjork')
    nav.rememberPage({ filters: { format: 'Vinyl' } })
    const results = history.state
    go(nav, '/release/7')
    expect(nav.savedPage()).toBeUndefined()
    history.replaceState(results, '')
    expect(nav.savedPage()).toEqual({ filters: { format: 'Vinyl' } })
  })
})
