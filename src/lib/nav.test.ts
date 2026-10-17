import { beforeEach, describe, expect, it, vi } from 'vitest'

type Nav = Awaited<ReturnType<typeof fresh>>

// nav.ts keeps module state, so each test gets a fresh copy
async function fresh() {
  vi.resetModules()
  return import('./nav')
}

const here = () => location.pathname + location.search
const track = (nav: Nav) => nav.trackLocation(location.pathname, location.search.slice(1))

// what wouter does on a link click, then what App does after the render
function go(nav: Nav, url: string, state: unknown = null) {
  history.pushState(state, '', url)
  track(nav)
}

function tab(nav: Nav, section: Parameters<Nav['tabTarget']>[0]) {
  const t = nav.tabTarget(section, location.pathname)
  go(nav, t.href, t.state)
}

// what the Back button does
async function back(nav: Nav, fallback?: string) {
  const t = nav.backTarget(fallback)
  if ('history' in t) {
    await new Promise((r) => {
      addEventListener('popstate', r, { once: true })
      history.back()
    })
  } else {
    history.replaceState(t.state, '', t.to)
  }
  track(nav)
  return 'history' in t ? 'history' : 'jump'
}

beforeEach(async () => {
  sessionStorage.clear()
  history.replaceState(null, '', '/')
})

describe('back navigation', () => {
  it("steps back through the browser's history when the page behind is the one before", async () => {
    const nav = await fresh()
    track(nav)
    go(nav, '/search')
    go(nav, '/results?q=currents')
    go(nav, '/release/1')
    expect(await back(nav)).toBe('history')
    expect(here()).toBe('/results?q=currents')
    expect(await back(nav)).toBe('history')
    expect(here()).toBe('/search')
  })

  it('goes back through the Search tab after leaving it for Collection', async () => {
    const nav = await fresh()
    track(nav)
    go(nav, '/search')
    go(nav, '/results?q=currents')
    go(nav, '/release/1')
    tab(nav, 'collection')
    expect(here()).toBe('/')
    tab(nav, 'search')
    expect(here()).toBe('/release/1')
    await back(nav)
    expect(here()).toBe('/results?q=currents')
    await back(nav)
    expect(here()).toBe('/search')
  })

  it("brings back a page's own address change when going back to it the long way", async () => {
    const nav = await fresh()
    track(nav)
    go(nav, '/search')
    nav.replaceAddress('/search?mode=barcode&barcode=123')
    go(nav, '/results?barcode=123')
    tab(nav, 'collection')
    tab(nav, 'search')
    expect(await back(nav)).toBe('jump')
    expect(here()).toBe('/search?mode=barcode&barcode=123')
  })

  it('keeps a page in the tab it was opened from', async () => {
    const nav = await fresh()
    track(nav)
    go(nav, '/wantlist')
    go(nav, '/release/5')
    expect(nav.sectionFor('/release/5')).toBe('collection')
    await back(nav)
    expect(here()).toBe('/wantlist')
  })

  it('uses the previous page in the tab over a fixed Back page', async () => {
    const nav = await fresh()
    track(nav)
    go(nav, '/settings')
    go(nav, '/import')
    go(nav, '/batch')
    await back(nav, '/scan')
    expect(here()).toBe('/import')
  })

  it('falls back to the given page, or the first page in the tab, when opened directly', async () => {
    const nav = await fresh()
    history.replaceState(null, '', '/release/1')
    track(nav)
    expect(nav.backTarget()).toMatchObject({ to: '/search' })
    expect(nav.backTarget('/somewhere')).toMatchObject({ to: '/somewhere' })
  })

  it('goes to the first page when its tab is tapped while showing, and starts that tab over', async () => {
    const nav = await fresh()
    track(nav)
    go(nav, '/collection/3')
    tab(nav, 'collection')
    expect(here()).toBe('/')
    expect(nav.backTarget()).toMatchObject({ to: '/' })
  })

  it('remembers the tabs across a reload', async () => {
    let nav = await fresh()
    track(nav)
    go(nav, '/search')
    go(nav, '/results?q=x')
    nav = await fresh()
    track(nav)
    expect(nav.sectionFor('/results')).toBe('search')
    await back(nav)
    expect(here()).toBe('/search')
  })
})

describe('page memory', () => {
  it('remembers scroll per page', async () => {
    const nav = await fresh()
    track(nav)
    nav.rememberScroll(400)
    const collection = history.state
    go(nav, '/collection/1')
    expect(nav.savedScroll()).toBe(0) // a new page starts at the top
    nav.rememberScroll(120)
    history.replaceState(collection, '') // as if Back was pressed
    expect(nav.savedScroll()).toBe(400)
  })

  it('gives a page back what it saved, including after a trip to another tab', async () => {
    const nav = await fresh()
    track(nav)
    go(nav, '/search')
    go(nav, '/results?q=dummy')
    nav.rememberPage({ filters: { format: 'Vinyl' } })
    go(nav, '/release/7')
    expect(nav.savedPage()).toBeUndefined()
    await back(nav)
    expect(nav.savedPage()).toEqual({ filters: { format: 'Vinyl' } })

    tab(nav, 'collection')
    tab(nav, 'search')
    expect(here()).toBe('/results?q=dummy')
    expect(nav.savedPage()).toEqual({ filters: { format: 'Vinyl' } })

    // the same search run fresh starts clean
    go(nav, '/results?q=dummy')
    expect(nav.savedPage()).toBeUndefined()
  })
})
