// Two bits of navigation memory:
// - each history entry gets a depth, so Back knows whether there's an app page to go back to
// - the Search tab remembers where you left it (results, a release), like tabs in iOS apps

const DEPTH = 'platterDepth'
const LAST_SEARCH = 'platter.lastSearch'
const SEARCH_AREA = /^\/(search|results|release)(\/|$)/

let depth = 0
let started = false

export function trackLocation(path: string, search: string) {
  const state = history.state as Record<string, unknown> | null
  if (typeof state?.[DEPTH] === 'number') {
    depth = state[DEPTH] as number // back/forward to an entry we've seen
  } else {
    depth = started ? depth + 1 : 0
    history.replaceState({ ...(state ?? {}), [DEPTH]: depth }, '')
  }
  started = true

  if (SEARCH_AREA.test(path)) {
    try {
      sessionStorage.setItem(LAST_SEARCH, path + (search ? `?${search}` : ''))
    } catch {
      // not important
    }
  }
}

export function canGoBack() {
  const d = (history.state as Record<string, unknown> | null)?.[DEPTH]
  return typeof d === 'number' && d > 0 && history.length > 1
}

export const inSearchArea = (path: string) => SEARCH_AREA.test(path)

export function lastSearchHref(): string {
  try {
    return sessionStorage.getItem(LAST_SEARCH) ?? '/search'
  } catch {
    return '/search'
  }
}
