// Which sections of the Value view are shown, and in what order. Kept per device.

export const VALUE_SECTIONS = [
  ['overTime', 'Over time'],
  ['paid', 'Paid vs now'],
  ['month', 'By month'],
  ['top', 'Most valuable'],
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

export function move(l: Layout, key: SectionKey, by: -1 | 1): Layout {
  const order = [...l.order]
  const i = order.indexOf(key)
  const j = i + by
  if (i < 0 || j < 0 || j >= order.length) return l
  ;[order[i], order[j]] = [order[j], order[i]]
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
    current = normalize(JSON.parse(localStorage.getItem(STORE) ?? 'null'))
  } catch {
    current = defaultLayout()
  }
  return current
}

export function setLayout(l: Layout) {
  current = l
  try {
    localStorage.setItem(STORE, JSON.stringify(l))
  } catch {
    // still applies until reload
  }
  listeners.forEach((f) => f())
}

export function subscribeLayout(f: () => void) {
  listeners.add(f)
  return () => listeners.delete(f)
}
