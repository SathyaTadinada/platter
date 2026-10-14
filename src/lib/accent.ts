// Accent colors the user can pick. Each one's 500 shade is light enough for the
// dark text used on accent buttons and chips.
export const ACCENTS = [
  { id: 'amber', label: 'Amber', swatch: '#f59e0b' },
  { id: 'orange', label: 'Orange', swatch: '#f97316' },
  { id: 'rose', label: 'Rose', swatch: '#f43f5e' },
  { id: 'pink', label: 'Pink', swatch: '#ec4899' },
  { id: 'violet', label: 'Violet', swatch: '#8b5cf6' },
  { id: 'blue', label: 'Blue', swatch: '#3b82f6' },
  { id: 'sky', label: 'Sky', swatch: '#0ea5e9' },
  { id: 'teal', label: 'Teal', swatch: '#14b8a6' },
  { id: 'lime', label: 'Lime', swatch: '#84cc16' },
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
