import { readPref, writePref } from './prefs'

// Which sections of the Value view are shown, and in what order. Kept per device.

export const VALUE_SECTIONS = [
  ['month', 'By month'],
  ['top', 'Most valuable'],
  ['overTime', 'Over time'],
  ['paid', 'Paid vs now'],
  ['price', 'By price'],
  ['breakdown', 'Breakdown'],
] as const

export type SectionKey = (typeof VALUE_SECTIONS)[number][0]
export type Layout = { order: SectionKey[]; hidden: SectionKey[] }

const KEYS = VALUE_SECTIONS.map(([k]) => k) as SectionKey[]
export const defaultLayout = (): Layout => ({ order: [...KEYS], hidden: [] })

// Drops anything unknown and appends sections added since the layout was saved
export function normalize(l: Partial<Layout> | null | undefined): Layout {
  const order = (l?.order ?? []).filter((k): k is SectionKey => KEYS.includes(k as SectionKey))
  for (const k of KEYS) if (!order.includes(k)) order.push(k)
  const hidden = (l?.hidden ?? []).filter((k): k is SectionKey => KEYS.includes(k as SectionKey))
  return { order: [...new Set(order)], hidden: [...new Set(hidden)] }
}

// move a section to another position, shifting the ones in between
export function move(l: Layout, key: SectionKey, to: number): Layout {
  const order = l.order.filter((k) => k !== key)
  if (order.length === l.order.length || to < 0 || to > order.length) return l
  order.splice(to, 0, key)
  return { ...l, order }
}

export const toggle = (l: Layout, key: SectionKey): Layout => ({
  ...l,
  hidden: l.hidden.includes(key) ? l.hidden.filter((k) => k !== key) : [...l.hidden, key],
})

const STORE = 'platter.valueLayout'
let current: Layout | null = null
const listeners = new Set<() => void>()

export function getLayout(): Layout {
  if (current) return current
  try {
    current = normalize(JSON.parse(readPref(STORE) ?? 'null'))
  } catch {
    current = defaultLayout() // not valid JSON
  }
  return current
}

export function setLayout(l: Layout) {
  current = l
  writePref(STORE, JSON.stringify(l))
  listeners.forEach((f) => f())
}

export function subscribeLayout(f: () => void) {
  listeners.add(f)
  return () => listeners.delete(f)
}
