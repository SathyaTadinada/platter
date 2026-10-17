import { readChoice, removePref, writePref } from './prefs'

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
const DEMO_KEY = 'platter.accent.demo'
const SCOPE_KEY = 'platter.accentScope'
const DEFAULT: AccentId = 'amber'

// Your pick belongs to your account. The signed-out pages use the default, and so does
// each new demo, which keeps its own pick until it's left. The scope is remembered so the
// right color shows at launch, before the session has loaded.
type Scope = 'user' | 'demo' | 'none'
let scope = readChoice<Scope>(SCOPE_KEY, ['user', 'demo', 'none'], 'none')

export const getAccent = (): AccentId =>
  scope === 'none'
    ? DEFAULT
    : readChoice<AccentId>(
        scope === 'demo' ? DEMO_KEY : KEY,
        ACCENTS.map((a) => a.id),
        DEFAULT,
      )

export function setAccentScope(next: Scope) {
  if (next === scope) return
  scope = next
  writePref(SCOPE_KEY, next)
  applyAccent()
}

export const resetDemoAccent = () => removePref(DEMO_KEY)

export function applyAccent(id: AccentId = getAccent()) {
  document.documentElement.dataset.accent = id
}

export function setAccent(id: AccentId) {
  writePref(scope === 'demo' ? DEMO_KEY : KEY, id)
  applyAccent(id)
}
