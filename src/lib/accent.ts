// Accent colors the user can pick. The shades actually shown, per theme, are in index.css.
export const ACCENTS = [
  { id: 'amber', label: 'Amber' },
  { id: 'orange', label: 'Orange' },
  { id: 'rose', label: 'Rose' },
  { id: 'pink', label: 'Pink' },
  { id: 'violet', label: 'Violet' },
  { id: 'blue', label: 'Blue' },
  { id: 'sky', label: 'Sky' },
  { id: 'teal', label: 'Teal' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'lime', label: 'Lime' },
] as const

export type AccentId = (typeof ACCENTS)[number]['id']

const KEY = 'platter.accent'

export function getAccent(): AccentId {
  try {
    const v = localStorage.getItem(KEY)
    if (ACCENTS.some((a) => a.id === v)) return v as AccentId
  } catch {
    // storage blocked
  }
  return 'amber'
}

export function applyAccent(id: AccentId = getAccent()) {
  document.documentElement.dataset.accent = id
}

export function setAccent(id: AccentId) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // still applies for this visit
  }
  applyAccent(id)
}
