import { readPref, writePref } from './prefs'

// Which sections each Stats view (and Your year) shows, in which column, and in what order. Wide screens show the
// two columns side by side; phones show the left one, then the right. Kept per device, and synced.

export const VALUE_SECTIONS = [
  ['month', 'By month'],
  ['top', 'Most valuable'],
  ['overTime', 'Over time'],
  ['paid', 'Paid vs now'],
  ['price', 'By price'],
  ['breakdown', 'Breakdown'],
] as const

export const LISTENING_SECTIONS = [
  ['totals', 'Totals'],
  ['month', 'Plays by month'],
  ['most', 'Most played'],
  ['stylus', 'Stylus'],
  ['recent', 'Recently played'],
  ['dusty', 'Not played in a year'],
] as const

export const YEAR_SECTIONS = [
  ['month', 'Plays by month'],
  ['most', 'Most played'],
  ['artists', 'Top artists'],
  ['added', 'Added by month'],
  ['new', 'New records'],
  ['highlights', 'Highlights'],
] as const

export type ValueKey = (typeof VALUE_SECTIONS)[number][0]
export type YearKey = (typeof YEAR_SECTIONS)[number][0]
export type ListeningKey = (typeof LISTENING_SECTIONS)[number][0]
export type Side = 'left' | 'right'
export type Layout<K extends string = string> = { left: K[]; right: K[]; hidden: K[] }

// Drops anything unknown and puts sections added since the layout was saved at the end of the
// shorter column. A layout saved before there were columns is split in half.
export function normalize<K extends string>(saved: unknown, keys: readonly K[], defaults: Layout<K>): Layout<K> {
  const l = (saved ?? {}) as Partial<Layout<K>> & { order?: K[] }
  const known = (list: unknown) => (Array.isArray(list) ? list.filter((k): k is K => keys.includes(k)) : [])
  let left: K[] = known(l.left)
  let right: K[] = known(l.right).filter((k) => !left.includes(k))
  if (!l.left && !l.right && l.order) {
    const order = [...new Set(known(l.order))]
    const half = Math.ceil(order.length / 2)
    left = order.slice(0, half)
    right = order.slice(half)
  } else if (!l.left && !l.right) {
    left = [...defaults.left]
    right = [...defaults.right]
  }
  left = [...new Set(left)]
  right = [...new Set(right)]
  for (const k of keys) if (!left.includes(k) && !right.includes(k)) (left.length <= right.length ? left : right).push(k)
  return { left, right, hidden: [...new Set(known(l.hidden))] }
}

// Puts a section at a position in either column, shifting the ones after it
export function place<K extends string>(l: Layout<K>, key: K, side: Side, index: number): Layout<K> {
  const left = l.left.filter((k) => k !== key)
  const right = l.right.filter((k) => k !== key)
  const list = side === 'left' ? left : right
  if (index < 0 || index > list.length) return l
  list.splice(index, 0, key)
  return { ...l, left, right }
}

export const toggle = <K extends string>(l: Layout<K>, key: K): Layout<K> => ({
  ...l,
  hidden: l.hidden.includes(key) ? l.hidden.filter((k) => k !== key) : [...l.hidden, key],
})

export const sideOf = <K extends string>(l: Layout<K>, key: K): Side => (l.left.includes(key) ? 'left' : 'right')

// The sections shown in one column, in order
export const shown = <K extends string>(l: Layout<K>, side: Side): K[] => l[side].filter((k) => !l.hidden.includes(k))

export type LayoutStore<K extends string> = {
  pref: string
  sections: readonly (readonly [K, string])[]
  defaults: () => Layout<K>
  get: () => Layout<K>
  set: (l: Layout<K>) => void
  reload: () => void
  subscribe: (f: () => void) => () => void
}

function layoutStore<K extends string>(pref: string, sections: readonly (readonly [K, string])[], left: K[]): LayoutStore<K> {
  const keys = sections.map(([k]) => k)
  const defaults = (): Layout<K> => ({ left: [...left], right: keys.filter((k) => !left.includes(k)), hidden: [] })
  let current: Layout<K> | null = null
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((f) => f())
  return {
    pref,
    sections,
    defaults,
    get() {
      if (current) return current
      try {
        current = normalize(JSON.parse(readPref(pref) ?? 'null'), keys, defaults())
      } catch {
        current = defaults() // not valid JSON
      }
      return current
    },
    set(l) {
      current = l
      writePref(pref, JSON.stringify(l))
      notify()
    },
    // after another device's layout arrives
    reload() {
      current = null
      notify()
    },
    subscribe(f) {
      listeners.add(f)
      return () => listeners.delete(f)
    },
  }
}

export const valueLayout = layoutStore('platter.valueLayout', VALUE_SECTIONS, ['month', 'top', 'overTime'])
export const listeningLayout = layoutStore('platter.listeningLayout', LISTENING_SECTIONS, ['totals', 'month', 'most'])
export const yearLayout = layoutStore('platter.yearLayout', YEAR_SECTIONS, ['month', 'most', 'artists', 'added'])
export const LAYOUTS = [valueLayout, listeningLayout, yearLayout]
