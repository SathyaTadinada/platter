// Navigation memory. Every page has a home tab, and that's the tab the sidebar and tab bar show
// as current. The one exception is a page about one thing (a record, a release, someone's
// profile), which can be reached from anywhere and stays in the tab it was opened from, so it
// doesn't pull you somewhere else.
//
// Each tab keeps a stack of the pages opened in it, for the Back button and its label. Back goes
// to the page before in that stack, or, for a page opened from another tab, back to that page.
// A tab's icon always opens its first page, as it was left (scroll, filters). The browser's own
// Back and Forward still work as usual, and the stacks follow along.

export type Section = 'collection' | 'scan' | 'search' | 'stats' | 'settings'

export const ROOTS: Record<Section, string> = {
  collection: '/',
  scan: '/scan',
  search: '/search',
  stats: '/stats',
  settings: '/settings',
}

// A page's home tab
export function sectionOf(path: string): Section {
  if (/^\/(scan|batch|play)(\/|$)/.test(path)) return 'scan'
  // profiles are found in Search, so one opened from a link lands there too
  if (/^\/(search|results|release|u|following)(\/|$)/.test(path)) return 'search'
  if (/^\/(stats|value)(\/|$)/.test(path)) return 'stats'
  if (/^\/(settings|import|setup|crates|listenbrainz|sync|account|admin|about)(\/|$)/.test(path)) return 'settings'
  return 'collection'
}

const ROOT_TITLES: Record<Section, string> = {
  collection: 'Collection',
  scan: 'Scan',
  search: 'Search',
  stats: 'Stats',
  settings: 'Settings',
}

const rootOf = (path: string) => (Object.keys(ROOTS) as Section[]).find((s) => ROOTS[s] === path)

// pages about one thing, which stay in the tab they were opened from
const SHARED = /^\/(collection|release|u)\/[^/]+$/
const pathOf = (url: string) => url.split('?')[0]

const KEY = 'platterKey' // names the page, for its stack entry, scroll position and saved state
const SECTION = 'platterSection' // the tab it belongs to
const RESUME = 'platterResume' // set when returning to a page already in a stack: its key
const INDEX = 'platterIndex' // its place in the browser's history
const STACKS = 'platter.stacks2' // (the first version could put a page in two tabs)

type NavState = { [KEY]?: string; [SECTION]?: Section; [RESUME]?: string; [INDEX]?: number }
// title: for the next page's Back button. from: the page in another tab this one was opened from,
// for a page that's first in its stack
type Entry = { url: string; key: string; index: number; title?: string; from?: Entry & { section: Section } }

const state = () => (history.state ?? {}) as NavState
const newKey = () => Math.random().toString(36).slice(2)
const emptyStacks = (): Record<Section, Entry[]> => ({ collection: [], scan: [], search: [], stats: [], settings: [] })

// kept for the tab (not the device), so a reload doesn't lose them
function loadStacks(): Record<Section, Entry[]> {
  try {
    return { ...emptyStacks(), ...JSON.parse(sessionStorage.getItem(STACKS) ?? '{}') }
  } catch {
    return emptyStacks()
  }
}

let stacks = loadStacks()
let here: { section: Section; key: string; index: number } | null = null
// Whether the last navigation added a history entry or replaced one. The router does the
// pushing, so it's noted on the way through rather than worked out from history.length, which
// doesn't grow when a page is opened after going back.
let pushed = false
const push = history.pushState.bind(history)
const replace = history.replaceState.bind(history)
history.pushState = (...args: Parameters<History['pushState']>) => {
  pushed = true
  push(...args)
}
history.replaceState = (...args: Parameters<History['replaceState']>) => {
  pushed = false
  replace(...args)
}
// The title the page being shown asked for. A new page sets it before trackLocation has made
// its stack entry (child effects run first), so it's held here until then.
let shownTitle = ''

const listeners = new Set<() => void>()
const changed = () => listeners.forEach((l) => l())
export function subscribeNav(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function save() {
  try {
    sessionStorage.setItem(STACKS, JSON.stringify(stacks))
  } catch {
    // not important
  }
}

// The tab the page being shown belongs to. Works while rendering, before trackLocation runs.
export function sectionFor(path: string): Section {
  if (!SHARED.test(path)) return sectionOf(path)
  return state()[SECTION] ?? here?.section ?? sectionOf(path)
}

// The page being shown, as its stack has it
const entryHere = () => (here ? stacks[here.section].find((e) => e.key === here!.key) : undefined)

export function trackLocation(path: string, search: string) {
  const url = path + (search ? `?${search}` : '')
  const s = state()
  const added = pushed
  pushed = false

  if (s[KEY]) {
    // back or forward to a page seen before, or this one's address changing in place
    const section = SHARED.test(path) ? (s[SECTION] ?? sectionOf(path)) : sectionOf(path)
    const index = s[INDEX] ?? history.length - 1
    const stack = stacks[section]
    const i = stack.findIndex((e) => e.key === s[KEY])
    const title = shownTitle || stack[i]?.title
    if (i >= 0) stack.splice(i, Infinity, { ...stack[i], url, index, title })
    else stack.push({ url, key: s[KEY], index, title })
    here = { section, key: s[KEY], index }
  } else {
    const section = sectionFor(path)
    const opener = here && here.section !== section ? entryHere() : undefined
    const openerSection = here?.section
    // (on the first page, the last entry: the app was just opened)
    const index = !here ? history.length - 1 : added ? here.index + 1 : here.index
    let stack = stacks[section]
    let key = newKey()
    let title = shownTitle || undefined
    let from: Entry['from']
    const back = s[RESUME] ? stack.findIndex((e) => e.key === s[RESUME]) : -1
    if (back >= 0) {
      // returning to a page in this stack: it keeps its key, and so its scroll and state
      key = s[RESUME]!
      title ??= stack[back].title
      from = stack[back].from
      stack = stack.slice(0, back)
    } else if (rootOf(path) === section) {
      stack = [] // a tab's first page starts its stack over
    } else if (opener && openerSection) {
      // opened from another tab: it starts this tab's stack, and Back returns to where it came from
      stack = []
      from = { ...opener, from: undefined, section: openerSection }
    } else if (stack.at(-1)?.url === url) {
      stack = stack.slice(0, -1) // the same page again, like after a replace
    }
    stacks[section] = [...stack, { url, key, index, title, from }]
    replace({ ...s, [KEY]: key, [SECTION]: section, [INDEX]: index }, '')
    here = { section, key, index }
  }
  save()
  changed()
}

// The page's title, for the Back button of whatever is opened from it
export function rememberTitle(title: string) {
  shownTitle = title
  const s = state()
  const entry = s[SECTION] && stacks[s[SECTION]].find((e) => e.key === s[KEY])
  if (!title || !entry || entry.title === title) return
  entry.title = title
  save()
  changed()
}

// Changes the address of the page being shown, without a navigation (so it isn't a new page)
export function replaceAddress(url: string) {
  replace(history.state, '', url)
  const s = state()
  const entry = s[SECTION] && stacks[s[SECTION]].find((e) => e.key === s[KEY])
  if (entry) entry.url = url
  save()
}

// Where Back goes: the page before this one in its tab, or the page in another tab it was opened
// from. Through the browser's own history when that's the page right behind (so it comes back
// exactly as it was), otherwise straight there. With neither, the given page or the tab's first.
export function backTarget(fallback?: string): { history: true } | { to: string; state: NavState } {
  const s = state()
  const section = s[SECTION] ?? here?.section ?? 'collection'
  const stack = stacks[section]
  const i = stack.findIndex((e) => e.key === s[KEY])
  const prev = i > 0 ? stack[i - 1] : i === 0 ? stack[0].from : undefined
  if (prev) {
    if (prev.index === (s[INDEX] ?? 0) - 1) return { history: true }
    const tab = i === 0 ? stack[0].from!.section : section
    return { to: prev.url, state: { [SECTION]: tab, [RESUME]: prev.key } }
  }
  return { to: fallback ?? ROOTS[section], state: { [SECTION]: section } }
}

// What Back leads to, by name. Undefined when that isn't known (a page whose title hasn't come yet).
export function backLabel(fallback?: string): string | undefined {
  const s = state()
  const section = s[SECTION] ?? here?.section ?? 'collection'
  const stack = stacks[section]
  const i = stack.findIndex((e) => e.key === s[KEY])
  if (i < 0) return undefined // not tracked yet; trackLocation tells subscribers when it is
  if (i > 0) return stack[i - 1].title
  if (stack[0].from) return stack[0].from.title
  const root = rootOf(pathOf(fallback ?? ROOTS[section]))
  return root && ROOT_TITLES[root]
}

// Where a tab's icon goes: its first page, as it was left (its scroll and filters), or fresh if
// that's the page showing. Scan always opens on the camera.
export function tabTarget(section: Section, path: string): { href: string; state: NavState } {
  const first = stacks[section][0]
  const kept = first && rootOf(pathOf(first.url)) === section && section !== 'scan'
  if (!kept) return { href: ROOTS[section], state: { [SECTION]: section } }
  if (path === pathOf(first.url) && here?.key === first.key) return { href: first.url, state: { [SECTION]: section } }
  return { href: first.url, state: { [SECTION]: section, [RESUME]: first.key } }
}

// Scroll positions by page. The app scrolls inside <main>, not the window, so the browser
// can't put you back where you were; this does it instead.
const scrolls = new Map<string, number>()

// the page being shown: before trackLocation has run, a page being returned to goes by the
// key it's getting back
const currentKey = () => state()[KEY] ?? state()[RESUME] ?? ''

export function rememberScroll(top: number) {
  const k = state()[KEY]
  if (k) scrolls.set(k, top)
}

// Where to scroll after a navigation: the saved spot for a page being returned to,
// otherwise the top
export const savedScroll = () => scrolls.get(currentKey()) ?? 0

// Anything else a page wants back when you return to it, like the filters on search results
const pages = new Map<string, unknown>()

export function rememberPage(v: unknown) {
  const k = state()[KEY]
  if (k) pages.set(k, v)
}

export const savedPage = <T>() => pages.get(currentKey()) as T | undefined
