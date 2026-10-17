// Navigation memory, organized like the tabs in a phone app. Each tab keeps its own stack of
// pages: a page opened from a tab joins that tab's stack (so a release opened from the
// wantlist belongs to Collection), Back steps down the stack, and a tab brings back the page
// it was left on, or its first page when it's already showing. The browser's own Back and
// Forward still work as usual, and the stacks follow along.

export type Section = 'collection' | 'scan' | 'search' | 'stats' | 'settings'

export const ROOTS: Record<Section, string> = {
  collection: '/',
  scan: '/scan',
  search: '/search',
  stats: '/stats',
  settings: '/settings',
}

// Where a page belongs when nothing else says (opened directly, or after a reload)
export function sectionOf(path: string): Section {
  if (/^\/(scan|batch|play)(\/|$)/.test(path)) return 'scan'
  if (/^\/(search|results|release)(\/|$)/.test(path)) return 'search'
  if (/^\/(stats|value)(\/|$)/.test(path)) return 'stats'
  if (/^\/(settings|import|setup|crates|listenbrainz|about)(\/|$)/.test(path)) return 'settings'
  return 'collection'
}

const rootOf = (path: string) => (Object.keys(ROOTS) as Section[]).find((s) => ROOTS[s] === path)

const KEY = 'platterKey' // names the page, for its stack entry, scroll position and saved state
const SECTION = 'platterSection' // the tab it belongs to
const RESUME = 'platterResume' // set when returning to a page already in a stack: its key
const INDEX = 'platterIndex' // its place in the browser's history
const STACKS = 'platter.stacks'

type NavState = { [KEY]?: string; [SECTION]?: Section; [RESUME]?: string; [INDEX]?: number }
type Entry = { url: string; key: string; index: number }

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
let length = 0 // history.length last time, to tell a new entry from a replaced one

function save() {
  try {
    sessionStorage.setItem(STACKS, JSON.stringify(stacks))
  } catch {
    // not important
  }
}

// The tab the page being shown belongs to. Works while rendering, before trackLocation runs:
// a new page belongs to the tab it was opened from.
export function sectionFor(path: string): Section {
  return state()[SECTION] ?? rootOf(path) ?? here?.section ?? sectionOf(path)
}

export function trackLocation(path: string, search: string) {
  const url = path + (search ? `?${search}` : '')
  const s = state()
  const pushed = history.length > length
  length = history.length

  if (s[KEY]) {
    // back or forward to a page seen before, or this one's address changing in place
    const section = s[SECTION] ?? sectionOf(path)
    const index = s[INDEX] ?? history.length - 1
    const stack = stacks[section]
    const i = stack.findIndex((e) => e.key === s[KEY])
    if (i >= 0) stack.splice(i, Infinity, { url, key: s[KEY], index })
    else stack.push({ url, key: s[KEY], index })
    here = { section, key: s[KEY], index }
  } else {
    const section = sectionFor(path)
    const index = pushed || !here ? history.length - 1 : here.index
    let stack = stacks[section]
    let key = newKey()
    const back = s[RESUME] ? stack.findIndex((e) => e.key === s[RESUME]) : -1
    if (back >= 0) {
      // returning to a page in this stack: it keeps its key, and so its scroll and state
      key = s[RESUME]!
      stack = stack.slice(0, back)
    } else if (rootOf(path) === section) {
      stack = [] // a tab's first page starts its stack over
    } else if (stack.at(-1)?.url === url) {
      stack = stack.slice(0, -1) // the same page again, like after a replace
    }
    stacks[section] = [...stack, { url, key, index }]
    history.replaceState({ ...s, [KEY]: key, [SECTION]: section, [INDEX]: index }, '')
    here = { section, key, index }
  }
  save()
}

// Changes the address of the page being shown, without a navigation (so it isn't a new page)
export function replaceAddress(url: string) {
  history.replaceState(history.state, '', url)
  const s = state()
  const entry = s[SECTION] && stacks[s[SECTION]].find((e) => e.key === s[KEY])
  if (entry) entry.url = url
  save()
}

// Where Back goes: the page before this one in its tab, through the browser's own history
// when that's the page right behind (so it comes back exactly as it was), otherwise straight
// there. With nothing before it, the given page or the tab's first page.
export function backTarget(fallback?: string): { history: true } | { to: string; state: NavState } {
  const s = state()
  const section = s[SECTION] ?? here?.section ?? 'collection'
  const stack = stacks[section]
  const i = stack.findIndex((e) => e.key === s[KEY])
  const prev = i > 0 ? stack[i - 1] : undefined
  if (prev) {
    if (prev.index === (s[INDEX] ?? 0) - 1) return { history: true }
    return { to: prev.url, state: { [SECTION]: section, [RESUME]: prev.key } }
  }
  return { to: fallback ?? ROOTS[section], state: { [SECTION]: section } }
}

// Where a tab's icon goes: back where that tab was left, or its first page if it's showing
export function tabTarget(section: Section, path: string): { href: string; state: NavState } {
  const top = stacks[section].at(-1)
  if (sectionFor(path) === section || !top) return { href: ROOTS[section], state: { [SECTION]: section } }
  return { href: top.url, state: { [SECTION]: section, [RESUME]: top.key } }
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
