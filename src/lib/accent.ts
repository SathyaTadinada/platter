import { readChoice, writePref } from './prefs'

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

export const getAccent = () =>
  readChoice<AccentId>(
    KEY,
    ACCENTS.map((a) => a.id),
    'amber',
  )

export function applyAccent(id: AccentId = getAccent()) {
  document.documentElement.dataset.accent = id
}

export function setAccent(id: AccentId) {
  writePref(KEY, id)
  applyAccent(id)
}
