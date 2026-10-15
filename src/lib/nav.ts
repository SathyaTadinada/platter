// Navigation memory:
// - each history entry gets a depth, so Back knows whether there's an app page to go back to
// - each entry also notes the page it was opened from, so Back goes to that page even when
//   something else sits behind it in history (see below)
// - the Search tab remembers where you left it (results, a release), like tabs in iOS apps.
//   Coming back to it through the tab puts a different page behind it in history, so the
//   page it was originally opened from travels along and Back still returns there.

const DEPTH = 'platterDepth'
const FROM = 'platterFrom' // the page this one was opened from
const PREV = 'platterPrev' // the page actually behind this one in history
const LAST_SEARCH = 'platter.lastSearch'
const SEARCH_AREA = /^\/(search|results|release)(\/|$)/

type NavState = { [DEPTH]?: number; [FROM]?: string; [PREV]?: string }

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
    history.replaceState({ ...s, [DEPTH]: depth, [PREV]: prev, [FROM]: s[FROM] ?? prev }, '')
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

export function canGoBack() {
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
