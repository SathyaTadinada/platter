// Navigation memory. Each history entry records its depth (so Back knows whether there's an
// app page behind it), the page it was opened from, and a key for its scroll position.
// The Search tab also remembers where you left it, like tabs in iOS apps; coming back to
// it through the tab brings along the page it was opened from, so Back still goes there.

const DEPTH = 'platterDepth'
const KEY = 'platterKey' // names the entry, for its scroll position
const FROM = 'platterFrom' // the page this one was opened from
const PREV = 'platterPrev' // the page actually behind this one in history
const LAST_SEARCH = 'platter.lastSearch'
const SEARCH_AREA = /^\/(search|results|release)(\/|$)/

type NavState = { [DEPTH]?: number; [FROM]?: string; [PREV]?: string; [KEY]?: string }

let depth = 0
let started = false
let current = ''

const state = () => (history.state ?? {}) as NavState

export function trackLocation(path: string, search: string) {
  const url = path + (search ? `?${search}` : '')
  const s = state()
  if (typeof s[DEPTH] === 'number') {
    depth = s[DEPTH] // back/forward to an entry we've seen
  } else {
    depth = started ? depth + 1 : 0
    const prev = started ? current : undefined
    history.replaceState({ ...s, [DEPTH]: depth, [PREV]: prev, [FROM]: s[FROM] ?? prev, [KEY]: Math.random().toString(36).slice(2) }, '')
  }
  started = true
  current = url

  if (SEARCH_AREA.test(path)) {
    try {
      sessionStorage.setItem(LAST_SEARCH, JSON.stringify({ url, from: state()[FROM] }))
    } catch {
      // not important
    }
  }
}

function canGoBack() {
  const d = state()[DEPTH]
  return typeof d === 'number' && d > 0 && history.length > 1
}

// Where Back should go: history.back() when the page behind this one is the one it was
// opened from, otherwise that page (or the fallback) as a fresh navigation
export function backTarget(fallback: string): { history: true } | { to: string; state: NavState } {
  const s = state()
  // the replacement takes this entry's place, so it keeps its depth and what's behind it
  const keep = { [DEPTH]: s[DEPTH], [PREV]: s[PREV] }
  if (s[FROM] && s[FROM] !== s[PREV]) return { to: s[FROM], state: keep }
  return canGoBack() ? { history: true } : { to: fallback, state: keep }
}

// For a Back that always goes to one page: step back through history when that page is
// right behind this one (so it comes back as it was, scroll included), otherwise go there
export function backIsHistory(path: string) {
  const prev = state()[PREV]
  return canGoBack() && prev !== undefined && prev.split('?')[0] === path
}

export const inSearchArea = (path: string) => SEARCH_AREA.test(path)

export function lastSearch(): { url: string; from?: string } {
  try {
    const v = JSON.parse(sessionStorage.getItem(LAST_SEARCH) ?? 'null')
    if (v && typeof v.url === 'string') return v
  } catch {
    // not important
  }
  return { url: '/search' }
}

// Scroll positions by history entry. The page scrolls inside <main>, not the window, so the
// browser can't put you back where you were when you go back; this does it instead.
const scrolls = new Map<string, number>()

export function rememberScroll(top: number) {
  const k = state()[KEY]
  if (k) scrolls.set(k, top)
}

// Where to scroll after a navigation: the saved spot when going back or forward to an entry,
// otherwise the top
export const savedScroll = () => scrolls.get(state()[KEY] ?? '') ?? 0
