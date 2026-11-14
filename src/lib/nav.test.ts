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

  it("opens a tab's first page as it was left, wherever that tab was left", async () => {
    const nav = await fresh()
    track(nav)
    go(nav, '/search')
    nav.replaceAddress('/search?mode=barcode&barcode=123')
    go(nav, '/results?barcode=123')
    go(nav, '/release/1')
    tab(nav, 'collection')
    expect(here()).toBe('/')
    tab(nav, 'search')
    expect(here()).toBe('/search?mode=barcode&barcode=123')
    expect(nav.backTarget()).toMatchObject({ to: '/search' })
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

  it('opens Scan on the camera rather than where it was left', async () => {
    const nav = await fresh()
    track(nav)
    go(nav, '/scan')
    go(nav, '/play?barcode=1')
    go(nav, '/collection/4')
    tab(nav, 'stats')
    tab(nav, 'scan')
    expect(here()).toBe('/scan')
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

describe('home tabs', () => {
  it('keeps Platter account in Settings whatever it was opened from, and Back returns there', async () => {
    const nav = await fresh()
    track(nav)
    go(nav, '/stats')
    go(nav, '/account')
    expect(nav.sectionFor('/account')).toBe('settings')
    expect(await back(nav)).toBe('history')
    expect(here()).toBe('/stats')
  })

  it('opens Settings itself from Platter account, and each tab its own first page', async () => {
    const nav = await fresh()
    track(nav)
    go(nav, '/stats')
    go(nav, '/account')
    tab(nav, 'settings')
    expect(here()).toBe('/settings')
    go(nav, '/account')
    go(nav, '/account/profile')
    tab(nav, 'stats')
    expect(here()).toBe('/stats')
    tab(nav, 'settings')
    expect(here()).toBe('/settings')
    expect(nav.sectionFor('/settings')).toBe('settings')
  })

  it('never puts one page in two tabs, so tapping a tab twice stays put', async () => {
    const nav = await fresh()
    track(nav)
    go(nav, '/settings')
    go(nav, '/account')
    tab(nav, 'settings')
    tab(nav, 'settings')
    expect(here()).toBe('/settings')
    go(nav, '/account')
    expect(nav.backLabel()).toBe(undefined) // Settings hasn't named itself in this test
    expect(nav.backTarget()).toMatchObject({ history: true })
  })

  it('keeps a record or profile in the tab it was opened from', async () => {
    const nav = await fresh()
    track(nav)
    go(nav, '/stats')
    go(nav, '/collection/3')
    expect(nav.sectionFor('/collection/3')).toBe('stats')
    go(nav, '/u/someone')
    expect(nav.sectionFor('/u/someone')).toBe('stats')
    await back(nav)
    await back(nav)
    expect(here()).toBe('/stats')
  })

  it('forgets stacks from the version that could put a page in two tabs', async () => {
    sessionStorage.setItem('platter.stacks', JSON.stringify({ stats: [{ url: '/account', key: 'x', index: 0 }] }))
    const nav = await fresh()
    history.replaceState(null, '', '/stats')
    track(nav)
    expect(nav.tabTarget('stats', '/settings').href).toBe('/stats')
  })
})

describe('history places', () => {
  it('knows where a page opened after going back sits, so Back takes the right step', async () => {
    const nav = await fresh()
    track(nav)
    go(nav, '/stats')
    go(nav, '/u/someone')
    go(nav, '/collection/1')
    await back(nav)
    await back(nav)
    expect(here()).toBe('/stats')
    tab(nav, 'settings')
    go(nav, '/account')
    expect(await back(nav)).toBe('history')
    expect(here()).toBe('/settings')
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

    // the search page itself comes back as it was left
    await back(nav)
    expect(here()).toBe('/search')
    nav.rememberPage('search page')
    tab(nav, 'collection')
    tab(nav, 'search')
    expect(here()).toBe('/search')
    expect(nav.savedPage()).toBe('search page')
    go(nav, '/results?q=dummy')

    // the same search run fresh starts clean
    expect(nav.savedPage()).toBeUndefined()
  })
})

describe('back labels', () => {
  // what a page's header does as it shows: set its title, then App tracks the location
  function show(nav: Nav, url: string, title: string, state: unknown = null) {
    history.pushState(state, '', url)
    nav.rememberTitle(title)
    track(nav)
  }

  it('names the page Back goes to, even one whose title arrived after it opened', async () => {
    const nav = await fresh()
    nav.rememberTitle('Search')
    track(nav)
    show(nav, '/results?q=currents', 'currents')
    show(nav, '/release/1', '')
    nav.rememberTitle('Currents')
    expect(nav.backLabel()).toBe('currents')
    await back(nav)
    expect(nav.backLabel()).toBe('Search')
  })

  it("names the tab when Back falls back to it, and nothing before the page's been tracked", async () => {
    const nav = await fresh()
    history.replaceState(null, '', '/import')
    nav.rememberTitle('Import collection')
    expect(nav.backLabel('/settings')).toBeUndefined()
    track(nav)
    expect(nav.backLabel('/settings')).toBe('Settings')
  })
})

describe('which tab a page belongs to', () => {
  it('puts each page under its tab', async () => {
    const { sectionOf } = await fresh()
    expect(sectionOf('/')).toBe('collection')
    expect(sectionOf('/collection/12')).toBe('collection')
    expect(sectionOf('/scan')).toBe('scan')
    expect(sectionOf('/results')).toBe('search')
    expect(sectionOf('/u/tadinada')).toBe('search')
    expect(sectionOf('/stats/year')).toBe('stats')
    expect(sectionOf('/account')).toBe('settings')
    expect(sectionOf('/admin')).toBe('settings')
    expect(sectionOf('/sync')).toBe('settings')
  })

  it("doesn't match a page that only starts the same way", async () => {
    const { sectionOf } = await fresh()
    expect(sectionOf('/users')).toBe('collection')
    expect(sectionOf('/accounts')).toBe('collection')
  })
})
